/** A failed publication must leave queue delivery retryable, not acknowledged. */
export class ReportDispatchError extends Error {
  constructor() {
    super("Code Intelligence dispatch is pending durable recovery.");
  }
}
export async function deliverReports(
  reserve: () => Promise<Array<{ id: string; generation: number }>>,
  publish: (id: string, generation: number) => Promise<unknown>,
) {
  try {
    const due = await reserve();
    const results = await Promise.allSettled(
      due.map(({ id, generation }) => publish(id, generation)),
    );
    if (results.some((r) => r.status === "rejected"))
      throw new ReportDispatchError();
    return { dispatched: results.length, pending: 0 };
  } catch {
    throw new ReportDispatchError();
  }
}
