import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  ContreeClient,
  InstanceNetworking,
  InstanceResourcesLimits,
  isTerminalStatus,
} from "contree-client";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const root = fileURLToPath(new URL("../", import.meta.url));
loadEnvConfig(root, true, { info() {}, error() {} });

const token = process.env.NEBIUS_API_KEY;
const project = process.env.CONTREE_PROJECT;
const baseUrl = process.env.CONTREE_URL || "https://api.tokenfactory.nebius.com/sandboxes";
const image = process.env.CONTREE_PYTHON_IMAGE;
const active = new Set();
const operations = [];
let client;

async function smoke() {
  assert(token, "NEBIUS_API_KEY is required");
  assert(project, "CONTREE_PROJECT is required");
  assert(image, "CONTREE_PYTHON_IMAGE is required");
  const endpoint = new URL(baseUrl);
  assert(endpoint.protocol === "https:" && !endpoint.username && !endpoint.password,
    "ConTree requires an HTTPS endpoint without embedded credentials");
  assert(["api.tokenfactory.nebius.com", "api.studio.nebius.com"].includes(endpoint.hostname),
    "This smoke check only sends credentials to official Nebius sandbox endpoints");
  client = new ContreeClient(token, { baseUrl, project, timeout: 25 });
  const identity = await client.whoami();
  assert(identity.permissions.spawn && identity.permissions.spawn_disposable,
    "The configured token cannot create disposable sandboxes");
  assert(identity.permissions.cancel, "The configured token cannot cancel sandboxes");
  const baseline = identity.operationsStat?.running_instances;
  assert(Number.isInteger(baseline) && baseline >= 0, "ConTree did not report running instance usage");
  assert(baseline < 5, "Five or more operations are already active; defer the smoke test");
  const runtime = await client.resolveImage(image);
  await client.inspectImage(runtime);
  console.log(JSON.stringify({ stage: "authenticated", project, runtime,
    permissions: identity.permissions, limits: identity.limits?.toWire?.() ?? identity.limits }));

  async function execute(name, code, timeout, cancel = false) {
    const started = performance.now();
    // These are fixed smoke programs, never application/user-submitted code.
    // Host environment variables and credentials are never passed to the VM.
    const spawned = await client.spawnInstance("/usr/local/bin/python3", runtime, {
      args: ["-I", "-c", code], shell: false, env: {}, preserveEnv: false,
      disposable: true, networking: new InstanceNetworking({ enabled: false }),
      resourcesLimits: new InstanceResourcesLimits({ maxLayerBytes: 134217728 }),
      timeout, truncateOutputAt: 4096,
    });
    assert(spawned.uuid, "ConTree did not return an operation ID");
    active.add(spawned.uuid);
    if (cancel) {
      const deadline = performance.now() + 15000;
      let status;
      do {
        status = await client.getOperationStatus(spawned.uuid);
        if (status.status === "EXECUTING" || isTerminalStatus(status.status)) break;
        await delay(250);
      } while (performance.now() < deadline);
      assert.equal(status.status, "EXECUTING", "Cancellation test never reached execution");
      await client.cancelOperation(spawned.uuid);
    }
    const operation = await client.waitOperation(spawned.uuid, { timeout: 40 });
    assert(isTerminalStatus(operation.status), "Operation did not become terminal");
    active.delete(spawned.uuid);
    const result = operation.metadata?.result;
    const summary = {
      name, operationId: spawned.uuid, status: operation.status,
      exitCode: result?.state?.exitCode ?? null, signal: result?.state?.signal ?? null,
      timedOut: result?.state?.timedOut ?? false,
      stdout: result?.stdout?.asText() ?? "", stderr: result?.stderr?.asText() ?? "",
      elapsedMs: Math.round(performance.now() - started),
      disposable: operation.metadata?.disposable === true,
      resultImage: operation.resultImageUuid ?? operation.result?.image ?? null,
    };
    assert(summary.disposable, "Operation was not disposable");
    operations.push(summary);
    console.log(JSON.stringify({ stage: "execution", ...summary,
      stdout: name === "output_limit" ? `[${summary.stdout.length} characters]` : summary.stdout }));
    return summary;
  }

  const hello = await execute("python_stdout_stderr", [
    "import json, os, socket, sys",
    "blocked = False",
    "try:",
    "    connection = socket.create_connection(('1.1.1.1', 443), timeout=1)",
    "    connection.close()",
    "except OSError:",
    "    blocked = True",
    "print(json.dumps({'message':'sandbox-ok','sum':sum([1,2,3]),'python':sys.version.split()[0],",
    "                  'private_env_present':any(k in os.environ for k in ['NEBIUS_API_KEY','CONTREE_PROJECT']),",
    "                  'network_blocked':blocked}))",
    "print('sandbox-stderr-ok', file=sys.stderr)",
  ].join("\n"), 10);
  assert.equal(hello.status, "SUCCESS");
  assert.equal(hello.exitCode, 0);
  const output = JSON.parse(hello.stdout);
  assert.equal(output.message, "sandbox-ok");
  assert.equal(output.sum, 6);
  assert.match(output.python, /^3\.12\./);
  assert.equal(output.private_env_present, false);
  assert.equal(output.network_blocked, true);
  assert.equal(hello.stderr.trim(), "sandbox-stderr-ok");

  const error = await execute("nonzero_exit", "import sys; print('expected-error', file=sys.stderr); sys.exit(7)", 10);
  assert.equal(error.exitCode, 7);
  assert.equal(error.stderr.trim(), "expected-error");

  const bounded = await execute("output_limit", "print('x' * 20000)", 10);
  assert.equal(bounded.exitCode, 0);
  assert(bounded.stdout.length > 0 && bounded.stdout.length <= 4096);

  const timeout = await execute("execution_timeout", "import time; time.sleep(60)", 2);
  assert.equal(timeout.timedOut, true);

  const cancelled = await execute("cancellation", "import time; time.sleep(60)", 20, true);
  assert.equal(cancelled.status, "CANCELLED");

  for (const operation of operations) {
    const final = await client.getOperationStatus(operation.operationId);
    assert(isTerminalStatus(final.status), "A smoke operation is still active");
  }
  const after = await client.whoami();
  const report = {
    testedAt: new Date().toISOString(), clientVersion: "0.4.1", project, baseUrl,
    runtimeImage: runtime, testsPassed: operations.length,
    activeSmokeOperations: active.size, runningInstancesBefore: baseline,
    runningInstancesAfter: after.operationsStat?.running_instances ?? null,
    operations,
  };
  const destination = new URL("../.next/cache/contree-smoke.json", import.meta.url);
  await mkdir(new URL("./", destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ stage: "passed", tests: operations.length,
    activeSmokeOperations: active.size, runningInstancesAfter: report.runningInstancesAfter }));
}

try {
  await smoke();
} catch (error) {
  const detail = String(error.message ?? "Sandbox smoke check failed").replaceAll(token || "\0", "[REDACTED]");
  console.error(JSON.stringify({ stage: "failed", error: error.name, detail: detail.slice(0, 1000) }));
  process.exitCode = 1;
} finally {
  if (client) {
    for (const operationId of active) {
      try {
        await client.cancelOperation(operationId);
        const operation = await client.waitOperation(operationId, { timeout: 30 });
        if (!isTerminalStatus(operation.status)) throw new Error("Cleanup did not finish");
        active.delete(operationId);
      } catch {
        console.error(JSON.stringify({ stage: "cleanup_failed", operationId }));
        process.exitCode = 1;
      }
    }
    await client.close();
  }
}
