import {
  defaultHttpTransport,
  type HttpResponse,
  type HttpTransport,
} from '../../access-control/src/index.js';

export type WebSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface WebFinding {
  ruleId: string;
  severity: WebSeverity;
  message: string;
  url: string;
  evidence?: string;
}

export interface WebProbe {
  id: string;
  kind: 'baseline' | 'cors' | 'reflection';
  method: 'GET';
  url: string;
  marker?: string;
  headers?: Record<string, string>;
}

export interface WebScanReport {
  target: string;
  complete: boolean;
  passed: boolean;
  findings: WebFinding[];
  probes: { id: string; status?: number; error?: string }[];
}

function lowerHeaders(headers: HttpResponse['headers']): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function headerValue(headers: Record<string, string | string[]>, key: string): string | undefined {
  const value = headers[key.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value;
}

function cookies(headers: Record<string, string | string[]>): string[] {
  const value = headers['set-cookie'];
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function inspectHtmlSurfaces(url: string, body: string): WebFinding[] {
  const findings: WebFinding[] = [];
  const stateChangingForms = body.match(/<form\b[^>]*method=["']?(?:post|put|patch|delete)["']?[^>]*>[\s\S]*?<\/form>/gi) ?? [];
  if (stateChangingForms.some((form) => !/(?:name|id)=["'][^"']*(?:csrf|xsrf|_token|authenticity_token)[^"']*["']/i.test(form))) {
    findings.push({
      ruleId: 'ARTISYS-WEB-CSRF-HEURISTIC-001',
      severity: 'medium',
      message: 'State-changing HTML form was found without an obvious CSRF token field. Review server-side CSRF defenses and SameSite policy.',
      url,
    });
  }
  if (/<input\b[^>]*type=["']?file["']?[^>]*>/i.test(body)) {
    findings.push({
      ruleId: 'ARTISYS-WEB-UPLOAD-SURFACE-001',
      severity: 'info',
      message: 'File-upload surface detected. Validate MIME, extension, size, storage location and authorization with a targeted test profile.',
      url,
    });
  }
  return findings;
}

export function assessWebResponse(url: string, response: HttpResponse): WebFinding[] {
  const findings: WebFinding[] = [];
  const headers = lowerHeaders(response.headers);
  const add = (ruleId: string, severity: WebSeverity, message: string, evidence?: string): void => {
    findings.push({ ruleId, severity, message, url, ...(evidence ? { evidence } : {}) });
  };

  if (url.startsWith('http://')) add('ARTISYS-WEB-HTTPS-001', 'high', 'Target is served over HTTP instead of HTTPS.');
  if (!headerValue(headers, 'content-security-policy')) add('ARTISYS-WEB-CSP-001', 'medium', 'Content-Security-Policy header is missing.');
  if (url.startsWith('https://') && !headerValue(headers, 'strict-transport-security')) add('ARTISYS-WEB-HSTS-001', 'medium', 'HSTS header is missing on HTTPS response.');
  if (headerValue(headers, 'x-content-type-options')?.toLowerCase() !== 'nosniff') add('ARTISYS-WEB-NOSNIFF-001', 'low', 'X-Content-Type-Options: nosniff is missing.');
  if (!headerValue(headers, 'referrer-policy')) add('ARTISYS-WEB-REFERRER-001', 'low', 'Referrer-Policy header is missing.');
  if (!headerValue(headers, 'permissions-policy')) add('ARTISYS-WEB-PERMISSIONS-001', 'info', 'Permissions-Policy header is missing.');

  for (const cookie of cookies(headers)) {
    if (!/;\s*secure\b/i.test(cookie)) add('ARTISYS-WEB-COOKIE-SECURE-001', 'high', 'Cookie is missing Secure.', cookie.split(';')[0]);
    if (!/;\s*httponly\b/i.test(cookie)) add('ARTISYS-WEB-COOKIE-HTTPONLY-001', 'medium', 'Cookie is missing HttpOnly.', cookie.split(';')[0]);
    if (!/;\s*samesite=(strict|lax|none)\b/i.test(cookie)) add('ARTISYS-WEB-COOKIE-SAMESITE-001', 'medium', 'Cookie is missing SameSite.', cookie.split(';')[0]);
  }

  const server = headerValue(headers, 'server');
  const poweredBy = headerValue(headers, 'x-powered-by');
  if (server && /\d/.test(server)) add('ARTISYS-WEB-BANNER-001', 'low', 'Server header exposes version information.', server);
  if (poweredBy) add('ARTISYS-WEB-BANNER-002', 'low', 'X-Powered-By header exposes implementation details.', poweredBy);

  const leakPatterns = [
    /\/home\/[\w./-]+:\d+(?::\d+)?/,
    /[A-Za-z]:\\[^\r\n]+:\d+(?::\d+)?/,
    /(?:Traceback \(most recent call last\)|at [\w$.<>]+ \([^\n]+:\d+:\d+\))/,
  ];
  const leak = leakPatterns.find((pattern) => pattern.test(response.body));
  if (leak) add('ARTISYS-WEB-LEAK-001', 'high', 'Response appears to expose a stack trace or local filesystem path.');

  findings.push(...inspectHtmlSurfaces(url, response.body));
  return findings;
}

export function createWebScanPlan(target: string, options: { allowActive?: boolean } = {}): WebProbe[] {
  const base = new URL(target);
  const untrustedOrigin = 'https://artisys-untrusted.invalid';
  const probes: WebProbe[] = [
    { id: 'baseline', kind: 'baseline', method: 'GET', url: base.toString() },
    { id: 'cors', kind: 'cors', method: 'GET', url: base.toString(), marker: untrustedOrigin, headers: { origin: untrustedOrigin } },
  ];
  if (options.allowActive) {
    const marker = `ARTISYS_REFLECT_${Date.now().toString(36)}`;
    const reflection = new URL(base.toString());
    reflection.searchParams.set('artisys_scan', marker);
    probes.push({ id: 'reflection', kind: 'reflection', method: 'GET', url: reflection.toString(), marker });
  }
  return probes;
}

function evaluateCorsProbe(probe: WebProbe, response: HttpResponse): WebFinding[] {
  const headers = lowerHeaders(response.headers);
  const allowOrigin = headerValue(headers, 'access-control-allow-origin');
  const credentials = headerValue(headers, 'access-control-allow-credentials')?.toLowerCase() === 'true';
  if (!allowOrigin) return [];
  if ((allowOrigin === probe.marker || allowOrigin === '*') && credentials) {
    return [{
      ruleId: 'ARTISYS-WEB-CORS-001',
      severity: 'critical',
      message: 'CORS allows an untrusted/wildcard origin together with credentials.',
      url: probe.url,
      evidence: `${allowOrigin}; credentials=true`,
    }];
  }
  if (allowOrigin === probe.marker) {
    return [{
      ruleId: 'ARTISYS-WEB-CORS-001',
      severity: 'high',
      message: 'CORS reflected an untrusted Origin value.',
      url: probe.url,
      evidence: allowOrigin,
    }];
  }
  return [];
}

export async function runWebScan(target: string, options: {
  allowActive?: boolean;
  transport?: HttpTransport;
} = {}): Promise<WebScanReport> {
  const transport = options.transport ?? defaultHttpTransport;
  const plan = createWebScanPlan(target, { allowActive: options.allowActive ?? false });
  const findings: WebFinding[] = [];
  const probes: WebScanReport['probes'] = [];
  let complete = true;

  for (const probe of plan) {
    try {
      const response = await transport({ method: probe.method, url: probe.url, kind: probe.kind, ...(probe.headers ? { headers: probe.headers } : {}) });
      probes.push({ id: probe.id, status: response.status });
      if (probe.kind === 'baseline') findings.push(...assessWebResponse(probe.url, response));
      if (probe.kind === 'cors') findings.push(...evaluateCorsProbe(probe, response));
      if (probe.kind === 'reflection' && probe.marker && response.body.includes(probe.marker)) {
        findings.push({
          ruleId: 'ARTISYS-WEB-XSS-REFLECT-001',
          severity: 'high',
          message: 'Active reflection probe marker was returned unsanitized in the response body.',
          url: probe.url,
          evidence: probe.marker,
        });
      }
    } catch (error) {
      complete = false;
      probes.push({ id: probe.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const unique = [...new Map(findings.map((finding) => [`${finding.ruleId}:${finding.url}:${finding.evidence ?? ''}`, finding])).values()];
  const blocking = unique.some((finding) => finding.severity === 'high' || finding.severity === 'critical');
  return { target, complete, passed: complete && !blocking, findings: unique, probes };
}
