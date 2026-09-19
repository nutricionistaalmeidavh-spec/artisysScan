import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FleetReport } from '../../fleet/src/index.js';
export type { FleetReport } from '../../fleet/src/index.js';

export type OperationalDecision = 'PASS' | 'WARN' | 'BLOCK';
export type OperationalCheckStatus = 'pass' | 'warn' | 'block' | 'fail' | 'not-run' | 'passed' | 'failed' | 'incomplete';

export interface OperationalCheck {
  id: string;
  name: string;
  status: OperationalCheckStatus;
  diagnostic?: string;
}

export interface OperationalFinding {
  severity: string;
  ruleId?: string;
  message?: string;
  tool?: string;
  path?: string;
}

export interface OperationalHistoryEntry {
  timestamp: string;
  decision: OperationalDecision;
  critical: number;
  high: number;
  medium: number;
}

export interface OperationalProduct {
  id: string;
  decision: OperationalDecision;
  complete: boolean;
  findings: OperationalFinding[];
  checks: OperationalCheck[];
  history?: OperationalHistoryEntry[];
}

export interface OperationalDashboardInput {
  generatedAt: string;
  products: OperationalProduct[];
}

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

function operationalSeverityCount(report: OperationalDashboardInput, severity: string): number {
  return report.products.reduce((total, product) => total + product.findings.filter((finding) => finding.severity === severity).length, 0);
}

function decisionCount(report: OperationalDashboardInput, decision: OperationalDecision): number {
  return report.products.filter((product) => product.decision === decision).length;
}

