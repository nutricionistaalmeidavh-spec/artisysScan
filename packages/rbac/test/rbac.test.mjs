import assert from 'node:assert/strict';
import test from 'node:test';

import { createRbacCases, evaluateRbacCase } from '../src/index.ts';

const policy = {
  schema: 1,
  baseUrl: 'https://app.example.test',
  actors: [
    { id: 'user', role: 'user', tokenEnv: 'TOKEN_USER' },
    { id: 'admin', role: 'admin', tokenEnv: 'TOKEN_ADMIN' },
  ],
  actions: [
    { id: 'users.read', method: 'GET', path: '/api/users', allowRoles: ['admin'] },
    { id: 'users.delete', method: 'DELETE', path: '/api/users/42', allowRoles: ['admin'] },
  ],
};

test('RBAC matrix creates allow and deny cases for every actor/action pair', () => {
  const cases = createRbacCases(policy);
  assert.equal(cases.length, 4);
  assert.equal(cases.find((item) => item.actorId === 'user' && item.actionId === 'users.read')?.expected, 'deny');
  assert.equal(cases.find((item) => item.actorId === 'admin' && item.actionId === 'users.read')?.expected, 'allow');
});

test('denied role receiving success is critical', () => {
  const finding = evaluateRbacCase({
    id: 'user:users.read', actorId: 'user', role: 'user', actionId: 'users.read',
    method: 'GET', url: 'https://app.example.test/api/users', expected: 'deny', stateChanging: false,
  }, { status: 200, headers: {}, body: '[]' });

  assert.equal(finding?.ruleId, 'ARTISYS-RBAC-001');
  assert.equal(finding?.severity, 'critical');
});

test('state-changing RBAC cases are marked and can be skipped by the runner', () => {
  const cases = createRbacCases(policy);
  assert.equal(cases.find((item) => item.actionId === 'users.delete')?.stateChanging, true);
});
