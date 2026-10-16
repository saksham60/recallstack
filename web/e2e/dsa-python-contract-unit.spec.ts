import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pythonContractSchema, typedStarter, type PythonContract } from "../src/lib/dsa-execution/python-contract";
import { equal } from "../src/lib/dsa-execution/public-comparator";
import { HARNESS_SOURCE, HARNESS_SHA256 } from "../src/lib/dsa-execution/python/harness.generated";
import { executionPayload, PYTHON_SUPERVISOR } from "../src/lib/dsa-execution/runner";

const base: PythonContract = {entrypoint:"solve",inputMode:"kwargs",checker:"exact_json"};
test("generated browser and server harnesses match authoritative bytes",()=>{
  const source=readFileSync("src/lib/dsa-execution/python/runner_harness.py","utf8").replaceAll("\r\n","\n");
  expect(HARNESS_SOURCE).toBe(source);
  expect(createHash("sha256").update(source).digest("hex")).toBe(HARNESS_SHA256);
  expect(readFileSync("public/dsa/runner-harness.mjs","utf8")).toContain(JSON.stringify(source));
});
test("generated supervisor compiles and contains exact shared source; payload excludes expectations",()=>{
  const python=process.env.DSA_TEST_PYTHON ?? path.resolve(process.platform === "win32" ? "../backend/.venv/Scripts/python.exe" : "../backend/.venv/bin/python");
  const result=spawnSync(python,["-c","import sys; compile(sys.stdin.read(), 'supervisor.py', 'exec')"],{input:PYTHON_SUPERVISOR,encoding:"utf8"});
  expect(result.error).toBeUndefined(); expect(result.stderr).toBe(""); expect(result.status).toBe(0);
  expect(PYTHON_SUPERVISOR).toContain(JSON.stringify(HARNESS_SOURCE));
  const id=crypto.randomUUID();
  const payload=executionPayload({problemId:id,problemVersionId:id,language:"python",mode:"submit",code:"def solve(x): return x",idempotencyKey:id},{problemId:id,problemVersionId:id,certificateId:id,suiteId:id,exposeCounts:false,contract:base,cases:[{id,input:{x:1},expected:"PRIVATE EXPECTATION",visibility:"hidden"}]});
  expect(payload).not.toContain("PRIVATE EXPECTATION"); expect(payload).not.toContain("expected");
});
test("contract schemas reject unknown adapters, ambiguous fixtures and code in type annotations",()=>{
  const adapter={id:"reasonai-python",version:1,invocation:"function",parameters:[{name:"nums",pythonType:"List[int]",codec:"json"}],returnType:"int",result:{source:"return",codec:"json"}};
  for(const change of [{id:"unknown"},{version:2},{parameters:[{name:"class",pythonType:"int"}]},{parameters:[{name:"nums",pythonType:"int"},{name:"nums",pythonType:"int"}]},{parameters:[{name:"x",pythonType:"evil()"}]},{result:{source:"parameter",parameter:"absent",codec:"json"}},{parameters:[{name:"head",pythonType:"ListNode",codec:"node_ref"}]}]){
    expect(pythonContractSchema.safeParse({...base,adapter:{...adapter,...change}}).success).toBe(false);
  }
  expect(pythonContractSchema.safeParse({...base,checker:"numeric"}).success).toBe(false);
  expect(typedStarter(pythonContractSchema.parse({...base,adapter}))).toContain("def solve(nums: List[int]) -> int:");
});
test("fixed comparators preserve multiplicities, JSON types, and numerical rules",()=>{
  expect(equal({b:2,a:[1]}, {a:[1],b:2},base)).toBe(true);
  expect(equal(true,1,base)).toBe(false);
  expect(equal([1,2,2],[2,1,2],{...base,checker:"unordered_json"})).toBe(true);
  expect(equal([1,2],[1,1],{...base,checker:"unordered_json"})).toBe(false);
  expect(equal([[2,-1,-1],[1,0,-1]],[[-1,0,1],[-1,-1,2]],{...base,checker:"unordered_triplets"})).toBe(true);
  expect(equal([[0,0,0],[0,0,0]],[[0,0,0]],{...base,checker:"unordered_triplets"})).toBe(false);
  expect(equal([0.1+0.2],[0.3],{...base,checker:"numeric_json",absoluteTolerance:1e-8})).toBe(true);
  expect(equal([0.4],[0.3],{...base,checker:"numeric_json",absoluteTolerance:1e-8})).toBe(false);
  expect(equal(NaN,0,base)).toBe(false);
});
test("predicate checkers accept alternative valid answers and reject malformed outputs",()=>{
  const two={...base,checker:"two_sum_indices" as const}, topo={...base,checker:"topological_order" as const};
  expect(equal([2,0],[0,1],two,{nums:[2,2,2],target:4})).toBe(true);
  for(const wrong of [[0,0],[-1,1],[0,3],[0,1,2],["0",1]]) expect(equal(wrong,[0,1],two,{nums:[2,2,2],target:4})).toBe(false);
  const input={numCourses:3,prerequisites:[[2,0],[2,1]]};
  expect(equal([1,0,2],[0,1,2],topo,input)).toBe(true);
  expect(equal([2,0,1],[0,1,2],topo,input)).toBe(false);
  expect(equal([],[],topo,input)).toBe(false);
  expect(equal([],[],topo,{numCourses:2,prerequisites:[[0,1],[1,0]]})).toBe(true);
});
