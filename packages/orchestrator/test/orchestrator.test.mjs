import assert from 'node:assert/strict';
import test from 'node:test';

import { runHomologation } from '../src/index.ts';

const policy={schema:1,baseUrl:'http://127.0.0.1:4173',actors:[],actions:[]};
const pass={complete:true,passed:true,findings:[]};

function runners(overrides={}){
  return {
    web:async()=>({...pass,target:'http://127.0.0.1:4173',probes:[]}),
    api:async()=>({...pass,executed:1,skipped:0,errors:[]}),
    rbac:async()=>({...pass,executed:1,skipped:0,errors:[]}),
    tenant:async()=>({...pass,executed:2,skipped:0,errors:[]}),
    admin:async()=>({...pass,executed:2,skipped:0,errors:[]}),
    qa:async()=>({...pass,root:'C:/tmp/app',mode:'script',outputDir:'C:/tmp/out',executed:true,exitCode:0,artifacts:{screenshots:[],videos:[],traces:[],jsonReports:[],htmlReports:[],other:[]},captures:{screenshots:'best-effort',videos:'best-effort',traces:'best-effort',console:'best-effort',network:'best-effort'},diagnostics:[]}),
    ...overrides,
  };
}

test('homologation aggregates web api rbac tenant admin and qa in deterministic order',async()=>{
  const report=await runHomologation({
    baseUrl:'http://127.0.0.1:4173',
    policy,
    projectRoot:'C:/tmp/app',
    outputDir:'C:/tmp/out',
    allowActive:true,
    allowStateChange:true,
    allowProjectExecution:true,
  },{runners:runners()});

  assert.equal(report.complete,true);
  assert.equal(report.passed,true);
  assert.deepEqual(report.executed,['web','api','rbac','tenant','admin','qa']);
  assert.equal(report.stages.tenant.executed,2);
  assert.equal(report.stages.qa.passed,true);
});

test('homologation is incomplete when any required scanner is incomplete',async()=>{
  const report=await runHomologation({
    baseUrl:'http://127.0.0.1:4173',
    policy,
  },{runners:runners({tenant:async()=>({complete:false,passed:false,findings:[],executed:0,skipped:0,errors:['missing fixture']})})});

  assert.equal(report.complete,false);
  assert.equal(report.passed,false);
  assert.deepEqual(report.executed,['web','api','rbac','tenant','admin']);
});

test('homologation fails when a complete stage reports a security finding',async()=>{
  const report=await runHomologation({
    baseUrl:'http://127.0.0.1:4173',
    policy,
  },{runners:runners({admin:async()=>({complete:true,passed:false,findings:[{ruleId:'ARTISYS-SA-001',severity:'critical',message:'boundary bypass',actionId:'x',status:200}],executed:1,skipped:0,errors:[]})})});

  assert.equal(report.complete,true);
  assert.equal(report.passed,false);
});
