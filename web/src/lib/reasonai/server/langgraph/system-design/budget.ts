import "server-only";

export interface SystemDesignBudgetLimits {
  totalModelCalls: number;
  generationModelCalls: number;
  toolRounds: number;
  duplicateCalls: number;
  validationRepairs: number;
  reviewIterations: number;
  deltaRepairs: number;
  requestDurationMs: number;
  cleanupReserveMs: number;
  reviewCallMs: number;
  repairCallMs: number;
}

// The route allows 120 seconds. Stop inference early enough to save and release
// the run lease. All stages share these counters and the same absolute deadline.
export const SYSTEM_DESIGN_BUDGET_DEFAULTS: Readonly<SystemDesignBudgetLimits> = {
  totalModelCalls: 12, generationModelCalls: 6, toolRounds: 4,
  duplicateCalls: 2, validationRepairs: 1, reviewIterations: 2, deltaRepairs: 2,
  requestDurationMs: 120_000, cleanupReserveMs: 15_000,
  reviewCallMs: 30_000, repairCallMs: 30_000,
};

export class SystemDesignBudgetError extends Error {
  constructor(readonly reason: string) { super("ReasonAI reached its execution budget."); this.name = "SystemDesignBudgetError"; }
}

export class SystemDesignBudget {
  readonly limits: SystemDesignBudgetLimits;
  readonly deadline: number;
  modelCalls = 0;
  generationCalls = 0;
  reviews = 0;
  repairs = 0;

  constructor(limits: Partial<SystemDesignBudgetLimits> = {}, startedAt = Date.now(), readonly now: () => number = Date.now) {
    this.limits = { ...SYSTEM_DESIGN_BUDGET_DEFAULTS, ...limits };
    for (const [key, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 0 || value > (key.endsWith("Ms") ? 120_000 : 100)) throw new Error("Invalid System Design execution budget.");
    }
    if (this.limits.requestDurationMs <= this.limits.cleanupReserveMs) throw new Error("Execution budget must reserve time for cleanup.");
    if (this.limits.reviewCallMs === 0 || this.limits.repairCallMs === 0) throw new Error("Model call timeouts must be positive.");
    this.deadline = startedAt + this.limits.requestDurationMs - this.limits.cleanupReserveMs;
  }

  check() {
    if (this.now() >= this.deadline) throw new SystemDesignBudgetError("request_deadline");
  }

  beginModelCall(stage: "generation" | "review" | "repair") {
    this.check();
    if (this.modelCalls >= this.limits.totalModelCalls) throw new SystemDesignBudgetError("total_model_calls");
    if (stage === "generation" && this.generationCalls >= this.limits.generationModelCalls) throw new SystemDesignBudgetError("generation_model_calls");
    if (stage === "review" && this.reviews >= this.limits.reviewIterations) throw new SystemDesignBudgetError("review_iterations");
    if (stage === "repair" && this.repairs >= this.limits.deltaRepairs) throw new SystemDesignBudgetError("delta_repairs");
    this.modelCalls++;
    if (stage === "generation") this.generationCalls++;
    else if (stage === "review") this.reviews++;
    else this.repairs++;
  }

  canReviewAgain() {
    return this.now() < this.deadline && this.reviews < this.limits.reviewIterations
      && this.modelCalls < this.limits.totalModelCalls;
  }

  async run<T>(execute: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal, maxMs = Infinity): Promise<T> {
    this.check();
    parent?.throwIfAborted();
    const controller = new AbortController();
    const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
    const remaining = Math.max(1, Math.min(this.deadline - this.now(), maxMs));
    const timer = setTimeout(() => controller.abort(new SystemDesignBudgetError(
      this.now() >= this.deadline ? "request_deadline" : "stage_timeout",
    )), remaining);
    let onAbort: (() => void) | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => { signal.throwIfAborted(); return execute(signal); }),
        new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) onAbort();
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
  }
}
