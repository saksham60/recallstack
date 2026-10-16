// ReasonAI DSA - independently-authored JavaScript reference oracles (batch 4).
// No hidden test data or credentials in this file. Run against a private
// JSON array: [{slug, ordinal, input_json, expected_json}, ...].
// The SQL migration 20261016130133 anchors the 23 tested suite MD5 hashes.
import { readFileSync } from "node:fs";
const canonical=x=>Array.isArray(x)?"["+x.map(canonical).join(",")+"]":x&&typeof x==="object"?"{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}":JSON.stringify(x);
const numeric=(a,b)=>a-b;
function nextPermutation(a){
  if(a.length>8)throw Error("brute-force input exceeds 8");
  const found=new Set();
  function visit(prefix,remaining){
    if(!remaining.length){found.add(JSON.stringify(prefix));return}
    for(const value of new Set(remaining)){
      const idx=remaining.indexOf(value);
      visit([...prefix,value],[...remaining.slice(0,idx),...remaining.slice(idx+1)]);
    }
  }
  visit([],a);
  const permutations=[...found].map(JSON.parse);
  permutations.sort((x,y)=>{for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0});
  const n=permutations.findIndex(x=>JSON.stringify(x)===JSON.stringify(a));
  return permutations[(n+1)%permutations.length];
}
function maxProduct(a){if(!a.length)return 0;let best=-Infinity;for(let i=0;i<a.length;i++){let p=1;for(let j=i;j<a.length;j++){p*=a[j];best=Math.max(best,p)}}return best}
function mergeIntervals(intervals){const s=intervals.map(x=>[...x]).sort((x,y)=>x[0]-y[0]||x[1]-y[1]),out=[];for(const [a,b] of s){if(!out.length||out.at(-1)[1]<a)out.push([a,b]);else out.at(-1)[1]=Math.max(b,out.at(-1)[1])}return out}
function balanced(s){const opposites={")":"(","]":"[","}":"{"},st=[];for(const ch of s){if("([{".includes(ch))st.push(ch);else if(st.pop()!==opposites[ch])return false}return st.length===0}
function replace(s,k){let longest=0;for(let i=0;i<s.length;i++){const freq={};let greatest=0;for(let j=i;j<s.length;j++){freq[s[j]]=(freq[s[j]]||0)+1;greatest=Math.max(greatest,freq[s[j]]);if(j-i+1-greatest<=k)longest=Math.max(longest,j-i+1)}}return longest}
function palindrome(s){for(let n=s.length;n>0;n--)for(let i=0;i+n<=s.length;i++){const w=s.slice(i,i+n);if(w===w.split("").reverse().join(""))return w}return ""}
function window(s,t){if(!t.length)return "";const required={};for(const c of t)required[c]=(required[c]||0)+1;let best="";for(let i=0;i<s.length;i++){const count={};for(let j=i;j<s.length;j++){count[s[j]]=(count[s[j]]||0)+1;if(Object.keys(required).every(c=>(count[c]||0)>=required[c])){const candidate=s.slice(i,j+1);if(!best||candidate.length<best.length)best=candidate;break}}}return best}
function wildcard(s,p){const memo=new Map();function match(i,j){const key=i+":"+j;if(memo.has(key))return memo.get(key);const ok=j===p.length?i===s.length:p[j]==="*"?match(i,j+1)||(i<s.length&&match(i+1,j)):(i<s.length&&(p[j]==="?"||p[j]===s[i])&&match(i+1,j+1));memo.set(key,ok);return ok}return match(0,0)}
function spiral(m){if(!m.length||!m[0].length)return [];const out=[],seen=m.map(row=>row.map(()=>false)),dirs=[[0,1],[1,0],[0,-1],[-1,0]];let i=0,j=0,d=0;for(let k=0;k<m.length*m[0].length;k++){out.push(m[i][j]);seen[i][j]=true;let ni=i+dirs[d][0],nj=j+dirs[d][1];if(ni<0||ni>=m.length||nj<0||nj>=m[0].length||seen[ni][nj]){d=(d+1)%4;ni=i+dirs[d][0];nj=j+dirs[d][1]}i=ni;j=nj}return out}
function eightWayIslands(a){if(!a.length||!a[0].length)return 0;const visited=new Set();let count=0;for(let i=0;i<a.length;i++)for(let j=0;j<a[0].length;j++){if(a[i][j]!==1||visited.has(i+","+j))continue;count++;const work=[[i,j]];while(work.length){const [r,c]=work.pop(),key=r+","+c;if(visited.has(key))continue;visited.add(key);for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc){const x=r+dr,y=c+dc;if(x>=0&&x<a.length&&y>=0&&y<a[0].length&&a[x][y]===1&&!visited.has(x+","+y))work.push([x,y])}}}return count}
function noAdjacent(a){function visit(i,taken){if(i>=a.length)return 0;return Math.max(visit(i+1,false),taken?-Infinity:a[i]+visit(i+1,true))}return visit(0,false)}
function zeroSumPairs(a){const result=[];for(let i=0;i<a.length;i++){let sum=0;for(let j=i;j<a.length;j++){sum+=a[j];if(sum===0)result.push([i,j])}}return result}
function median(a){if(!a.length)return null;const sorted=[...a].sort(numeric);return sorted.length%2?sorted[Math.floor(sorted.length/2)]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2}
const oracles={
 7:p=>nextPermutation(p.nums),
 12:p=>p.nums.map((_,i)=>p.nums.reduce((acc,x,j)=>j===i?acc:acc*x,1)),
 13:p=>maxProduct(p.array),
 20:p=>mergeIntervals(p.intervals),
 26:p=>p.queries.map(([l,r])=>new Set(p.nums.slice(l,r+1)).size),
 31:p=>balanced(p.text),
 37:p=>replace(p.text,p.k),
 39:p=>palindrome(p.text),
 41:p=>nextPermutation(p.values),
 43:p=>window(p.s,p.t),
 44:p=>wildcard(p.text,p.pattern),
 48:p=>window(p.s,p.t),
 55:p=>spiral(p.matrix),
 58:p=>eightWayIslands(p.grid),
 71:p=>{for(const v of new Set(p.nums))if(p.nums.filter(x=>x===v).length>p.nums.length/2)return v;return null},
 73:p=>noAdjacent(p.values),
 75:p=>{let count=0;for(let i=0;i<p.nums.length;i++)for(let j=i+1;j<p.nums.length;j++)if(p.nums[i]>p.nums[j])count++;return count},
 77:p=>[...p.values].sort(numeric),
 78:p=>p.array.map((_,i)=>p.array.reduce((acc,x,j)=>j===i?acc:acc*x,1)),
 79:p=>{if(!p.values.length)return 0;const s=[...p.values].sort(numeric),target=s[Math.floor(s.length/2)];return s.reduce((acc,v)=>acc+Math.abs(v-target),0)},
 82:p=>median([...p.a,...p.b]),
 83:p=>p.array.map((_,i)=>median(p.array.slice(0,i+1))),
 84:p=>zeroSumPairs(p.nums)
};
export function independentOracle(slug,payload){const n=Number(slug.match(/^ultimate-dsa-(\\d{3})-/)?.[1]);if(!oracles[n])throw Error("No independent oracle for "+slug);return oracles[n](payload)}
if(process.argv[1]&&import.meta.url.endsWith(process.argv[1].replaceAll("\\","/"))){
 const data=JSON.parse(readFileSync(0,"utf8"));if(!Array.isArray(data))throw Error("Expected an array of fixture records");
 const groups={};let errors=0;
 for(const row of data){const k=row.slug;groups[k]??={cases:0,matched:0};groups[k].cases++;
 try{const output=independentOracle(k,row.input_json);if(canonical(output)===canonical(row.expected_json))groups[k].matched++;else errors++;}catch{errors++}}
 process.stdout.write(JSON.stringify({problems:Object.keys(groups).length,groups,errors})+"\\n");if(errors)process.exitCode=1;
}
