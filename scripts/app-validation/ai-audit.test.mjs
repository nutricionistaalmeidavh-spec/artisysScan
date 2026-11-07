import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {audit, inventory, evidence, verdict} from './ai-audit.mjs';

const fresh=()=>mkdtempSync(join(tmpdir(),'artisys-ai-'));
function fixture(){
  const base=fresh(); mkdirSync(join(base,'target'));
  writeFileSync(join(base,'target','sample.js'), "const token='token=ABCDEFGHIJKLMNOPQRST';\nconst response=eval(userInput);\n");
  writeFileSync(join(base,'target','.env'),'SHOULD_NOT_LEAVE_DISK=true');
  symlinkSync(join(base,'target','sample.js'),join(base,'target','linked.js'));
  return base;
}
test('inventory excludes hidden files and symlinks; evidence is redacted',()=>{
  const base=fixture();
  try{
    assert.deepEqual(inventory(join(base,'target')).map(x=>x.file),['sample.js']);
    assert.equal(evidence(join(base,'target')).candidates[0].line,2);
    assert.doesNotMatch(evidence(join(base,'target')).candidates[0].snippet,/ABCDEFGHIJKLMNOPQRST/);
  }finally{rmSync(base,{recursive:true,force:true});}
});
test('independent source opinions cannot confirm an exploitation',()=>{
  assert.equal(verdict({hypothesis:'potential bug'},{decision:'plausible'},{decision:'plausible'}),'needs_validation');
  assert.equal(verdict({hypothesis:'potential bug'},{decision:'refuted'},{decision:'refuted'}),'rejected');
});
test('local-only model calls produce partial report and redact secrets',async()=>{
  const base=fixture(), seen=[];
  const fake=async(url,options)=>{
    seen.push({url,options});
    const prompt=JSON.parse(options.body).messages[1].content;
    const obj=prompt.includes('hunter-')?{hypothesis:'possible boundary'}:prompt.includes('verifier-')?{decision:'uncertain'}:{summary:'bounded'};
    return {ok:true,json:async()=>({message:{content:JSON.stringify(obj)}})};
  };
  try{
    const report=await audit({target:join(base,'target'),out:join(base,'report'),fetchImpl:fake,maxCandidates:1});
    assert.equal(report.status,'PARTIAL_SOURCE_ONLY');
    assert.equal(report.release_gate,'REVIEW_REQUIRED');
    assert.equal(report.findings[0].verdict,'needs_validation');
    assert.equal(report.calls,8);
    assert.ok(seen.every(x=>x.url==='http://127.0.0.1:11434/api/chat'));
    assert.doesNotMatch(JSON.stringify(seen),/ABCDEFGHIJKLMNOPQRST/);
    assert.doesNotMatch(readFileSync(join(base,'report','report.json'),'utf8'),/ABCDEFGHIJKLMNOPQRST/);
  }finally{rmSync(base,{recursive:true,force:true});}
});
test('failed Ollama call marks report incomplete and blocks',async()=>{
  const base=fixture();
  try{
    await assert.rejects(audit({target:join(base,'target'),out:join(base,'report'),fetchImpl:async()=>({ok:false,status:503})}),/Local model unavailable/);
    const result=JSON.parse(readFileSync(join(base,'report','report.json'),'utf8'));
    assert.equal(result.status,'INCOMPLETE'); assert.equal(result.release_gate,'BLOCK');
  }finally{rmSync(base,{recursive:true,force:true});}
});
