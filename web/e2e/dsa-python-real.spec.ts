// Real Pyodide, real WASM and real Worker. Only public API data is a UI fixture.
import { test, expect } from "./fixtures/authenticated-test";
import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import path from "node:path";
import { installV3API, ID, VERSION, canonical } from "./helpers/dsa-v3";
import { HARNESS_SHA256 } from "../src/lib/dsa-execution/python/harness.generated";
import type { PythonContract, PublicRunBundle } from "../src/lib/dsa-execution/python-contract";

const sumContract: PythonContract = {
  entrypoint: "array_total", inputMode: "kwargs", checker: "exact_json",
  adapter: { id: "reasonai-python", version: 1, invocation: "function", parameters: [{ name: "nums", pythonType: "List[int]", codec: "json" }], returnType: "int", result: { source: "return", codec: "json" } },
};
async function setup(page: Page, contract = sumContract, cases: Array<{input: unknown; expected: unknown}> = [{ input: { nums: [1, 2, 3] }, expected: 6 }]) {
  await installV3API(page);
  const assets = new Set(["pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]);
  // Controlled offline mirror from the exact pinned npm artifact. Never replace
  // the interpreter with a fake JS worker, even for timeout/error cases.
  await page.context().route("https://cdn.jsdelivr.net/pyodide/v0.28.3/full/**", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
    if (!assets.has(name)) return route.abort("blockedbyclient");
    return route.fulfill({ path: path.join(process.cwd(), "node_modules", "pyodide", name), contentType: name.endsWith(".wasm") ? "application/wasm" : name.endsWith(".json") ? "application/json" : name.endsWith(".zip") ? "application/octet-stream" : "text/javascript", headers: { "Access-Control-Allow-Origin": "*" } });
  });
  const bundle: PublicRunBundle = {
    schemaVersion: 1, problemId: ID, problemVersionId: VERSION,
    suiteId: "60000000-0000-4000-8000-000000000001", revision: "a".repeat(64),
    contractRevision: createHash("sha256").update(JSON.stringify(contract)).digest("hex"),
    harnessSha256: HARNESS_SHA256, contract,
    cases: cases.map((row, i) => ({ ...row, id: `70000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` })),
  };
  await page.route("**/api/dsa/execution-capabilities?**", (route) => route.fulfill({ json: { run: true, submit: true, languages: ["python"], publicRun: bundle } }));
  const posts: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/dsa/executions") posts.push(r.url()); });
  await page.goto(canonical);
  await expect(page.getByRole("textbox", { name: "Solution code", exact: true })).toBeVisible();
  return { bundle, posts };
}
async function paste(page: Page, source: string) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate((code) => navigator.clipboard.writeText(code), source);
  await page.getByRole("textbox", { name: "Solution code", exact: true }).focus();
  await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("ControlOrMeta+V");
}

test("actual Python executes typed signatures, unlocks exact-code Submit and makes zero sandbox POSTs", async ({ authenticatedPage: page }) => {
  const { posts } = await setup(page);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("def array_total(nums: List[int]) -> int:");
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
  await paste(page, "def array_total(nums: List[int]) -> int:\n    total = 0\n    for value in nums:\n        total += value\n    return total\n");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Local Run · All displayed cases passed" })).toBeVisible({ timeout: 70000 });
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeEnabled();
  expect(posts).toEqual([]);
  await paste(page, "def array_total(nums):\n    return 0\n");
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
});

