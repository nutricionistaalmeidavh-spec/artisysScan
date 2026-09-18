import {
  defaultHttpTransport,
  isStateChanging,
  isSuccess,
  joinUrl,
  type AccessPolicyV1,
  type HttpMethod,
  type HttpResponse,
  type HttpTransport,
} from '../../access-control/src/index.js';

export type ApiCaseKind = 'anonymous' | 'invalid-token' | 'invalid-input' | 'rate-limit';

export interface ApiCase {
  id: string;
  endpointId: string;
  kind: ApiCaseKind;
  method: HttpMethod;
  url: string;
  expected: 'allow' | 'deny' | 'reject-input' | 'rate-limit';
  stateChanging: boolean;
  headers?: Record<string, string>;
  body?: unknown;
  repeat?: number;
}

export interface ApiFinding {
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  endpointId: string;
  caseId: string;
  status: number;
}

export interface ApiScanReport {
  complete: boolean;
  passed: boolean;
  findings: ApiFinding[];
  executed: number;
  skipped: number;
  errors: string[];
}

export function createApiCases(policy: AccessPolicyV1): ApiCase[] {
  const cases: ApiCase[] = [];
  for (const endpoint of policy.api?.endpoints ?? []) {
    const url = joinUrl(policy.baseUrl, endpoint.path);
    const stateChanging = isStateChanging(endpoint.method);
    if (endpoint.auth === 'required') {
      cases.push({ id: `${endpoint.id}:anonymous`, endpointId: endpoint.id, kind: 'anonymous', method: endpoint.method, url, expected: 'deny', stateChanging, ...(endpoint.body !== undefined ? { body: endpoint.body } : {}) });
      cases.push({ id: `${endpoint.id}:invalid-token`, endpointId: endpoint.id, kind: 'invalid-token', method: endpoint.method, url, expected: 'deny', stateChanging, headers: { authorization: 'Bearer ARTISYS_INVALID_TOKEN' }, ...(endpoint.body !== undefined ? { body: endpoint.body } : {}) });
    }
    if (endpoint.invalidBody !== undefined) {
      cases.push({ id: `${endpoint.id}:invalid-input`, endpointId: endpoint.id, kind: 'invalid-input', method: endpoint.method, url, expected: 'reject-input', stateChanging, body: endpoint.invalidBody });
    }
    if (endpoint.rateLimitProbe) {
      cases.push({ id: `${endpoint.id}:rate-limit`, endpointId: endpoint.id, kind: 'rate-limit', method: endpoint.method, url, expected: 'rate-limit', stateChanging, repeat: endpoint.rateLimitProbe, ...(endpoint.body !== undefined ? { body: endpoint.body } : {}) });
    }
  }
  return cases;
}

export function evaluateApiCase(testCase: ApiCase, response: HttpResponse): ApiFinding | undefined {
  if ((testCase.kind === 'anonymous' || testCase.kind === 'invalid-token') && isSuccess(response.status)) {
    return {
      ruleId: testCase.kind === 'anonymous' ? 'ARTISYS-API-AUTH-001' : 'ARTISYS-API-AUTH-002',
      severity: 'critical',
      message: `Protected endpoint accepted ${testCase.kind === 'anonymous' ? 'anonymous access' : 'an invalid bearer token'}.`,
      endpointId: testCase.endpointId,
      caseId: testCase.id,
      status: response.status,
    };
  }
  if (testCase.kind === 'invalid-input' && isSuccess(response.status)) {
    return {
      ruleId: 'ARTISYS-API-INPUT-001', severity: 'high',
      message: 'Endpoint accepted the configured invalid payload.', endpointId: testCase.endpointId,
      caseId: testCase.id, status: response.status,
    };
  }
  return undefined;
}

function hasRateLimitEvidence(responses: HttpResponse[]): boolean {
  return responses.some((response) => response.status === 429 || Object.keys(response.headers).some((key) => key.toLowerCase() === 'retry-after'));
}

export async function runApiScan(policy: AccessPolicyV1, options: {
  transport?: HttpTransport;
  allowStateChange?: boolean;
} = {}): Promise<ApiScanReport> {
  const transport = options.transport ?? defaultHttpTransport;
  const findings: ApiFinding[] = [];
  const errors: string[] = [];
  let executed = 0;
  let skipped = 0;

  for (const testCase of createApiCases(policy)) {
    if (testCase.stateChanging && !options.allowStateChange) {
      skipped += 1;
      continue;
    }
    try {
      const responses: HttpResponse[] = [];
      const repeat = testCase.repeat ?? 1;
      for (let index = 0; index < repeat; index += 1) {
        responses.push(await transport({
          method: testCase.method,
          url: testCase.url,
          kind: testCase.kind,
          ...(testCase.headers ? { headers: testCase.headers } : {}),
          ...(testCase.body !== undefined ? { body: testCase.body } : {}),
        }));
        executed += 1;
      }
      if (testCase.kind === 'rate-limit') {
        if (!hasRateLimitEvidence(responses)) {
          const last = responses.at(-1);
          findings.push({
            ruleId: 'ARTISYS-API-RATE-001', severity: 'medium',
            message: `No rate-limit response or Retry-After header observed in ${repeat} configured requests.`,
            endpointId: testCase.endpointId, caseId: testCase.id, status: last?.status ?? 0,
          });
        }
      } else {
        const finding = responses[0] ? evaluateApiCase(testCase, responses[0]) : undefined;
        if (finding) findings.push(finding);
      }
    } catch (error) {
      errors.push(`${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const complete = errors.length === 0 && skipped === 0;
  return { complete, passed: complete && findings.length === 0, findings, executed, skipped, errors };
}
