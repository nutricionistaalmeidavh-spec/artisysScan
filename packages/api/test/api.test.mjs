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
        id: 'profile', method: 'GET', path: '/api/profile', auth: 'required',
        invalidBody: { email: 42 }, rateLimitProbe: 3,
      },
    ],
  },
};

test('API scanner creates anonymous, invalid-token, invalid-input and rate-limit cases', () => {
  const cases = createApiCases(policy);
  assert.deepEqual(new Set(cases.map((item) => item.kind)), new Set([
    'anonymous', 'invalid-token', 'invalid-input', 'rate-limit',
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

test('runApiScan is transport-driven and reports incomplete only on transport errors', async () => {
  const report = await runApiScan(policy, {
    transport: async (request) => ({
      status: request.headers?.authorization === 'Bearer ARTISYS_INVALID_TOKEN' ? 401 : 200,
      headers: request.kind === 'rate-limit' ? { 'retry-after': '60' } : {},
      body: '{}',
    }),
  });

  assert.equal(report.complete, true);
  assert.equal(report.passed, false);
  assert.ok(report.findings.some((finding) => finding.ruleId === 'ARTISYS-API-AUTH-001'));
});
