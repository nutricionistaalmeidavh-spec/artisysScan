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

test('loopback disposable HTTP is not treated as insecure transport', () => {
  const findings = assessWebResponse('http://127.0.0.1:4173/commercial/', {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html>local staging</html>',
  });
  assert.equal(findings.some((finding) => finding.ruleId === 'ARTISYS-WEB-HTTPS-001'), false);
});

test('non-loopback HTTP remains a high-severity finding', () => {
  const findings = assessWebResponse('http://app.example.test', {
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: '<html>remote</html>',
  });
  assert.equal(findings.some((finding) => finding.ruleId === 'ARTISYS-WEB-HTTPS-001'), true);
});

test('web scanner identifies CSRF-review forms and upload surfaces', () => {
  const findings = assessWebResponse('https://app.example.test', {
    status: 200,
    headers: {
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
    body: '<form method="post"><input type="file" name="doc"><button>Send</button></form>',
  });
  const ids = findings.map((finding) => finding.ruleId);
  assert.ok(ids.includes('ARTISYS-WEB-CSRF-HEURISTIC-001'));
  assert.ok(ids.includes('ARTISYS-WEB-UPLOAD-SURFACE-001'));
});

test('active reflection probe is opt-in and safe plan is default', () => {
  const passive = createWebScanPlan('https://app.example.test');
  assert.equal(passive.some((probe) => probe.kind === 'reflection'), false);
  assert.equal(passive.some((probe) => probe.kind === 'cors'), true);

  const active = createWebScanPlan('https://app.example.test', { allowActive: true });
  assert.equal(active.some((probe) => probe.kind === 'reflection'), true);
});

test('runWebScan reports reflected untrusted CORS origin and XSS marker', async () => {
  const report = await runWebScan('https://app.example.test', {
    allowActive: true,
    transport: async (request) => ({
      status: 200,
      headers: {
        'content-security-policy': "default-src 'self'",
        'strict-transport-security': 'max-age=31536000',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        ...(request.kind === 'cors' ? {
          'access-control-allow-origin': 'https://artisys-untrusted.invalid',
          'access-control-allow-credentials': 'true',
        } : {}),
      },
      body: request.url.includes('ARTISYS_REFLECT_') ? request.url : '<html>ok</html>',
    }),
  });

  assert.equal(report.complete, true);
  assert.equal(report.findings.some((finding) => finding.ruleId === 'ARTISYS-WEB-XSS-REFLECT-001'), true);
  assert.equal(report.findings.some((finding) => finding.ruleId === 'ARTISYS-WEB-CORS-001'), true);
});
