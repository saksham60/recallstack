import "server-only";
import {
  ClosableStreamRepr,
  ContreeClient,
  InstanceNetworking,
  InstanceResourcesLimits,
  isTerminalStatus,
} from "contree-client";
import { z } from "zod";
import { getConTreeConfiguration } from "@/lib/config/server";
import { executionPayload, PYTHON_SUPERVISOR } from "./runner";
import {
  ExecutionError,
  OPERATION_TIMEOUT_SECONDS,
  type SandboxAdapter,
  type OperationResult,
} from "./types";

const outputSchema = z
  .object({
    cases: z
      .array(
        z
          .object({
            id: z.uuid(),
            actual: z.unknown().optional(),
            status: z.enum([
              "ok",
              "runtime_error",
              "syntax_error",
              "time_limit_exceeded",
              "output_limit_exceeded",
            ]),
            stdout: z.string().max(4096).optional(),
            stderr: z.string().max(4096).optional(),
            executionTimeMs: z.number().int().min(0).max(30000).optional(),
          })
          .strict(),
      )
      .max(100),
    memoryKiB: z.number().int().min(0).max(1048576),
  })
  .strict();
export function createSandboxAdapter(): SandboxAdapter {
  const config = getConTreeConfiguration();
  if (!config.apiKey || !config.project || !config.pythonImage)
    throw new ExecutionError(
      "NOT_CONFIGURED",
      "Code execution is not configured.",
    );
  const client = new ContreeClient(config.apiKey, {
    baseUrl: config.baseUrl,
    project: config.project,
    timeout: 8,
    retry: null,
  });
  const hostname = (id: string) => `dsa-${id}`;
  return {
    async start(id, request, plan) {
      const input = executionPayload(request, plan);
      // Never retry POST after an ambiguous response. Recovery discovers this
      // unique hostname; its durable capacity slot stays reserved until terminal.
      const operation = await client.spawnInstance(
        "/usr/local/bin/python3",
        config.pythonImage!,
        {
          args: ["-I", "-c", PYTHON_SUPERVISOR],
          stdin: new ClosableStreamRepr({
            value: Buffer.from(input).toString("base64"),
            encoding: "base64",
            close: true,
          }),
          uid: 0,
          gid: 0,
          hostname: hostname(id),
          shell: false,
          env: {},
          preserveEnv: false,
          disposable: true,
          networking: new InstanceNetworking({ enabled: false }),
          resourcesLimits: new InstanceResourcesLimits({
            maxLayerBytes: 134217728,
          }),
          timeout: OPERATION_TIMEOUT_SECONDS,
          truncateOutputAt: 131072,
        },
      );
      if (!operation.uuid)
        throw new ExecutionError(
          "SPAWN_UNCERTAIN",
          "The sandbox start could not be confirmed.",
        );
      return operation.uuid;
    },
    async find(id, launchedAt) {
      const deadline = Date.now() + 12000;
      // Inspect at most 200 provider summaries, including terminal operations.
      for await (const summary of client.iterOperations({
        kind: "instance",
        since: new Date(Date.parse(launchedAt) - 60000),
        limit: 200,
        pageSize: 50,
      })) {
        if (Date.now() >= deadline) break;
        if (!summary.uuid) continue;
        const operation = await client.getOperationStatus(summary.uuid);
        if (
          operation.metadata &&
          "hostname" in operation.metadata &&
          operation.metadata.hostname === hostname(id)
        )
          return summary.uuid;
      }
      return undefined;
    },
    async inspect(id): Promise<OperationResult> {
      const operation = await client.getOperationStatus(id);
      if (!operation.status || !isTerminalStatus(operation.status))
        return { terminal: false };
      if (operation.status === "CANCELLED")
        return { terminal: true, cancelled: true };
      if (operation.status === "FAILED")
        return { terminal: true, infrastructureFailure: true };
      const result =
        operation.metadata && "result" in operation.metadata
          ? operation.metadata.result
          : undefined;
      if (result?.state?.timedOut) return { terminal: true, timedOut: true };
      if (result?.state?.exitCode !== 0)
        return { terminal: true, malformed: true };
      try {
        const raw = result.stdout?.asText() ?? "";
        if (Buffer.byteLength(raw) > 131072)
          return { terminal: true, malformed: true };
        const output = outputSchema.parse(JSON.parse(raw));
        return {
          terminal: true,
          cases: output.cases,
          memoryKiB: output.memoryKiB,
        };
      } catch {
        return { terminal: true, malformed: true };
      }
    },
    async cancel(id) {
      await client.cancelOperation(id);
    },
  };
}
