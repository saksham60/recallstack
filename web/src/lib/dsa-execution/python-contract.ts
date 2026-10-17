import { z } from "zod";

const keywords = new Set(
  "False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
    " ",
  ),
);
const identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z_0-9]{0,99}$/)
  .refine((name) => !keywords.has(name), "Python keywords are not identifiers");
const pythonType = z
  .string()
  .min(1)
  .max(150)
  .regex(/^[A-Za-z_0-9\[\], |.]+$/);
export const codecSchema = z.enum([
  "json",
  "linked_list",
  "tree",
  "graph",
  "node_ref",
  "node_index",
  "node_value",
]);
const inputCodec = z.enum(["json", "linked_list", "tree", "graph", "node_ref"]);
const outputCodec = z.enum([
  "json",
  "linked_list",
  "tree",
  "graph",
  "node_index",
  "node_value",
]);
const parameter = z
  .object({
    name: identifier,
    pythonType,
    codec: inputCodec.default("json"),
    nodeTable: identifier.optional(),
  })
  .strict()
  .superRefine((parameter, context) => {
    if (parameter.codec === "node_ref" && !parameter.nodeTable)
      context.addIssue({
        code: "custom",
        message: "Node references require a versioned node table",
      });
  });
export const adapterSchema = z
  .object({
    id: z.literal("reasonai-python"),
    version: z.literal(1),
    invocation: z.enum(["function", "method", "design"]),
    className: identifier.optional(),
    parameters: z.array(parameter).max(16),
    returnType: pythonType,
    result: z
      .object({
        source: z.enum(["return", "parameter"]),
        parameter: identifier.optional(),
        codec: outputCodec,
        identityParameter: identifier.optional(),
        requireDetached: z.boolean().optional(),
        prefixLengthFromReturn: z.boolean().optional(),
      })
      .strict(),
    methods: z
      .array(
        z
          .object({
            name: identifier,
            parameters: z.array(parameter).max(16),
            returnType: pythonType,
            resultCodec: outputCodec.default("json"),
          })
          .strict(),
      )
      .max(40)
      .optional(),
  })
  .strict()
  .superRefine((adapter, context) => {
    if (
      new Set(adapter.parameters.map((p) => p.name)).size !==
      adapter.parameters.length
    )
      context.addIssue({
        code: "custom",
        message: "Duplicate parameter names",
      });
    if (adapter.invocation !== "function" && !adapter.className)
      context.addIssue({
        code: "custom",
        message: "Class invocation requires a class name",
      });
    if (adapter.invocation === "design" && !adapter.methods?.length)
      context.addIssue({
        code: "custom",
        message: "Design invocation requires an approved method registry",
      });
    if (
      adapter.methods &&
      (new Set(adapter.methods.map((m) => m.name)).size !==
        adapter.methods.length ||
        adapter.methods.some(
          (m) =>
            m.name.startsWith("_") ||
            new Set(m.parameters.map((p) => p.name)).size !==
              m.parameters.length,
        ))
    )
      context.addIssue({
        code: "custom",
        message: "Invalid or duplicate design method definitions",
      });
    if (
      adapter.result.source === "parameter" &&
      !adapter.parameters.some((p) => p.name === adapter.result.parameter)
    )
      context.addIssue({
        code: "custom",
        message: "Mutation output must name an input parameter",
      });
    if (
      adapter.result.identityParameter &&
      !adapter.parameters.some(
        (p) =>
          p.name === adapter.result.identityParameter && p.codec === "node_ref",
      )
    )
      context.addIssue({
        code: "custom",
        message: "Identity output must name an approved input node reference",
      });
  });
export const pythonContractSchema = z
  .object({
    entrypoint: identifier,
    inputMode: z.enum(["kwargs", "args", "single"]),
    checker: z.enum([
      "exact_json",
      "unordered_json",
      "numeric",
      "numeric_json",
      "unordered_triplets",
      "two_sum_indices",
      "topological_order",
    ]),
    absoluteTolerance: z.number().finite().min(0).max(1).optional(),
    relativeTolerance: z.number().finite().min(0).max(1).optional(),
    adapter: adapterSchema.optional(),
  })
  .strict()
  .superRefine((contract, context) => {
    if (
      (contract.checker === "numeric" || contract.checker === "numeric_json") &&
      contract.absoluteTolerance === undefined
    )
      context.addIssue({
        code: "custom",
        message: "Numeric comparison requires an explicit tolerance",
      });
    if (
      contract.adapter &&
      contract.inputMode === "single" &&
      contract.adapter.invocation !== "design" &&
      contract.adapter.parameters.length !== 1
    )
      context.addIssue({
        code: "custom",
        message: "Single input invocation requires exactly one parameter",
      });
    if (
      contract.adapter?.parameters.some((p) => p.codec === "node_ref") &&
      contract.inputMode !== "kwargs"
    )
      context.addIssue({
        code: "custom",
        message: "Indexed node tables require keyword fixture binding",
      });
  });
export type PythonContract = z.infer<typeof pythonContractSchema>;

export const publicRunBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    suiteId: z.uuid(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    contractRevision: z.string().regex(/^[a-f0-9]{64}$/),
    harnessSha256: z.string().regex(/^[a-f0-9]{64}$/),
    contract: pythonContractSchema,
    cases: z
      .array(
        z
          .object({ id: z.uuid(), input: z.unknown(), expected: z.unknown() })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type PublicRunBundle = z.infer<typeof publicRunBundleSchema>;
export const approvedContractSchema = z
  .object({
    problemId: z.uuid(),
    problemVersionId: z.uuid(),
    contract: pythonContractSchema,
    contractRevision: z.string().regex(/^[a-f0-9]{64}$/),
    sourceNotice: z.string().max(500).nullable(),
  })
  .strict();
export type ApprovedContract = z.infer<typeof approvedContractSchema>;

/** Only approved explicit parameter metadata may produce a typed template. */
export function typedStarter(contract: PythonContract) {
  const a = contract.adapter;
  if (!a) return undefined;
  const params = (items: typeof a.parameters) =>
    items.map((p) => `${p.name}: ${p.pythonType}`).join(", ");
  const signature = (
    name: string,
    items: typeof a.parameters,
    output: string,
    method = false,
  ) =>
    `${method ? "    " : ""}def ${name}(${method ? "self" + (items.length ? ", " : "") : ""}${params(items)}) -> ${output}:`;
  const lines = [
    "from __future__ import annotations",
    "from typing import Any, Dict, List, Optional, Tuple",
    "",
  ];
  if (a.invocation === "function")
    lines.push(
      signature(contract.entrypoint, a.parameters, a.returnType),
      "    # Write your solution here.",
      "    pass",
    );
  else {
    lines.push(`class ${a.className}:`);
    if (a.invocation === "method")
      lines.push(
        signature(contract.entrypoint, a.parameters, a.returnType, true),
        "        # Write your solution here.",
        "        pass",
      );
    else {
      lines.push(
        signature("__init__", a.parameters, "None", true),
        "        pass",
      );
      for (const m of a.methods ?? [])
        lines.push(
          "",
          signature(m.name, m.parameters, m.returnType, true),
          "        pass",
        );
    }
  }
  return lines.join("\n") + "\n";
}
