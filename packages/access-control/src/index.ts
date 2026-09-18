import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';

export type HttpMethod = 'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type HttpHeaders = Record<string, string | string[]>;

export interface HttpRequest {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  kind?: string;
}

export interface HttpResponse {
  status: number;
  headers: HttpHeaders;
  body: string;
}

export type HttpTransport = (request: HttpRequest) => Promise<HttpResponse>;

export interface AccessActor {
  id: string;
  role: string;
  tokenEnv?: string;
  tenant?: string;
}

export interface AuditCheck {
  method: HttpMethod;
  path: string;
}

export interface AccessAction {
  id: string;
  method: HttpMethod;
  path: string;
  allowRoles: string[];
  body?: unknown;
  privileged?: boolean;
  auditCheck?: AuditCheck;
}

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  auth: 'required' | 'optional' | 'none';
  actorId?: string;
  body?: unknown;
  invalidBody?: unknown;
  rateLimitProbe?: number;
  bolaPath?: string;
  massAssignmentBody?: unknown;
}

export interface TenantRoute {
  id: string;
  method: HttpMethod;
  path: string;
  resourceKey?: string;
  body?: unknown;
}

export interface TenantPolicy {
  resources: Record<string, Record<string, string>>;
  routes: TenantRoute[];
}

export interface AccessPolicyV1 {
  schema: 1;
  baseUrl: string;
  actors: AccessActor[];
  actions: AccessAction[];
  api?: { endpoints: ApiEndpoint[] };
  tenant?: TenantPolicy;
}

