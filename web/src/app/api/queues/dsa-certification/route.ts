import { handleCallback, send } from "@vercel/queue";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicConfig } from "@/lib/config/public";
import { createSandboxAdapter } from "@/lib/dsa-execution/contree";
import { equal, safeJson } from "@/lib/dsa-execution/judge";
import { planSchema, type EvaluationPlan } from "@/lib/dsa-execution/types";
import { HARNESS_SHA256 } from "@/lib/dsa-execution/python/harness.generated";
import type { ExecutionRequest } from "@/features/dsa/execution/contract";

export const runtime = "nodejs";
export const maxDuration = 60;

const tokenSchema = z.object({ tick: z.uuid() }).strict();
const claimSchema = z.object({
  runId:z.uuid(),versionId:z.uuid(),suiteId:z.uuid(),problemId:z.uuid(),
  leaseToken:z.uuid(),phase:z.enum(["launching","launched"]),operationId:z.uuid().nullable(),
  launchedAt:z.string(),attempts:z.number().int(),source:z.string().min(1),
  contract:z.unknown(),statement:z.string().nullable(),categories:z.record(z.string(),z.number()),
  caseCount:z.number().int(),cases:z.array(z.object({
    id:z.uuid(),input:z.unknown(),expected:z.unknown(),
    visibility:z.enum(["public","hidden"]),
  }).strict()),
}).strict();
type Claim = z.infer<typeof claimSchema>;
function database() {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key) throw Error("SUPABASE_SERVICE_ROLE_KEY_NOT_CONFIGURED");
  return createClient(publicConfig.supabaseUrl,key,
    {auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}
async function command(action:string,args:Record<string,unknown>={}) {
  const {data,error}=await database().rpc("dsa_bulk_certification_command",
    {p_action:action,p_args:args});
  if(error) throw Error("CERTIFICATION_STORAGE_"+action+":"+error.code);
  return data as unknown;
}
async function enqueueNext() {
  // One durable worker message claims at most one item. Failed publishing
  // is recoverable by the authorized cron tick.
  await send("dsa-certification",{tick:randomUUID()},
    {idempotencyKey:randomUUID(),retentionSeconds:3600});
}
export async function startBulkCertification() {
  if(process.env.DSA_EXECUTIONS_ENABLED!=="1"||!process.env.NEBIUS_API_KEY||
    !process.env.CONTREE_PROJECT||!process.env.CONTREE_PYTHON_IMAGE)
    throw Error("CERTIFICATION_SANDBOX_NOT_CONFIGURED");
  const run=await command("start") as {runId:string;pending:number};
  if(run.pending>0) await Promise.all(Array.from({length:5},()=>enqueueNext()));
  return run;
}
export async function statusBulkCertification() {
  return command("status");
}
export async function resumeBulkCertification() {
  const run=await command("status") as {status:string;queued:number;running:number}|null;
  if(run?.status==="running" && run.queued+run.running>0)
    await Promise.all(Array.from({length:5},()=>enqueueNext()));
  return run;
}

const wait=(ms:number)=>new Promise<void>((resolve)=>setTimeout(resolve,ms));
async function runClaim(claim:Claim) {
  const evidence:Record<string,unknown>={
    harnessSha256:HARNESS_SHA256,fixtureCount:claim.caseCount,
    sourceSha256:createHash("sha256").update(claim.source).digest("hex"),
    categoryCounts:claim.categories,
  };
  let operationId=claim.operationId??undefined;
  const save=async(passed:boolean,reason:string,publicPassed=0,hiddenPassed=0)=>{
    await command("finish",{runId:claim.runId,versionId:claim.versionId,
      leaseToken:claim.leaseToken,operationId:operationId??null,passed,
      passedPublic:publicPassed,passedHidden:hiddenPassed,
      evidence,reason});
  };
  try {
    if(claim.caseCount!==claim.cases.length||
       claim.caseCount===0||claim.caseCount>100||
       claim.statement===null||claim.statement.trim().length<20||
       !claim.source.includes("def solve(")){
      await save(false,"STATEMENT_OR_REFERENCE_INVALID");return;
    }
    const categories=claim.categories;
    const boundary=(categories.boundary??0)+(categories.edge??0);
    const stress=(categories.adversarial??0)+(categories.performance??0);
    evidence.boundaryCoverage=boundary;
    evidence.stressCoverage=stress;
    if(boundary<1 || stress<1){
      await save(false,"BOUNDARY_OR_ADVERSARIAL_COVERAGE_MISSING");return;
    }
    const plan:EvaluationPlan=planSchema.parse({
      suiteId:claim.suiteId,problemId:claim.problemId,
      problemVersionId:claim.versionId,contract:claim.contract,
      exposeCounts:false,cases:claim.cases,
    });
    if(!plan.cases.every(c=>safeJson(c.input)&&safeJson(c.expected))){
      await save(false,"FIXTURE_FORMAT_UNSUPPORTED");return;
    }
    // Independently check that the fixed comparator accepts true expectations
    // and rejects a deliberately malformed output, including custom checkers.
    const invalid={"__reasonai_invalid_certification_output__":true};
    const positive=plan.cases.every(c=>equal(c.expected,c.expected,plan.contract,c.input));
    const negative=plan.cases.every(c=>!equal(invalid,c.expected,plan.contract,c.input));
    evidence.positiveComparator=positive;
    evidence.negativeComparator=negative;
    if(!positive||!negative){
      await save(false,"CHECKER_SEMANTICS_FAILED");return;
    }
    const adapter=createSandboxAdapter();
    if(!operationId){
      if(claim.phase==="launching"&&claim.attempts>1){
        operationId=await adapter.find(claim.versionId,claim.launchedAt);
        if(!operationId){
          await save(false,"AMBIGUOUS_SANDBOX_LAUNCH");return;
        }
      } else {
        const request:ExecutionRequest={
          problemId:claim.problemId,problemVersionId:claim.versionId,
          language:"python",mode:"submit",code:claim.source,
          idempotencyKey:randomUUID(),
        };
        operationId=await adapter.start(claim.versionId,request,plan);
      }
      await command("launched",{runId:claim.runId,versionId:claim.versionId,
        leaseToken:claim.leaseToken,operationId});
    }
    evidence.sandboxOperation=operationId;
    const deadline=Date.now()+36000;
    let result=await adapter.inspect(operationId);
    while(!result.terminal&&Date.now()<deadline){
      await wait(700);
      result=await adapter.inspect(operationId);
    }
    if(!result.terminal){
      await save(false,"SANDBOX_NOT_TERMINAL");return;
    }
    if(result.infrastructureFailure||result.malformed||result.cancelled||
      result.timedOut||!result.cases || result.cases.length!==plan.cases.length){
      await save(false,"SANDBOX_EXECUTION_FAILED");return;
    }
    let publicPassed=0,hiddenPassed=0;
    for(let i=0;i<plan.cases.length;i++){
      const observed=result.cases[i],fixture=plan.cases[i];
      if(observed.id!==fixture.id||observed.status!=="ok"||
        !equal(observed.actual,fixture.expected,plan.contract,fixture.input)){
        evidence.firstFailure={ordinal:i,visibility:fixture.visibility,
          status:observed.status,matchedExpected:false};
        await save(false,fixture.visibility==="public"?"PUBLIC_EXECUTION_FAILED":"HIDDEN_EXECUTION_FAILED");
        return;
      }
      if(fixture.visibility==="public")publicPassed++;
      else hiddenPassed++;
    }
    evidence.passedPublic=publicPassed;
    evidence.passedHidden=hiddenPassed;
    evidence.realPython=true;
    evidence.executionSource="nebius-contree-disposable";
    evidence.checkedAt=new Date().toISOString();
    if(publicPassed<1||hiddenPassed<1){
      await save(false,"FIXTURE_VISIBILITY_COVERAGE_MISSING");return;
    }
    await save(true,"",publicPassed,hiddenPassed);
  }catch(error){
    // Do not store exception text: a provider error can contain protected
    // configuration. The next tick can pick up a timed-out lease for recovery.
    console.error("[DSA_CERTIFICATION] problem failed",{versionId:claim.versionId,
      code:error instanceof z.ZodError?"INVALID_CONTRACT":"CERTIFICATION_WORKER_ERROR"});
    try { await save(false,"CERTIFICATION_WORKER_ERROR"); } catch {
      throw error; // preserve the queue retry and operation recovery
    }
  }
}
export const POST=handleCallback(async (message:unknown)=>{
  if(!tokenSchema.safeParse(message).success)return;
  const raw=await command("claim");
  if(raw && typeof raw==="object" && !("skipped" in raw)){
    await runClaim(claimSchema.parse(raw));
  }
  const status=await command("status") as {status:string;queued:number;running:number}|null;
  if(status?.status==="running"&&status.queued+status.running>0){
    await enqueueNext();
  }
},{
  retry:(_error,metadata)=>metadata.deliveryCount>=12
    ?{acknowledge:true}
    :{afterSeconds:Math.min(120,5*2**Math.min(metadata.deliveryCount-1,4))},
});