function checkClass(status: OperationalCheckStatus): string {
  if (status === 'pass' || status === 'passed') return 'pass';
  if (status === 'warn') return 'warn';
  if (status === 'not-run' || status === 'incomplete') return 'idle';
  return 'block';
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

export function renderOperationalDashboard(report: OperationalDashboardInput): string {
  const products = report.products.map((product) => {
    const checks = product.checks.map((check) => `<li class="check check-${checkClass(check.status)}"><span>${escapeHtml(check.name)}</span><strong>${escapeHtml(check.status.toUpperCase())}</strong>${check.diagnostic ? `<small>${escapeHtml(check.diagnostic)}</small>` : ''}</li>`).join('');
    const findings = product.findings.length === 0
      ? '<p class="empty">Nenhum finding aberto.</p>'
      : `<ul class="findings">${product.findings.map((finding) => `<li><strong>${escapeHtml(finding.severity.toUpperCase())}</strong> ${escapeHtml(finding.ruleId ?? 'finding')} — ${escapeHtml(finding.message ?? '')}${finding.path ? `<small>${escapeHtml(finding.path)}</small>` : ''}</li>`).join('')}</ul>`;
    const history = (product.history ?? []).slice().reverse().map((entry) => `<tr><td>${escapeHtml(entry.timestamp)}</td><td><strong>${entry.decision}</strong></td><td>${entry.critical}</td><td>${entry.high}</td><td>${entry.medium}</td></tr>`).join('');
    return `<article class="product status-${product.decision.toLowerCase()}" data-decision="${product.decision}" data-product="${escapeHtml(product.id.toLowerCase())}"><header><div><p class="eyebrow">Sistema</p><h2>${escapeHtml(product.id)}</h2><p>Completo: <strong>${product.complete ? 'SIM' : 'NÃO'}</strong></p></div><span class="badge badge-${product.decision.toLowerCase()}">${product.decision}</span></header><details open><summary>Checks</summary><ul class="checks">${checks}</ul></details><details><summary>Findings (${product.findings.length})</summary>${findings}</details><details><summary>Histórico</summary><div class="table-wrap"><table><thead><tr><th>Execução</th><th>Gate</th><th>Critical</th><th>High</th><th>Medium</th></tr></thead><tbody>${history || '<tr><td colspan="5">Sem histórico.</td></tr>'}</tbody></table></div></details></article>`;
  }).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ArtiSys Scan — Central</title><style>:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#090b0f;color:#f6f7f9}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#18202d 0,#090b0f 42%);min-height:100vh}main{max-width:1280px;margin:auto;padding:28px 18px 60px}.top{display:flex;gap:18px;justify-content:space-between;align-items:flex-end;flex-wrap:wrap}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.72rem;color:#8994a6;margin:0 0 6px}h1{font-size:clamp(2rem,6vw,4.4rem);line-height:.95;margin:0}.sub{color:#9ba5b5}.metrics{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:10px;margin:24px 0}.metric,.product,.toolbar{background:rgba(18,22,29,.9);border:1px solid #2c3440;border-radius:16px;padding:16px}.metric strong{display:block;font-size:1.55rem;margin-top:4px}.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.toolbar input{flex:1;min-width:220px;background:#0d1117;border:1px solid #313b48;color:#fff;border-radius:10px;padding:11px 12px}.toolbar button{background:#151b24;border:1px solid #374151;color:#dce2ea;border-radius:10px;padding:10px 12px;cursor:pointer}.toolbar button.active{border-color:#74a7ff;color:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;margin-top:16px}.product{border-left-width:4px}.status-pass{border-left-color:#28c281}.status-warn{border-left-color:#e5aa36}.status-block{border-left-color:#ef5b64}.product header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.product h2{margin:0;font-size:1.45rem}.badge{font-weight:800;font-size:.76rem;padding:7px 10px;border-radius:999px}.badge-pass{background:#143c2d;color:#6be3ac}.badge-warn{background:#433315;color:#ffd36a}.badge-block{background:#421e23;color:#ff9299}details{border-top:1px solid #2c3440;margin-top:12px;padding-top:12px}summary{cursor:pointer;font-weight:700}.checks,.findings{list-style:none;padding:0;margin:10px 0 0}.check{display:grid;grid-template-columns:1fr auto;gap:8px;padding:9px 0;border-bottom:1px solid #232a34}.check small,.findings small{grid-column:1/-1;display:block;color:#8893a4}.check-pass strong{color:#6be3ac}.check-warn strong{color:#ffd36a}.check-block strong{color:#ff9299}.check-idle strong{color:#9ba5b5}.empty{color:#8f9aaa}.table-wrap{overflow:auto;margin-top:10px}table{width:100%;border-collapse:collapse;font-size:.86rem}th,td{text-align:left;padding:8px;border-bottom:1px solid #27303a;white-space:nowrap}@media(max-width:760px){.metrics{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:1fr}main{padding:20px 12px 44px}}</style></head><body><main><div class="top"><div><p class="eyebrow">Segurança + QA + Release Gate</p><h1>ArtiSys Scan</h1><p class="sub">Central operacional · atualizado em ${escapeHtml(report.generatedAt)}</p></div></div><section class="metrics"><div class="metric"><span>Produtos</span><strong>${report.products.length}</strong></div><div class="metric"><span>PASS</span><strong>${decisionCount(report,'PASS')}</strong></div><div class="metric"><span>WARN</span><strong>${decisionCount(report,'WARN')}</strong></div><div class="metric"><span>BLOCK</span><strong>${decisionCount(report,'BLOCK')}</strong></div><div class="metric"><span>Critical</span><strong>${operationalSeverityCount(report,'critical')}</strong></div><div class="metric"><span>High</span><strong>${operationalSeverityCount(report,'high')}</strong></div></section><div class="toolbar"><input id="search" type="search" placeholder="Filtrar sistema"><button class="active" data-filter="ALL">Todos</button><button data-filter="PASS">PASS</button><button data-filter="WARN">WARN</button><button data-filter="BLOCK">BLOCK</button></div><section class="grid" id="products">${products}</section></main><script>(()=>{const input=document.querySelector('#search');const buttons=[...document.querySelectorAll('[data-filter]')];let filter='ALL';const apply=()=>{const q=(input.value||'').toLowerCase();document.querySelectorAll('.product').forEach(card=>{const decision=card.dataset.decision;const name=card.dataset.product||'';card.hidden=!((filter==='ALL'||filter===decision)&&name.includes(q));});};input.addEventListener('input',apply);buttons.forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;buttons.forEach(item=>item.classList.toggle('active',item===button));apply();}));})();</script></body></html>`;
}

export async function writeFleetDashboard(report: FleetReport, outputDir: string): Promise<{ outputDir: string; files: string[] }> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(outputDir, 'index.html'), renderFleetDashboard(report)),
    writeFile(join(outputDir, 'dashboard.json'), `${JSON.stringify(report, null, 2)}\n`),
  ]);
  return { outputDir, files: ['index.html', 'dashboard.json'] };
}

export async function writeOperationalDashboard(report: OperationalDashboardInput, outputDir: string): Promise<{ outputDir: string; files: string[] }> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(join(outputDir, 'index.html'), renderOperationalDashboard(report)),
    writeFile(join(outputDir, 'dashboard.json'), `${JSON.stringify(report, null, 2)}\n`),
  ]);
  return { outputDir, files: ['index.html', 'dashboard.json'] };
}
