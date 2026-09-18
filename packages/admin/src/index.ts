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

export interface AdminCase {
  id: string;
  actorId: string;
  role: string;
  actionId: string;
  method: HttpMethod;
  url: string;
  stateChanging: boolean;
  body?: unknown;
}

export interface AdminFinding {
  ruleId: string;
  severity: 'high' | 'critical';
  message: string;
  actionId: string;
  actorId?: string;
  role?: string;
  status: number;
}

export interface AdminReport {
  complete: boolean;
  passed: boolean;
  findings: AdminFinding[];
  executed: number;
  skipped: number;
  errors: string[];
}

export function createAdminCases(policy: AccessPolicyV1): AdminCase[] {
  const privileged = policy.actions.filter((action) => action.privileged);
  return privileged.flatMap((action) => policy.actors
    .filter((actor) => !action.allowRoles.includes(actor.role))
    .map((actor): AdminCase => ({
      id: `${actor.id}:${action.id}`,
      actorId: actor.id,
      role: actor.role,
      actionId: action.id,
      method: action.method,
      url: joinUrl(policy.baseUrl, action.path),
      stateChanging: isStateChanging(action.method),
      ...(action.body !== undefined ? { body: action.body } : {}),
    })));
}

export function evaluateAdminCase(testCase: AdminCase, response: HttpResponse): AdminFinding | undefined {
  if (!isSuccess(response.status)) return undefined;
  return {
    ruleId: 'ARTISYS-SA-001',
    severity: 'critical',
    message: `Role ${testCase.role} successfully reached a privileged action reserved for higher privilege.`,
    actionId: testCase.actionId,
    actorId: testCase.actorId,
    role: testCase.role,
    status: response.status,
  };
}

export function evaluateAuditCheck(actionId: string, response: HttpResponse, actorId: string): AdminFinding | undefined {
  if (!isSuccess(response.status)) {
    return {
      ruleId: 'ARTISYS-SA-007', severity: 'high',
      message: 'Audit endpoint did not return a successful response after privileged action.',
      actionId, actorId, status: response.status,
    };
  }
  if (!response.body.includes(actorId)) {
    return {
      ruleId: 'ARTISYS-SA-007', severity: 'high',
      message: 'Audit evidence for the privileged actor was not found in the configured audit response.',
      actionId, actorId, status: response.status,
    };
  }
  return undefined;
}

export async function runAdminScan(policy: AccessPolicyV1, options: {
  transport?: HttpTransport;
  allowStateChange?: boolean;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<AdminReport> {
  const transport = options.transport ?? defaultHttpTransport;
  const env = options.env ?? process.env;
  const findings: AdminFinding[] = [];
  const errors: string[] = [];
  let executed = 0;
  let skipped = 0;

  for (const testCase of createAdminCases(policy)) {
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
      const response = await transport({
        method: testCase.method,
        url: testCase.url,
        headers: resolveActorHeaders(actor, env),
        kind: 'admin-boundary',
        ...(testCase.body !== undefined ? { body: testCase.body } : {}),
      });
      executed += 1;
      const finding = evaluateAdminCase(testCase, response);
      if (finding) findings.push(finding);
    } catch (error) {
      errors.push(`${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const action of policy.actions.filter((item) => item.privileged && item.auditCheck)) {
    const allowedActor = policy.actors.find((actor) => action.allowRoles.includes(actor.role));
    if (!allowedActor) {
      errors.push(`${action.id}: no allowed actor configured for audit verification`);
      continue;
    }
    if (isStateChanging(action.method) && !options.allowStateChange) {
      skipped += 1;
      continue;
    }
    try {
      const headers = resolveActorHeaders(allowedActor, env);
      const actionResponse = await transport({
        method: action.method,
        url: joinUrl(policy.baseUrl, action.path),
        headers,
        kind: 'admin-audit-action',
        ...(action.body !== undefined ? { body: action.body } : {}),
      });
      executed += 1;
      if (!isSuccess(actionResponse.status)) {
        errors.push(`${action.id}: allowed privileged actor could not execute action for audit verification (status ${actionResponse.status})`);
        continue;
      }
      const auditCheck = action.auditCheck;
      if (!auditCheck) continue;
      const auditResponse = await transport({
        method: auditCheck.method,
        url: joinUrl(policy.baseUrl, auditCheck.path),
        headers,
        kind: 'admin-audit-check',
      });
      executed += 1;
      const auditFinding = evaluateAuditCheck(action.id, auditResponse, allowedActor.id);
      if (auditFinding) findings.push(auditFinding);
    } catch (error) {
      errors.push(`${action.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const complete = errors.length === 0 && skipped === 0;
  return { complete, passed: complete && findings.length === 0, findings, executed, skipped, errors };
}