test("actual Python reports syntax errors with solution line numbers", async ({ authenticatedPage: page }) => {
  await setup(page);
  await paste(page, "def array_total(nums):\n    return (\n");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("region", { name: "Code and tests" })).toContainText("SyntaxError", { timeout: 70000 });
  await expect(page.getByText(/File "solution.py", line 2/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit", exact: true })).toBeDisabled();
});

test("actual infinite Python is terminated and a subsequent Run gets a clean worker", async ({ authenticatedPage: page }) => {
  await setup(page);
  await paste(page, "def array_total(nums):\n    while True:\n        pass\n");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Timeout" })).toBeVisible({ timeout: 70000 });
  await paste(page, "def array_total(nums):\n    return sum(nums)\n");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Local Run · All displayed cases passed" })).toBeVisible({ timeout: 70000 });
});

const threeSum: PythonContract = { ...sumContract, entrypoint: "three_sum", checker: "unordered_triplets", adapter: { ...sumContract.adapter!, returnType: "List[List[int]]" } };
const correctThreeSum = `def three_sum(nums):
    nums = sorted(nums)
    answer = []
    for i in range(len(nums) - 2):
        if i and nums[i] == nums[i-1]:
            continue
        lo, hi = i + 1, len(nums) - 1
        while lo < hi:
            value = nums[i] + nums[lo] + nums[hi]
            if value == 0:
                answer.append([nums[i], nums[lo], nums[hi]])
                lo += 1
                hi -= 1
                while lo < hi and nums[lo] == nums[lo-1]:
                    lo += 1
            elif value < 0:
                lo += 1
            else:
                hi -= 1
    return answer
`;
const threeCases = [
  { input: {nums: [-1,0,1,2,-1,-4]}, expected: [[-1,-1,2],[-1,0,1]] },
  { input: {nums: []}, expected: [] },
  { input: {nums: [-2,-2,0,0,2,2,2]}, expected: [[-2,0,2]] },
  { input: {nums: [0,0,0,0,0]}, expected: [[0,0,0]] },
];
test("real 3Sum: standard, empty, duplicates and zeros pass; wrong solution fails", async ({authenticatedPage: page}) => {
  await setup(page, threeSum, threeCases);
  await paste(page, correctThreeSum);
  await page.getByRole("button", {name:"Run", exact:true}).click();
  await expect(page.getByRole("heading", {name:"Local Run · All displayed cases passed"})).toBeVisible({timeout:70000});
  await expect(page.getByRole("heading", {name:/Local case \d · Passed/})).toHaveCount(4);
  await paste(page, "def three_sum(nums):\n    return []\n");
  await page.getByRole("button", {name:"Run", exact:true}).click();
  await expect(page.getByRole("heading", {name:"Local Run · Some cases failed"})).toBeVisible({timeout:70000});
  await expect(page.getByRole("button", {name:"Submit", exact:true})).toBeDisabled();
});

for (const [name, source, error] of [
  ["indentation", " def array_total(nums):\n    return 6", "IndentationError"],
  ["runtime", "def array_total(nums):\n    raise RuntimeError('test failure')", "RuntimeError"],
  ["type", "def array_total(nums):\n    return 1 + 'x'", "TypeError"],
  ["name", "def array_total(nums):\n    return unknown_variable", "NameError"],
  ["index", "def array_total(nums):\n    return nums[100]", "IndexError"],
  ["recursion", "def array_total(nums):\n    return array_total(nums)", "RecursionError"],
  ["stdout limit", "def array_total(nums):\n    print('x' * 5000)\n    return 6", "4096-byte limit"],
  ["serialization", "def array_total(nums):\n    return object()", "not JSON serializable"],
] as const) test(`real Python diagnoses ${name}`, async ({authenticatedPage: page}) => {
  await setup(page); await paste(page, source);
  await page.getByRole("button", {name:"Run",exact:true}).click();
  await expect(page.getByRole("region", {name:"Code and tests"})).toContainText(error, {timeout:70000});
  await expect(page.getByRole("button", {name:"Submit",exact:true})).toBeDisabled();
});

const adapted = (change: Partial<NonNullable<PythonContract["adapter"]>>): PythonContract => ({ ...sumContract, adapter:{...sumContract.adapter!, ...change} });
const structural: Array<{name:string; contract:PythonContract; source:string; cases:Array<{input:unknown;expected:unknown}>}> = [
  {name:"large input",contract:sumContract,source:"def array_total(nums):\n    return sum(nums)", cases:[{input:{nums:Array.from({length:5000},(_,i)=>i)},expected:12497500}]},
  {name:"float tolerance",contract:{...sumContract, checker:"numeric_json", absoluteTolerance:0.0001, relativeTolerance:0.00001},source:"def array_total(nums):\n    return [0.1 + 0.2]",cases:[{input:{nums:[]},expected:[0.3]}]},
  {name:"unordered comparison",contract:{...sumContract,checker:"unordered_json"},source:"def array_total(nums):\n    return list(reversed(nums))",cases:[{input:{nums:[1,2,2]},expected:[1,2,2]}]},
  {name:"in-place mutation",contract:adapted({result:{source:"parameter",parameter:"nums",codec:"json"},returnType:"None"}),source:"def array_total(nums):\n    nums.reverse()",cases:[{input:{nums:[1,2,3]},expected:[3,2,1]}]},
  {name:"stateful class design",contract:adapted({invocation:"design",className:"Counter",parameters:[],returnType:"Any",methods:[{name:"add",parameters:[{name:"n",pythonType:"int",codec:"json"}],returnType:"int",resultCodec:"json"}]}),source:"class Counter:\n    def __init__(self):\n        self.value = 0\n    def add(self, n):\n        self.value += n\n        return self.value",cases:[{input:{operations:["Counter","add","add"],arguments:[[],[2],[3]]},expected:[null,2,5]},{input:{operations:["Counter","add"],arguments:[[],[1]]},expected:[null,1]}]},
  {name:"tree serialization",contract:adapted({parameters:[{name:"root",pythonType:"Optional[TreeNode]",codec:"tree"}],returnType:"Optional[TreeNode]",result:{source:"return",codec:"tree"}}),source:"def array_total(root):\n    return root",cases:[{input:{root:[1,null,2,3]},expected:[1,null,2,3]},{input:{root:[]},expected:[]}]},
  {name:"linked-list serialization",contract:adapted({parameters:[{name:"head",pythonType:"Optional[ListNode]",codec:"linked_list"}],returnType:"Optional[ListNode]",result:{source:"return",codec:"linked_list"}}),source:"def array_total(head):\n    previous = None\n    while head:\n        following = head.next\n        head.next = previous\n        previous, head = head, following\n    return previous",cases:[{input:{head:[1,2,3]},expected:[3,2,1]}]},
  {name:"imported globals isolated per test",contract:sumContract,source:"import builtins\ndef array_total(nums):\n    builtins._dsa_counter = getattr(builtins, '_dsa_counter', 0) + 1\n    print('bounded stdout')\n    return builtins._dsa_counter",cases:[{input:{nums:[]},expected:1},{input:{nums:[]},expected:1}]},
];
for (const entry of structural) test(`real Python supports ${entry.name}`, async ({authenticatedPage: page}) => {
  await setup(page,entry.contract,entry.cases); await paste(page,entry.source);
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Local Run · All displayed cases passed"})).toBeVisible({timeout:70000});
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeEnabled();
});

test("real local cancellation and navigation terminate active work", async ({authenticatedPage:page}) => {
  await setup(page); await paste(page,"def array_total(nums):\n    while True:\n        pass");
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await expect(page.getByRole("heading",{name:/Running case 1 of 1/})).toBeVisible({timeout:70000});
  await page.getByRole("button",{name:"Cancel local Run"}).click();
  await expect(page.getByRole("heading",{name:"Local Run · Cancelled"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await page.getByRole("link",{name:"DSA",exact:true}).last().click();
  await expect(page).toHaveURL(/\/dsa$/);
  await page.goto(canonical);
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeDisabled();
});

test("runtime download failure is diagnosed and does not unlock Submit", async ({authenticatedPage:page}) => {
  await setup(page);
  await page.context().route("https://cdn.jsdelivr.net/pyodide/**",r=>r.abort("failed"));
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:/Python initialization or worker failure/})).toBeVisible({timeout:70000});
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeDisabled();
});

test("real repeated warm Run, refresh, and custom input preserve the eligibility boundary",async({authenticatedPage:page})=>{
  await setup(page); await paste(page,"def array_total(nums):\n    return sum(nums)");
  for(let i=0;i<2;i++){
    await page.getByRole("button",{name:"Run",exact:true}).click();
    await expect(page.getByRole("heading",{name:"Local Run · All displayed cases passed"})).toBeVisible({timeout:70000});
    await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeEnabled();
    await expect(page.getByText(/Interpreter initialization:/)).toBeVisible();
  }
  await page.reload();
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Custom testcase",exact:true}).click();
  await page.getByLabel("Custom input JSON").fill('{"nums":[10,20]}');
  await page.getByRole("button",{name:"Run custom input",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Custom input · Executed"})).toBeVisible({timeout:70000});
  await expect(page.getByRole("button",{name:"Submit",exact:true})).toBeDisabled();
});

test("Python worker CSP blocks first-party authenticated fetch",async({authenticatedPage:page})=>{
  await setup(page);
  let requests=0;
  await page.context().route("**/api/dsa/private-probe",r=>{requests++;return r.fulfill({json:{secret:"never"}});});
  const source="from js import fetch\ndef array_total(nums):\n    fetch('/api/dsa/private-probe')\n    return 6";
  await paste(page,source);
  await page.getByRole("button",{name:"Run",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Local Run · All displayed cases passed"})).toBeVisible({timeout:70000});
  expect(requests).toBe(0);
});
