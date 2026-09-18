import {
  defaultHttpTransport,
  isStateChanging,
  isSuccess,
  joinUrl,
  resolveActorHeaders,
  substituteTemplate,
  type AccessPolicyV1,
  type HttpMethod,
  type HttpResponse,
  type HttpTransport,
} from '../../access-control/src/index.js';

export interface TenantCase {
  id: string;
  actorId: string;
  sourceTenant: string;
  targetTenant: string;
  routeId: string;
  method: HttpMethod;
  url: string;
  stateChanging: boolean;
  body?: unknown;
}

export interface TenantFinding {
  ruleId: string;
  severity: 'critical';
  message: string;
  actorId: string;
  sourceTenant: string;
  targetTenant: string;
  routeId: string;
  status: number;
}

export interface TenantReport {
  complete: boolean;
  passed: boolean;
  findings: TenantFinding[];
  executed: number;
  skipped: number;
  errors: string[];
}

function ruleForMethod(method: HttpMethod): string {
  if (method === 'GET' || method === 'HEAD') return 'ARTISYS-TENANT-001';
  if (method === 'POST') return 'ARTISYS-TENANT-002';
  if (method === 'PUT' || method === 'PATCH') return 'ARTISYS-TENANT-003';
  if (method === 'DELETE') return 'ARTISYS-TENANT-004';
  return 'ARTISYS-TENANT-005';
}

export function createTenantCases(policy: AccessPolicyV1): TenantCase[] {
  if (!policy.tenant) return [];
  const actorsByTenant = policy.actors.filter((actor) => actor.tenant);
  const tenantIds = Object.keys(policy.tenant.resources);
  const cases: TenantCase[] = [];

  for (const actor of actorsByTenant) {
    const sourceTenant = actor.tenant as string;
    for (const targetTenant of tenantIds) {
      if (targetTenant === sourceTenant) continue;
      const targetResources = policy.tenant.resources[targetTenant] ?? {};
      for (const route of policy.tenant.routes) {
        const variables: Record<string, string> = { tenantId: targetTenant };
        if (route.resourceKey) {
          const resourceId = targetResources[route.resourceKey];
          if (!resourceId) continue;
          variables.resourceId = resourceId;
        }
        const path = substituteTemplate(route.path, variables);
        const body = route.body === undefined ? undefined : substituteTemplate(route.body, variables);
        cases.push({
          id: `${actor.id}:${sourceTenant}->${targetTenant}:${route.id}`,
          actorId: actor.id,
          sourceTenant,
          targetTenant,
          routeId: route.id,
          method: route.method,
          url: joinUrl(policy.baseUrl, path),
          stateChanging: isStateChanging(route.method),
          ...(body !== undefined ? { body } : {}),
        });
      }
    }
  }
  return cases;
}

export function evaluateTenantCase(testCase: TenantCase, response: HttpResponse): TenantFinding | undefined {
  if (!isSuccess(response.status)) return undefined;
  return {
    ruleId: ruleForMethod(testCase.method),
    severity: 'critical',
    message: `Actor from ${testCase.sourceTenant} successfully accessed a resource belonging to ${testCase.targetTenant}.`,
    actorId: testCase.actorId,
    sourceTenant: testCase.sourceTenant,
    targetTenant: testCase.targetTenant,
    routeId: testCase.routeId,
    status: response.status,
  };
}

export async function runTenantScan(policy: AccessPolicyV1, options: {
  transport?: HttpTransport;
  allowStateChange?: boolean;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<TenantReport> {
  const transport = options.transport ?? defaultHttpTransport;
  const env = options.env ?? process.env;
  const findings: TenantFinding[] = [];
  const errors: string[] = [];
  let executed = 0;
  let skipped = 0;

  for (const testCase of createTenantCases(policy)) {
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
        kind: 'tenant',
        ...(testCase.body !== undefined ? { body: testCase.body } : {}),
      });
      executed += 1;
      const finding = evaluateTenantCase(testCase, response);
      if (finding) findings.push(finding);
    } catch (error) {
      errors.push(`${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const complete = errors.length === 0 && skipped === 0;
  return { complete, passed: complete && findings.length === 0, findings, executed, skipped, errors };
}
