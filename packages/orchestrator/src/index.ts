import { type AccessPolicyV1 } from '../../access-control/src/index.js';
import { runAdminScan, type AdminReport } from '../../admin/src/index.js';
import { runApiScan, type ApiScanReport } from '../../api/src/index.js';
import { runQa, type RunQaOptions } from '../../qa/src/index.js';
import type { QaReport } from '../../qa/src/types.js';
import { runRbacScan, type RbacReport } from '../../rbac/src/index.js';
import { runTenantScan, type TenantReport } from '../../tenant/src/index.js';
import { runWebScan, type WebScanReport } from '../../web/src/index.js';

export interface HomologationConfig {
  baseUrl: string;
  policy: AccessPolicyV1;
  projectRoot?: string;
  outputDir?: string;
  allowActive?: boolean;
  allowStateChange?: boolean;
  allowProjectExecution?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface HomologationStages {
  web: WebScanReport;
  api: ApiScanReport;
  rbac: RbacReport;
  tenant: TenantReport;
  admin: AdminReport;
  qa?: QaReport;
}

export interface HomologationReport {
  complete: boolean;
  passed: boolean;
  executed: Array<keyof HomologationStages>;
  stages: HomologationStages;
}

export interface HomologationRunners {
  web: typeof runWebScan;
  api: typeof runApiScan;
  rbac: typeof runRbacScan;
  tenant: typeof runTenantScan;
  admin: typeof runAdminScan;
  qa: typeof runQa;
}

export interface RunHomologationOptions {
  runners?: Partial<HomologationRunners>;
}

const DEFAULT_RUNNERS: HomologationRunners = {
  web: runWebScan,
  api: runApiScan,
  rbac: runRbacScan,
  tenant: runTenantScan,
  admin: runAdminScan,
  qa: runQa,
};

export async function runHomologation(
  config: HomologationConfig,
  options: RunHomologationOptions = {},
): Promise<HomologationReport> {
  const runners: HomologationRunners = { ...DEFAULT_RUNNERS, ...options.runners };
  const allowStateChange = config.allowStateChange ?? false;
  const env = config.env ?? process.env;

  const web = await runners.web(config.baseUrl, { allowActive: config.allowActive ?? false });
  const api = await runners.api(config.policy, { allowStateChange, env });
  const rbac = await runners.rbac(config.policy, { allowStateChange, env });
  const tenant = await runners.tenant(config.policy, { allowStateChange, env });
  const admin = await runners.admin(config.policy, { allowStateChange, env });

  const stages: HomologationStages = { web, api, rbac, tenant, admin };
  const executed: Array<keyof HomologationStages> = ['web', 'api', 'rbac', 'tenant', 'admin'];

  if (config.projectRoot) {
    const qaOptions: RunQaOptions = {
      allowProjectExecution: config.allowProjectExecution ?? false,
      ...(config.outputDir ? { outputDir: config.outputDir } : {}),
    };
    stages.qa = await runners.qa(config.projectRoot, qaOptions);
    executed.push('qa');
  }

  const reports = executed.map((name) => stages[name]).filter((value): value is NonNullable<typeof value> => Boolean(value));
  const complete = reports.every((report) => report.complete);
  const passed = complete && reports.every((report) => report.passed);

  return { complete, passed, executed, stages };
}
