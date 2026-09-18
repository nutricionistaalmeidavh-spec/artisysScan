import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FleetReport } from '../../fleet/src/index.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function productCounts(report: FleetReport, severity: string): number {
  return report.products.reduce((total, product) => total + product.report.findings.filter((finding) => finding.severity === severity).length, 0);
}

export function renderFleetDashboard(report: FleetReport): string {
  const cards = report.products.map((product) => {
    const counts = {
      critical: product.report.findings.filter((finding) => finding.severity === 'critical').length,
      high: product.report.findings.filter((finding) => finding.severity === 'high').length,
      medium: product.report.findings.filter((finding) => finding.severity === 'medium').length,
    };
    const reasons = product.gate.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
    const profile = product.profile ?? product.report.profile ?? 'unknown';
    return `<article class="card status-${product.gate.decision.toLowerCase()}"><div class="status">${product.gate.decision}</div><h2>${escapeHtml(product.id)}</h2><p>Profile: ${escapeHtml(profile)}</p><p>Critical ${counts.critical} · High ${counts.high} · Medium ${counts.medium}</p>${reasons ? `<ul>${reasons}</ul>` : ''}</article>`;
  }).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ArtiSys Fleet Dashboard</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#111;color:#f5f5f5}main{max-width:1200px;margin:auto;padding:24px}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.metric,.card{border:1px solid #444;border-radius:12px;padding:16px;background:#191919}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:18px}.status{font-weight:700}.status-pass{border-color:#3a6}.status-warn{border-color:#ba3}.status-block{border-color:#b44}small{color:#aaa}</style></head><body><main><h1>ArtiSys Fleet Dashboard</h1><p>Overall: <strong>${report.decision}</strong> · Complete: ${report.complete}</p><section class="summary"><div class="metric">PASS ${report.summary.pass}</div><div class="metric">WARN ${report.summary.warn}</div><div class="metric">BLOCK ${report.summary.block}</div></section><p>Critical ${productCounts(report, 'critical')} · High ${productCounts(report, 'high')} · Medium ${productCounts(report, 'medium')}</p><section class="grid">${cards}</section></main></body></html>`;
}

export async function writeFleetDashboard(report: FleetReport, outputDir: string): Promise<{ outputDir: string; files: string[] }> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(outputDir, 'index.html'), renderFleetDashboard(report)),
    writeFile(join(outputDir, 'dashboard.json'), `${JSON.stringify(report, null, 2)}\n`),
  ]);
  return { outputDir, files: ['index.html', 'dashboard.json'] };
}
