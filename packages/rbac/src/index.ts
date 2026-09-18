import {
  defaultHttpTransport,
  isStateChanging,
  isSuccess,
  joinUrl,
  resolveActorHeaders,
  type AccessPolicyV1,
  type HttpMethod,
  type HttpResponse,
  type HttpTransport,
} from '../../access-control/src/index.js';

export interface RbacCase {
  id: string;
  actorId: string;
  role: string;
  actionId: string;
  method: HttpMethod;
  url: string;
  expected: 'allow' | 'deny';
  stateChanging: boolean;
  body?: unknown;
}

export interface RbacFinding {
  ruleId: string;
  severity: 'medium' | 'critical';
  message: string;
  actorId: string;
  role: string;
  actionId: string;
  status: number;
}

export interface RbacReport {
  complete: boolean;
  passed: boolean;
  findings: RbacFinding[];
  executed: number;
  skipped: number;
  errors: string[];
}

export function createRbacCases(policy: AccessPolicyV1): RbacCase[] {
  return policy.actors.flatMap((actor) => policy.actions.map((action): RbacCase => ({
    id: `${actor.id}:${action.id}`,
    actorId: actor.id,
    role: actor.role,
    actionId: action.id,
    method: action.method,
    url: joinUrl(policy.baseUrl, action.path),
    expected: action.allowRoles.includes(actor.role) ? 'allow' : 'deny',
    stateChanging: isStateChanging(action.method),
    ...(action.body !== undefined ? { body: action.body } : {}),
  })));
}

export function evaluateRbacCase(testCase: RbacCase, response: HttpResponse): RbacFinding | undefined {
  if (testCase.expected === 'deny' && isSuccess(response.status)) {
    return {
      ruleId: 'ARTISYS-RBAC-001', severity: 'critical',
      message: 'Role received a successful response for an action explicitly denied by the RBAC matrix.',
      actorId: testCase.actorId, role: testCase.role, actionId: testCase.actionId, status: response.status,
    };
  }
  if (testCase.expected === 'allow' && [401, 403].includes(response.status)) {
    return {
      ruleId: 'ARTISYS-RBAC-MATRIX-002', severity: 'medium',
      message: 'Role configured as allowed was rejected; policy and implementation may be inconsistent.',
      actorId: testCase.actorId, role: testCase.role, actionId: testCase.actionId, status: response.status,
    };
  }
  return undefined;
}

export async function runRbacScan(policy: AccessPolicyV1, options: {
  transport?: HttpTransport;
  allowStateChange?: boolean;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<RbacReport> {
  const transport = options.transport ?? defaultHttpTransport;
  const env = options.env ?? process.env;
  const findings: RbacFinding[] = [];
  const errors: string[] = [];
  let executed = 0;
  let skipped = 0;

  for (const testCase of createRbacCases(policy)) {
    if (testCase.stateChanging && !options.allowStateChange) {
      skipped += 1;
      continue;
    }
    const actor = policy.actors.find((item) => item.id === testCase.actorId);
    if (!actor) {
      errors.push(`${testCase.id}: actor not found`);
      continue;
    }
    try {
      const headers = resolveActorHeaders(actor, env);
      const response = await transport({
        method: testCase.method,
        url: testCase.url,
        headers,
        kind: 'rbac',
        ...(testCase.body !== undefined ? { body: testCase.body } : {}),
      });
      executed += 1;
      const finding = evaluateRbacCase(testCase, response);
      if (finding) findings.push(finding);
    } catch (error) {
      errors.push(`${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const complete = errors.length === 0 && skipped === 0;
  return { complete, passed: complete && findings.length === 0, findings, executed, skipped, errors };
}
