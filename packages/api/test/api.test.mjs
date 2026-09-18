import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiCases, evaluateApiCase, runApiScan } from '../src/index.ts';

const policy = {
  schema: 1,
  baseUrl: 'https://api.example.test',
  actors: [
    { id: 'user', role: 'user', tokenEnv: 'TOKEN_USER' },
  ],
  actions: [],
  api: {
    endpoints: [
      {
        id: 'profile', method: 'GET', path: '/api/profile', auth: 'required', actorId: 'user',
        invalidBody: { email: 42 }, rateLimitProbe: 3,
        bolaPath: '/api/users/other-user',
        massAssignmentBody: { role: 'superadmin' },
      },
    ],
  },
};

test('API scanner creates auth, input, rate-limit, BOLA and mass-assignment cases', () => {
  const cases = createApiCases(policy);
  assert.deepEqual(new Set(cases.map((item) => item.kind)), new Set([
    'anonymous', 'invalid-token', 'invalid-input', 'rate-limit', 'bola', 'mass-assignment',
  ]));
});

test('protected API accepting anonymous access is a critical finding', () => {
  const finding = evaluateApiCase({
    id: 'profile:anonymous', endpointId: 'profile', kind: 'anonymous', method: 'GET',
    url: 'https://api.example.test/api/profile', expected: 'deny', stateChanging: false,
  }, { status: 200, headers: {}, body: '{}' });

  assert.equal(finding?.ruleId, 'ARTISYS-API-AUTH-001');
  assert.equal(finding?.severity, 'critical');
});

test('BOLA success and mass assignment success are security findings', () => {
  const bola = evaluateApiCase({
    id: 'profile:bola', endpointId: 'profile', kind: 'bola', method: 'GET',
    url: 'https://api.example.test/api/users/other-user', expected: 'deny', stateChanging: false,
    actorId: 'user',
  }, { status: 200, headers: {}, body: '{}' });
  assert.equal(bola?.ruleId, 'ARTISYS-API-BOLA-001');
  assert.equal(bola?.severity, 'critical');

  const mass = evaluateApiCase({
    id: 'profile:mass', endpointId: 'profile', kind: 'mass-assignment', method: 'PATCH',
    url: 'https://api.example.test/api/profile', expected: 'reject-input', stateChanging: true,
    actorId: 'user', body: { role: 'superadmin' },
  }, { status: 200, headers: {}, body: '{}' });
  assert.equal(mass?.ruleId, 'ARTISYS-API-MASS-001');
  assert.equal(mass?.severity, 'high');
});

test('runApiScan is transport-driven and reports auth findings', async () => {
  const report = await runApiScan(policy, {
    allowStateChange: true,
    env: { TOKEN_USER: 'demo-token' },
    transport: async (request) => ({
      status: request.kind === 'anonymous' ? 200
        : request.kind === 'invalid-token' ? 401
          : request.kind === 'bola' ? 403
            : request.kind === 'mass-assignment' ? 400
              : request.kind === 'invalid-input' ? 400
                : 429,
      headers: request.kind === 'rate-limit' ? { 'retry-after': '60' } : {},
      body: '{}',
    }),
  });

  assert.equal(report.complete, true);
  assert.equal(report.passed, false);
  assert.ok(report.findings.some((finding) => finding.ruleId === 'ARTISYS-API-AUTH-001'));
});
