import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAccessPolicy, substituteTemplate } from '../src/index.ts';

test('access policy accepts env-backed actors and rejects inline secrets', () => {
  const valid = validateAccessPolicy({
    schema: 1,
    baseUrl: 'https://app.example.test',
    actors: [
      { id: 'user-a', role: 'user', tokenEnv: 'ARTISYS_TOKEN_USER_A', tenant: 'tenant-a' },
      { id: 'superadmin', role: 'superadmin', tokenEnv: 'ARTISYS_TOKEN_SUPERADMIN' },
    ],
    actions: [
      { id: 'orders.read', method: 'GET', path: '/api/orders', allowRoles: ['user', 'admin', 'owner', 'superadmin'] },
      { id: 'licenses.write', method: 'PATCH', path: '/api/superadmin/licenses', allowRoles: ['superadmin'], privileged: true },
    ],
  });
  assert.equal(valid.actors[0].tokenEnv, 'ARTISYS_TOKEN_USER_A');

  assert.throws(() => validateAccessPolicy({
    schema: 1,
    baseUrl: 'https://app.example.test',
    actors: [{ id: 'user', role: 'user', token: 'secret' }],
    actions: [],
  }), /token|property|actor/i);
});

test('substituteTemplate replaces tenant/resource variables recursively without evaluating code', () => {
  const result = substituteTemplate({
    path: '/tenants/{tenantId}/orders/{resourceId}',
    body: { companyId: '{tenantId}', nested: ['{resourceId}'] },
  }, { tenantId: 'tenant-b', resourceId: 'order-b' });

  assert.deepEqual(result, {
    path: '/tenants/tenant-b/orders/order-b',
    body: { companyId: 'tenant-b', nested: ['order-b'] },
  });
});
