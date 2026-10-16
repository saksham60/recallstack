// ReasonAI V2 DSA: independently implemented, read-only oracle checks for batch 9.
// Private fixture JSON must be passed via stdin; no hidden fixtures or keys are stored here.
// Input: [{slug, input_json, expected_json, ordinal}, ...].
import { readFileSync } from "node:fs";
const num=(a,b)=>a-b;
const canon=x=>Array.isArray(x)?"["+x.map(canon).join(",")+"]":x&&typeof x==="object"?"{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canon(x[k])).join(",")+"}":JSON.stringify(x);
function lca(p){if(!p.values.includes(p.p)||!p.values.includes(p.q))return null;const path=(arr,x)=>{let o=[];while(arr.length){let m=(arr.length-1)>>1,v=arr[m];o.push(v);if(v===x)break;arr=x<v?arr.slice(0,m):arr.slice(m+1)}return o};let a=path(p.values,p.p),b=path(p.values,p.q),v=null;for(let i=0;i<Math.min(a.length,b.length)&&a[i]===b[i];i++)v=a[i];return v}
function predecessor(p){let a=[...new Set(p.keys)].sort(num);return {predecessor:a.filter(v=>v<p.target).at(-1)??null,successor:a.find(v=>v>p.target)??null}}
function conflicts(p){let out=[];for(let i=0;i<p.appointments.length;i++)for(let j=i+1;j<p.appointments.length;j++){let a=p.appointments[i],b=p.appointments[j];if(Math.max(a[0],b[0])<Math.min(a[1],b[1]))out.push([i,j])}return out}
function topk(p){let f=new Map();for(let n of p.nums)f.set(n,(f.get(n)??0)+1);return [...f].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,p.k).map(([n])=>n)}
function maxrepeat(p){if(!p.array.length)return null;let f=new Map();for(let n of p.array)f.set(n,(f.get(n)??0)+1);return [...f].sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0][0]}
function missing(p){let removed=new Set(p.removed),remaining=0;for(let i=1;;i++)if(!removed.has(i)&&++remaining===p.k)return i}
function stream(p){let out=[],a=[];for(let n of p.values){a.push(n);out.push(a.length<p.k?null:[...a].sort((x,y)=>y-x)[p.k-1])}return out}
function ropes(p){let memo=new Map();const solve=a=>{if(a.length<2)return 0;let key=[...a].sort(num).join(",");if(memo.has(key))return memo.get(key);let best=Infinity;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)best=Math.min(best,a[i]+a[j]+solve([...a.filter((_,k)=>k!==i&&k!==j),a[i]+a[j]]));memo.set(key,best);return best};return solve(p.ropes)}
function medianStream(p){let out=[],a=[];for(let x of p.values){a.push(x);let b=[...a].sort(num),n=b.length;out.push(n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2)}return out}
function shifted(p){let m=new Map();for(const s of p.strings){const offset=s.length?s.charCodeAt(0)-97:0,key=[...s].map(c=>(c.charCodeAt(0)-97-offset+26)%26).join(",");if(!m.has(key))m.set(key,[]);m.get(key).push(s)}return [...m.values()].map(g=>g.sort()).sort((a,b)=>a[0].localeCompare(b[0]))}
const oracles={
 229:lca,
 231:p=>{const v=p.level_order.filter(x=>x!==null);return v.length?Math.min(...v):null},
 232:predecessor,
 235:p=>p.k>=1&&p.k<=p.insertion_order.length?[...p.insertion_order].sort((a,b)=>b-a)[p.k-1]:null,
 237:p=>[...p.insert_order].sort(num)[p.k-1],
 239:p=>p.level_order.filter(v=>v!==null).sort(num),
 241:p=>p.insertion_order.filter(v=>v>=p.low&&v<=p.high).length,
 245:conflicts,
 246:p=>p.values.map((v,i)=>{const bigger=p.values.slice(i+1).filter(x=>x>v);return bigger.length?Math.min(...bigger):-1}),
 252:p=>{if(p.k<1||p.k>p.array.length)return null;const a=[...p.array].sort(num);let best=Infinity;for(let i=0;i+p.k<=a.length;i++)best=Math.min(best,a[i+p.k-1]-a[i]);return best},
 253:p=>[...p.nums].sort(num),254:topk,
 255:p=>[...p.values].sort((a,b)=>b-a).slice(0,p.k),
 256:p=>p.values.map((v,i)=>p.values.slice(i+1).find(x=>x>v)??-1),
 257:p=>{const a=[...p.values].sort(num);return {smallest:a[p.k-1],largest:a[a.length-p.k]}},
 258:maxrepeat,259:missing,
 260:p=>p.nums.filter(x=>x!==p.x).sort((a,b)=>Math.abs(a-p.x)-Math.abs(b-p.x)||a-b).slice(0,p.k).sort(num),
 261:stream,262:ropes,
 265:p=>{let best=0;for(let i=0;i<p.values.length;i++){let sum=0;for(let j=i;j<p.values.length;j++){sum+=p.values[j];if(sum===0)best=Math.max(best,j-i+1)}}return best},
 266:p=>{let out=[];for(let i=0;p.k>0&&i+p.k<=p.nums.length;i++)out.push(new Set(p.nums.slice(i,i+p.k)).size);return out},
 267:shifted,268:p=>p.lists.flat().sort(num),269:medianStream
};
export function independentOracle(slug,payload){const id=Number(slug.slice("ultimate-dsa-".length,"ultimate-dsa-".length+3));if(!oracles[id])throw Error("No oracle for "+slug);return oracles[id](payload)}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].replaceAll(String.fromCharCode(92),"/"))){
  const rows=JSON.parse(readFileSync(0,"utf8"));if(!Array.isArray(rows))throw Error("Expected an array");
  let pass=0;const byProblem={},failures=[];
  for(const row of rows){const item=byProblem[row.slug]??={checked:0,matched:0};item.checked++;try{const actual=independentOracle(row.slug,row.input_json);if(canon(actual)===canon(row.expected_json)){pass++;item.matched++}else failures.push({slug:row.slug,ordinal:row.ordinal})}catch(e){failures.push({slug:row.slug,ordinal:row.ordinal,error:String(e)})}}
  process.stdout.write(JSON.stringify({problems:Object.keys(byProblem).length,checked:rows.length,matched:pass,failures:failures.slice(0,10)})+"\n");
  if(failures.length)process.exitCode=1;
}