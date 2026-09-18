import assert from 'node:assert/strict';
import test from 'node:test';

import { createTenantCases, evaluateTenantCase } from '../src/index.ts';

const policy = {
  schema: 1,
  baseUrl: 'https://app.example.test',
  actors: [
    { id: 'user-a', role: 'user', tokenEnv: 'TOKEN_A', tenant: 'tenant-a' },
    { id: 'user-b', role: 'user', tokenEnv: 'TOKEN_B', tenant: 'tenant-b' },
  ],
  actions: [],
  tenant: {
    resources: {
      'tenant-a': { order: 'order-a' },
      'tenant-b': { order: 'order-b' },
    },
    routes: [
      { id: 'order.read', method: 'GET', path: '/api/tenants/{tenantId}/orders/{resourceId}', resourceKey: 'order' },
      { id: 'order.delete', method: 'DELETE', path: '/api/tenants/{tenantId}/orders/{resourceId}', resourceKey: 'order' },
    ],
  },
};

test('tenant engine generates A-to-B and B-to-A isolation cases', () => {
  const cases = createTenantCases(policy);
  assert.ok(cases.some((item) => item.sourceTenant === 'tenant-a' && item.targetTenant === 'tenant-b'));
  assert.ok(cases.some((item) => item.sourceTenant === 'tenant-b' && item.targetTenant === 'tenant-a'));
  assert.ok(cases.some((item) => item.url.includes('/tenant-b/orders/order-b')));
});

test('cross-tenant read success is critical', () => {
  const finding = evaluateTenantCase({
    id: 'a-b-order', actorId: 'user-a', sourceTenant: 'tenant-a', targetTenant: 'tenant-b',
    routeId: 'order.read', method: 'GET', url: 'https://app.example.test/api/tenants/tenant-b/orders/order-b',
    stateChanging: false,
  }, { status: 200, headers: {}, body: '{"id":"order-b"}' });

  assert.equal(finding?.ruleId, 'ARTISYS-TENANT-001');
  assert.equal(finding?.severity, 'critical');
});

test('cross-tenant delete is marked state-changing', () => {
  const cases = createTenantCases(policy);
  assert.equal(cases.find((item) => item.routeId === 'order.delete')?.stateChanging, true);
});
