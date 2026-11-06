import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const dir = resolve(process.argv[2] ?? 'audit-results');
const names = ['impeccable','hallmark','security','supply-chain'];
function load(name) {
  const file = join(dir, name + '.exit');
  if (!existsSync(file)) return {status:'INCOMPLETE',reason:'Check did not run'};
  const code = Number(readFileSync(file,'utf8').trim());
  const evidence = join(dir, name + (name === 'hallmark' || name === 'impeccable' ? '.json' : '.txt'));
  if (!Number.isInteger(code) || !existsSync(evidence) || statSync(evidence).size === 0) {
    return {status:'INCOMPLETE',exit_code:code,reason:'Missing or empty evidence'};
  }
  if (code === 0) return {status:'PASS',exit_code:0};
  if (name === 'impeccable' && code === 2) return {status:'WARN',exit_code:2,reason:'Deterministic design findings'};
  if (name === 'hallmark') return {status:'WARN',exit_code:code,reason:'Hallmark sloplint findings or error; review evidence'};
  if (code === 3) return {status:'BLOCK',exit_code:code,reason:'Scanner found blocking findings'};
  if (code === 2) return {status:'INCOMPLETE',exit_code:code,reason:'Scanner reports missing coverage or tools'};
  return {status:'INCOMPLETE',exit_code:code,reason:'Unexpected scanner error'};
}
const checks = Object.fromEntries(names.map(n => [n,load(n)]));
const states = Object.values(checks).map(x=>x.status);
const overall = states.includes('BLOCK') ? 'BLOCK' : states.includes('INCOMPLETE') ? 'INCOMPLETE' : states.includes('WARN') ? 'WARN' : 'PASS';
const report = {
  schema:1, repository:process.env.TARGET_REPO ?? 'unknown', generated_at:new Date().toISOString(),
  execution_policy:'read-only-source-only; no application scripts are run',
  overall, scope:'DETERMINISTIC_STATIC_ONLY', checks,
  cloudflare_security_audit_skill:{
    status:'NOT_RUN',
    reason:'Agent orchestration and independent six-phase verification are not available in the standard GitHub runner; artisysScan security/supply-chain are only deterministic complements.',
    source:'https://github.com/cloudflare/security-audit-skill'
  },
  release_automated:false,
  notes:['All PASS means only that deterministic checks completed without findings; it is not a completed agent-led security audit.','Missing tools/evidence are INCOMPLETE, never PASS.']
};
writeFileSync(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');
const summary = ['## ArtiSys app validation — '+report.repository,'**Static outcome:** '+overall,'','| Check | Status |','|---|---|',...Object.entries(checks).map(([k,v]) => '| '+k+' | '+v.status+' |'),'','Cloudflare six-phase agent audit: **NOT RUN**. No release or deployment.'].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n',{flag:'a'});
console.log(summary);
if (overall === 'BLOCK' || overall === 'INCOMPLETE') process.exitCode=1;
