import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminCases, evaluateAdminCase, evaluateAuditCheck, runAdminScan } from '../src/index.ts';

const policy = {
  schema: 1,
  baseUrl: 'https://app.example.test',
  actors: [
    { id: 'admin', role: 'admin', tokenEnv: 'TOKEN_ADMIN' },
    { id: 'owner', role: 'owner', tokenEnv: 'TOKEN_OWNER' },
    { id: 'superadmin', role: 'superadmin', tokenEnv: 'TOKEN_SUPERADMIN' },
  ],
  actions: [
    {
      id: 'licenses.write', method: 'PATCH', path: '/api/superadmin/licenses',
      allowRoles: ['superadmin'], privileged: true,
      body: { status: 'active' },
      auditCheck: { method: 'GET', path: '/api/superadmin/audit?limit=20' },
    },
  ],
};

test('admin engine targets every non-allowed actor against privileged actions', () => {
  const cases = createAdminCases(policy);
  assert.ok(cases.some((item) => item.actorId === 'admin'));
  assert.ok(cases.some((item) => item.actorId === 'owner'));
  assert.equal(cases.some((item) => item.actorId === 'superadmin'), false);
});

test('ordinary admin reaching superadmin action is critical', () => {
  const finding = evaluateAdminCase({
    id: 'admin:licenses.write', actorId: 'admin', role: 'admin', actionId: 'licenses.write',
    method: 'PATCH', url: 'https://app.example.test/api/superadmin/licenses', stateChanging: true,
  }, { status: 200, headers: {}, body: '{}' });

  assert.equal(finding?.ruleId, 'ARTISYS-SA-001');
  assert.equal(finding?.severity, 'critical');
});

test('missing audit evidence after privileged action is reported', () => {
  const finding = evaluateAuditCheck('licenses.write', { status: 200, headers: {}, body: '[]' }, 'superadmin');
  assert.equal(finding?.ruleId, 'ARTISYS-SA-007');
  assert.equal(finding?.severity, 'high');
});

test('runAdminScan verifies configured audit trail when state-changing checks are authorized', async () => {
  const report = await runAdminScan(policy, {
    allowStateChange: true,
    env: { TOKEN_ADMIN: 'a', TOKEN_OWNER: 'o', TOKEN_SUPERADMIN: 's' },
    transport: async (request) => {
      if (request.kind === 'admin-boundary') return { status: 403, headers: {}, body: '{}' };
      if (request.kind === 'admin-audit-action') return { status: 200, headers: {}, body: '{}' };
      return { status: 200, headers: {}, body: '[]' };
    },
  });
  assert.equal(report.complete, true);
  assert.ok(report.findings.some((finding) => finding.ruleId === 'ARTISYS-SA-007'));
});
