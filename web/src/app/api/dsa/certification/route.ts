import { timingSafeEqual, randomUUID } from "node:crypto";
import { send } from "@vercel/queue";
import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "@/lib/config/public";

export const runtime="nodejs";
export const maxDuration=30;
function authorized(req:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret)return false;
  const supplied=Buffer.from(req.headers.get("authorization")??"");
  const expected=Buffer.from("Bearer "+secret);
  return supplied.length===expected.length && timingSafeEqual(supplied,expected);
}
function configured(){
  return process.env.DSA_EXECUTIONS_ENABLED==="1" &&
    !!process.env.NEBIUS_API_KEY && !!process.env.CONTREE_PROJECT &&
    !!process.env.CONTREE_PYTHON_IMAGE && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
async function command(action:"start"|"status"){
  const client=createClient(publicConfig.supabaseUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const {data,error}=await client.rpc("dsa_bulk_certification_command",
    {p_action:action,p_args:{}});
  if(error)throw Error("CERTIFICATION_DATABASE_UNAVAILABLE");
  return data as {runId:string;status:string;pending?:number;queued?:number;running?:number}|null;
}
async function seedMessages(){
  const dispatch=await Promise.allSettled(Array.from({length:5},()=>
    send("dsa-certification",{tick:randomUUID()},
      {idempotencyKey:randomUUID(),retentionSeconds:3600})));
  return dispatch.filter(result=>result.status==="fulfilled").length;
}
/** Scheduled endpoint starts exactly one catalog-wide run on first deployment
 * and periodically recovers its queue deliveries. Completed runs never restart.
 * CRON_SECRET must be supplied by Vercel cron, never via a URL parameter.
 */
export async function GET(request:Request){
  if(!authorized(request))return Response.json({error:"Unauthorized"},{status:401});
  if(!configured())return Response.json({error:"Certification not configured"},{status:503});
  try{
    const current=await command("status");
    if(current?.status==="finished")return Response.json(current);
    const run=current??await command("start");
    const dispatched=run?.status==="running"?await seedMessages():0;
    return Response.json({...(run??{}),dispatched},{status:202});
  }catch{
    return Response.json({error:"Certification orchestration unavailable"},{status:503});
  }
}
/** Explicit operator action also starts/resumes the entire catalog, never an
 * arbitrary problem or submitted source; a single call initiates all jobs. */
export async function POST(request:Request){
  if(authorized(request)) return GET(request);
  if(!configured())return Response.json({error:"Certification not configured"},{status:503});
  const token=request.headers.get("x-certification-bootstrap")??"";
  if(!/^[a-f0-9]{64}$/.test(token))
    return Response.json({error:"Unauthorized"},{status:401});
  const client=createClient(publicConfig.supabaseUrl,process.env.SUPABASE_SERVICE_ROLE_KEY!,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  const {data,error}=await client.rpc("dsa_bulk_certification_bootstrap",{p_token:token});
  if(error||!data) return Response.json({error:"Unauthorized or already started"},{status:401});
  try{
    const dispatched=await seedMessages();
    return Response.json({...data,dispatched},{status:202});
  }catch{
    // Database run exists and the next signed cron delivery will recover it.
    return Response.json({run:data,dispatched:0,recovery:"scheduled"},{status:202});
  }
}