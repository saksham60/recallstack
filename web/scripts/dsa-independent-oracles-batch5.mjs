// Reproducible independent ReasonAI DSA fixture oracles, batch 5.
// Read private fixture JSON on stdin, never commit fixture inputs or secret keys.
// SQL migration 20261016130707 binds results to hashed v2 suite snapshots.
import {readFileSync} from "node:fs";
const canonical=x=>Array.isArray(x)?"["+x.map(canonical).join(",")+"]":x&&typeof x==="object"?"{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}":JSON.stringify(x);
const lexical=(a,b)=>{for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length};
function minMerges(a){const memo=new Map();function solve(z){if(z.every((v,i)=>v===z[z.length-i-1]))return 0;const key=z.join(",");if(memo.has(key))return memo.get(key);let v=Infinity;for(let i=0;i<z.length-1;i++)v=Math.min(v,1+solve([...z.slice(0,i),z[i]+z[i+1],...z.slice(i+2)]));memo.set(key,v);return v}return solve(a)}
function largestString(a){let best="";function go(parts,rest){if(!rest.length){let x=parts.join("");if(x.length>best.length||(x.length===best.length&&x>best))best=x;return}const seen=new Set();for(let i=0;i<rest.length;i++){if(seen.has(rest[i]))continue;seen.add(rest[i]);go([...parts,rest[i]],[...rest.slice(0,i),...rest.slice(i+1)])}}go([],a.map(String));return best?best.replace(/^0+(?!$)/,""):""}
function combinations(a,r){const out=[];function go(i,p){if(p.length===r){out.push([...p]);return}for(let j=i;j<a.length;j++)go(j+1,[...p,a[j]])}go(0,[]);return out}
function palindromicSubseq(s){let ans=0;for(let mask=1;mask<1<<s.length;mask++){let part="";for(let i=0;i<s.length;i++)if(mask&(1<<i))part+=s[i];if(part===part.split("").reverse().join(""))ans++}return ans%1000000007}
function movesToFront(a,b){if(a.length!==b.length||[...a].sort().join("")!==[...b].sort().join(""))return -1;let j=b.length-1,keep=0;for(let i=a.length-1;i>=0&&j>=0;i--)if(a[i]===b[j]){j--;keep++}return a.length-keep}
function wordWrap(a,w){const memo=new Map();function dp(i){if(i===a.length)return 0;if(memo.has(i))return memo.get(i);let best=Infinity,n=0;for(let j=i;j<a.length;j++){n+=a[j]+(j>i?1:0);if(n>w)break;best=Math.min(best,j===a.length-1?0:(w-n)**2+dp(j+1))}memo.set(i,best);return best}return dp(0)}
function zigzag(a){if(!a.length||!a[0].length)return [];const out=[],R=a.length,C=a[0].length;for(let d=0;d<R+C-1;d++){const vals=[];for(let i=0;i<R;i++){let j=d-i;if(j>=0&&j<C)vals.push(a[i][j])}if(d%2===0)vals.reverse();out.push(...vals)}return out}
function hasWord(b,word){if(!word.length)return true;if(!b.length||!b[0].length)return false;const seen=new Set();function dfs(r,c,k){if(k===word.length)return true;const key=r+","+c;if(r<0||c<0||r>=b.length||c>=b[0].length||b[r][c]!==word[k]||seen.has(key))return false;seen.add(key);const result=dfs(r+1,c,k+1)||dfs(r-1,c,k+1)||dfs(r,c+1,k+1)||dfs(r,c-1,k+1);seen.delete(key);return result}for(let i=0;i<b.length;i++)for(let j=0;j<b[0].length;j++)if(dfs(i,j,0))return true;return false}
function capture(b){if(!b.length||!b[0].length)return b.map(x=>[...x]);const R=b.length,C=b[0].length,keep=new Set(),stack=[];for(let i=0;i<R;i++)stack.push([i,0],[i,C-1]);for(let j=0;j<C;j++)stack.push([0,j],[R-1,j]);while(stack.length){const [r,c]=stack.pop(),key=r+","+c;if(r<0||c<0||r>=R||c>=C||keep.has(key)||b[r][c]!=="O")continue;keep.add(key);stack.push([r+1,c],[r-1,c],[r,c+1],[r,c-1])}return b.map((row,i)=>row.map((v,j)=>v==="O"&&!keep.has(i+","+j)?"X":v))}
function common(a){if(!a.length||a.some(x=>!x.length))return null;return [...new Set(a[0])].sort((x,y)=>x-y).find(v=>a.every(row=>row.includes(v)))??null}
function rectangles(R,C){const out=[];for(let i=0;i<R;i++){let s="";for(let j=0;j<C;j++)s+=Math.min(i,j,R-i-1,C-j-1)%2?"O":"X";out.push(s)}return out}
function maxRectangle(a){if(!a.length||!a[0].length)return 0;let best=0;for(let i=0;i<a.length;i++)for(let j=0;j<a[0].length;j++)for(let k=i;k<a.length;k++)for(let l=j;l<a[0].length;l++){let ok=true;for(let x=i;x<=k&&ok;x++)for(let y=j;y<=l;y++)if(a[x][y]!==1){ok=false;break}if(ok)best=Math.max(best,(k-i+1)*(l-j+1))}return best}
function triplets(a,t){let n=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)for(let k=j+1;k<a.length;k++)if(a[i]+a[j]+a[k]<t)n++;return n}
function canSortReversal(a){const sorted=x=>x.every((v,i)=>i===0||v>=x[i-1]);if(sorted(a))return true;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){let x=[...a.slice(0,i),...a.slice(i,j+1).reverse(),...a.slice(j+1)];if(sorted(x))return true}return false}
function fourSum(a,t){const out=[],seen=new Set();for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)for(let k=j+1;k<a.length;k++)for(let l=k+1;l<a.length;l++)if(a[i]+a[j]+a[k]+a[l]===t){const v=[a[i],a[j],a[k],a[l]].sort((x,y)=>x-y),key=JSON.stringify(v);if(!seen.has(key)){seen.add(key);out.push(v)}}return out.sort(lexical)}
function cows(a,k){if(k>a.length||k<1)return -1;if(k===1)return 0;a=[...a].sort((x,y)=>x-y);let best=0;function go(i,p,last,dist){if(p===k){best=Math.max(best,dist);return}for(let j=i;j<=a.length-(k-p);j++)go(j+1,p+1,a[j],p?Math.min(dist,a[j]-last):Infinity)}go(0,0,0,Infinity);return best}
function pages(a,k){if(k>a.length||k<1)return -1;function go(i,groups){if(groups===1)return a.slice(i).reduce((x,y)=>x+y,0);let best=Infinity,total=0;for(let j=i;j<=a.length-groups;j++){total+=a[j];best=Math.min(best,Math.max(total,go(j+1,groups-1)))}return best}return go(0,k)}
function swaps(a){const s=[...a].sort((x,y)=>x-y),map=new Map(s.map((x,i)=>[x,i])),seen=new Set();let n=0;for(let i=0;i<a.length;i++){if(seen.has(i))continue;let j=i,count=0;while(!seen.has(j)){seen.add(j);count++;j=map.get(a[j])}n+=Math.max(0,count-1)}return n}
function combinationSum(a,t){a=[...new Set(a)].sort((x,y)=>x-y);const out=[];function go(i,remaining,p){if(remaining===0){out.push(p);return}if(i>=a.length)return;for(let n=0;n*a[i]<=remaining;n++)go(i+1,remaining-n*a[i],[...p,...Array(n).fill(a[i])])}go(0,t,[]);return out.sort(lexical)}
function equalSubset(a){const total=a.reduce((x,y)=>x+y,0);if(total%2)return false;let sums=new Set([0]);for(const x of a){const next=new Set(sums);for(const s of sums)next.add(s+x);sums=next}return sums.has(total/2)}
const algorithms={
21:p=>minMerges(p.values),22:p=>largestString(p.nums),25:p=>combinations(p.values,p.r),42:p=>palindromicSubseq(p.s),
47:p=>movesToFront(p.a,p.b),50:p=>wordWrap(p.lengths,p.width),53:p=>zigzag(p.matrix),57:p=>hasWord(p.board,p.word),
59:p=>capture(p.board),60:p=>common(p.matrix),61:p=>rectangles(p.rows,p.cols),62:p=>maxRectangle(p.grid),
65:p=>[...p.a].sort((x,y)=>x-y).every((v,i)=>v+[...p.b].sort((x,y)=>y-x)[i]>=p.k),
68:p=>p.nums.indexOf(p.target),70:p=>p.nums.some((v,i)=>p.nums.some((w,j)=>i!==j&&Math.abs(v-w)===p.difference)),
72:p=>triplets(p.array,p.threshold),74:p=>{const s=[...p.a,...p.b].sort((x,y)=>x-y);return {a:s.slice(0,p.a.length),b:s.slice(p.a.length)}},
80:p=>canSortReversal(p.array),81:p=>fourSum(p.nums,p.target),85:p=>cows(p.stalls,p.cows),
86:p=>pages(p.pages,p.students),87:p=>swaps(p.nums),91:p=>combinationSum(p.candidates,p.target),96:p=>equalSubset(p.nums)
};
export function independentOracle(slug,payload){const number=Number(slug.slice("ultimate-dsa-".length,"ultimate-dsa-".length+3));if(!(number in algorithms))throw Error("Unsupported problem "+slug);return algorithms[number](payload)}
if(process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll(String.fromCharCode(92),"/"))){
 const rows=JSON.parse(readFileSync(0,"utf8")),groups={},errors=[];
 for(const row of rows){const entry=groups[row.slug]??={cases:0,matched:0};entry.cases++;try{if(canonical(independentOracle(row.slug,row.input_json))===canonical(row.expected_json))entry.matched++;else errors.push({slug:row.slug,ordinal:row.ordinal})}catch(e){errors.push({slug:row.slug,ordinal:row.ordinal,error:String(e)})}}
 process.stdout.write(JSON.stringify({problems:Object.keys(groups).length,groups,errors:errors.slice(0,20),failures:errors.length})+"\n");
 if(errors.length)process.exitCode=1;
}