const METHODS = new Set<HttpMethod>(['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ACTOR_KEYS = new Set(['id', 'role', 'tokenEnv', 'tenant']);
const ACTION_KEYS = new Set(['id', 'method', 'path', 'allowRoles', 'body', 'privileged', 'auditCheck']);
const ENDPOINT_KEYS = new Set(['id', 'method', 'path', 'auth', 'actorId', 'body', 'invalidBody', 'rateLimitProbe', 'bolaPath', 'massAssignmentBody']);
const ROUTE_KEYS = new Set(['id', 'method', 'path', 'resourceKey', 'body']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}: unknown property ${key}`);
  }
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function asMethod(value: unknown, label: string): HttpMethod {
  const method = asString(value, label).toUpperCase() as HttpMethod;
  if (!METHODS.has(method)) throw new Error(`${label} has unsupported HTTP method`);
  return method;
}

function asRoles(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((role) => typeof role !== 'string' || role.length === 0)) {
    throw new Error(`${label} must be an array of roles`);
  }
  return [...value] as string[];
}

function parseActor(value: unknown, index: number): AccessActor {
  if (!isObject(value)) throw new Error(`actor ${index} must be an object`);
  assertKeys(value, ACTOR_KEYS, `actor ${index}`);
  const actor: AccessActor = {
    id: asString(value.id, `actor ${index}.id`),
    role: asString(value.role, `actor ${index}.role`),
  };
  if (value.tokenEnv !== undefined) {
    const tokenEnv = asString(value.tokenEnv, `actor ${index}.tokenEnv`);
    if (!/^[A-Z][A-Z0-9_]*$/.test(tokenEnv)) throw new Error(`actor ${index}.tokenEnv must be an environment variable name`);
    actor.tokenEnv = tokenEnv;
  }
  if (value.tenant !== undefined) actor.tenant = asString(value.tenant, `actor ${index}.tenant`);
  return actor;
}

function parseAudit(value: unknown, label: string): AuditCheck {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  assertKeys(value, new Set(['method', 'path']), label);
  return { method: asMethod(value.method, `${label}.method`), path: asString(value.path, `${label}.path`) };
}

function parseAction(value: unknown, index: number): AccessAction {
  if (!isObject(value)) throw new Error(`action ${index} must be an object`);
  assertKeys(value, ACTION_KEYS, `action ${index}`);
  const action: AccessAction = {
    id: asString(value.id, `action ${index}.id`),
    method: asMethod(value.method, `action ${index}.method`),
    path: asString(value.path, `action ${index}.path`),
    allowRoles: asRoles(value.allowRoles, `action ${index}.allowRoles`),
  };
  if ('body' in value) action.body = value.body;
  if (value.privileged !== undefined) {
    if (typeof value.privileged !== 'boolean') throw new Error(`action ${index}.privileged must be boolean`);
    action.privileged = value.privileged;
  }
  if (value.auditCheck !== undefined) action.auditCheck = parseAudit(value.auditCheck, `action ${index}.auditCheck`);
  return action;
}

function parseEndpoint(value: unknown, index: number): ApiEndpoint {
  if (!isObject(value)) throw new Error(`api endpoint ${index} must be an object`);
  assertKeys(value, ENDPOINT_KEYS, `api endpoint ${index}`);
  const auth = asString(value.auth, `api endpoint ${index}.auth`);
  if (!['required', 'optional', 'none'].includes(auth)) throw new Error(`api endpoint ${index}.auth is invalid`);
  const endpoint: ApiEndpoint = {
    id: asString(value.id, `api endpoint ${index}.id`),
    method: asMethod(value.method, `api endpoint ${index}.method`),
    path: asString(value.path, `api endpoint ${index}.path`),
    auth: auth as ApiEndpoint['auth'],
  };
  if (value.actorId !== undefined) endpoint.actorId = asString(value.actorId, `api endpoint ${index}.actorId`);
  if ('body' in value) endpoint.body = value.body;
  if ('invalidBody' in value) endpoint.invalidBody = value.invalidBody;
  if (value.rateLimitProbe !== undefined) {
    if (!Number.isInteger(value.rateLimitProbe) || Number(value.rateLimitProbe) < 2 || Number(value.rateLimitProbe) > 100) {
      throw new Error(`api endpoint ${index}.rateLimitProbe must be an integer from 2 to 100`);
    }
    endpoint.rateLimitProbe = Number(value.rateLimitProbe);
  }
  if (value.bolaPath !== undefined) endpoint.bolaPath = asString(value.bolaPath, `api endpoint ${index}.bolaPath`);
  if ('massAssignmentBody' in value) endpoint.massAssignmentBody = value.massAssignmentBody;
  return endpoint;
}

function parseTenant(value: unknown): TenantPolicy {
  if (!isObject(value)) throw new Error('tenant must be an object');
  assertKeys(value, new Set(['resources', 'routes']), 'tenant');
  if (!isObject(value.resources)) throw new Error('tenant.resources must be an object');
  const resources: Record<string, Record<string, string>> = {};
  for (const [tenantId, tenantResources] of Object.entries(value.resources)) {
    if (!isObject(tenantResources)) throw new Error(`tenant.resources.${tenantId} must be an object`);
    resources[tenantId] = {};
    for (const [key, resource] of Object.entries(tenantResources)) {
      resources[tenantId][key] = asString(resource, `tenant.resources.${tenantId}.${key}`);
    }
  }
  if (!Array.isArray(value.routes)) throw new Error('tenant.routes must be an array');
  const routes = value.routes.map((route, index): TenantRoute => {
    if (!isObject(route)) throw new Error(`tenant route ${index} must be an object`);
    assertKeys(route, ROUTE_KEYS, `tenant route ${index}`);
    const parsed: TenantRoute = {
      id: asString(route.id, `tenant route ${index}.id`),
      method: asMethod(route.method, `tenant route ${index}.method`),
      path: asString(route.path, `tenant route ${index}.path`),
    };
    if (route.resourceKey !== undefined) parsed.resourceKey = asString(route.resourceKey, `tenant route ${index}.resourceKey`);
    if ('body' in route) parsed.body = route.body;
    return parsed;
  });
  return { resources, routes };
}

export function validateAccessPolicy(value: unknown): AccessPolicyV1 {
  if (!isObject(value)) throw new Error('access policy must be an object');
  assertKeys(value, new Set(['schema', 'baseUrl', 'actors', 'actions', 'api', 'tenant']), 'access policy');
  if (value.schema !== 1) throw new Error('access policy schema must be 1');
  if (!Array.isArray(value.actors)) throw new Error('actors must be an array');
  if (!Array.isArray(value.actions)) throw new Error('actions must be an array');
  const policy: AccessPolicyV1 = {
    schema: 1,
    baseUrl: asString(value.baseUrl, 'baseUrl'),
    actors: value.actors.map(parseActor),
    actions: value.actions.map(parseAction),
  };
  if (value.api !== undefined) {
    if (!isObject(value.api) || !Array.isArray(value.api.endpoints)) throw new Error('api.endpoints must be an array');
    assertKeys(value.api, new Set(['endpoints']), 'api');
    policy.api = { endpoints: value.api.endpoints.map(parseEndpoint) };
  }
  if (value.tenant !== undefined) policy.tenant = parseTenant(value.tenant);
  return policy;
}

export async function loadAccessPolicy(path: string): Promise<AccessPolicyV1> {
  const raw = await readFile(path, 'utf8');
  return validateAccessPolicy(parse(raw));
}

export function substituteTemplate<T>(value: T, variables: Record<string, string>): T {
  if (typeof value === 'string') {
    let result: string = value;
    for (const [key, replacement] of Object.entries(variables)) result = result.split(`{${key}}`).join(replacement);
    return result as T;
  }
  if (Array.isArray(value)) return value.map((item) => substituteTemplate(item, variables)) as T;
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteTemplate(item, variables)])) as T;
  }
  return value;
}

export function isStateChanging(method: HttpMethod): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

export function isSuccess(status: number): boolean {
  return status >= 200 && status < 400;
}

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ''), base).toString();
}

export function resolveActorHeaders(actor: AccessActor, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (!actor.tokenEnv) return {};
  const token = env[actor.tokenEnv];
  if (!token) throw new Error(`missing environment variable ${actor.tokenEnv} for actor ${actor.id}`);
  return { authorization: `Bearer ${token}` };
}

export const defaultHttpTransport: HttpTransport = async (request) => {
  const headers = new Headers(request.headers);
  let body: string | undefined;
  if (request.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(request.body);
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers,
    redirect: 'manual',
    ...(body !== undefined ? { body } : {}),
  });
  const responseHeaders: HttpHeaders = {};
  for (const [key, value] of response.headers.entries()) responseHeaders[key.toLowerCase()] = value;
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (getSetCookie) {
    const cookies = getSetCookie.call(response.headers);
    if (cookies.length > 0) responseHeaders['set-cookie'] = cookies;
  }
  return { status: response.status, headers: responseHeaders, body: await response.text() };
};
