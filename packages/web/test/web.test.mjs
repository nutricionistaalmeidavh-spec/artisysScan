import assert from 'node:assert/strict';
import test from 'node:test';

import { assessWebResponse, createWebScanPlan, runWebScan } from '../src/index.ts';

test('web scanner flags missing browser protections, insecure cookies and leakage', () => {
  const findings = assessWebResponse('https://app.example.test', {
    status: 200,
    headers: {
      'content-type': 'text/html',
      'set-cookie': ['sid=abc; Path=/'],
      'server': 'nginx/1.25.0',
    },
    body: 'Error: boom at /home/app/src/server.js:42:7',
  });

  const ids = findings.map((finding) => finding.ruleId);
  assert.ok(ids.includes('ARTISYS-WEB-CSP-001'));
  assert.ok(ids.includes('ARTISYS-WEB-HSTS-001'));
  assert.ok(ids.includes('ARTISYS-WEB-COOKIE-SECURE-001'));
  assert.ok(ids.includes('ARTISYS-WEB-COOKIE-HTTPONLY-001'));
  assert.ok(ids.includes('ARTISYS-WEB-COOKIE-SAMESITE-001'));
  assert.ok(ids.includes('ARTISYS-WEB-LEAK-001'));
});

test('active reflection probe is opt-in and safe plan is default', () => {
  const passive = createWebScanPlan('https://app.example.test');
  assert.equal(passive.some((probe) => probe.kind === 'reflection'), false);

  const active = createWebScanPlan('https://app.example.test', { allowActive: true });
  assert.equal(active.some((probe) => probe.kind === 'reflection'), true);
});

test('runWebScan uses injectable transport and reports reflected marker', async () => {
  const report = await runWebScan('https://app.example.test', {
    allowActive: true,
    transport: async (request) => ({
      status: 200,
      headers: {
        'content-security-policy': "default-src 'self'",
        'strict-transport-security': 'max-age=31536000',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
      body: request.url.includes('ARTISYS_REFLECT_') ? request.url : '<html>ok</html>',
    }),
  });

  assert.equal(report.complete, true);
  assert.equal(report.findings.some((finding) => finding.ruleId === 'ARTISYS-WEB-XSS-REFLECT-001'), true);
});
