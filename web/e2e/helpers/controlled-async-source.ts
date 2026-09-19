interface PendingRead<T> {
  resolve: (result: IteratorResult<T>) => void;
  reject: (error: unknown) => void;
}

/** Test-only async source whose next value is released explicitly, without timers. */
export interface ControlledAsyncSource<T> extends AsyncIterable<T> {
  emit(value: T): void;
  close(): void;
  fail(error: unknown): void;
  readonly cancelled: boolean;
}

export function createControlledAsyncSource<T>(): ControlledAsyncSource<T> {
  const queued: T[] = [];
  const pending: PendingRead<T>[] = [];
  let terminal: { type: "closed" } | { type: "failed"; error: unknown } | undefined;
  let cancelled = false;

  const settleTerminal = () => {
    while (pending.length) {
      const read = pending.shift()!;
      if (terminal?.type === "failed") read.reject(terminal.error);
      else read.resolve({ done: true, value: undefined });
    }
  };

  const source: ControlledAsyncSource<T> = {
    get cancelled() { return cancelled; },
    emit(value) {
      if (terminal || cancelled) throw new Error("Controlled source is already stopped.");
      const read = pending.shift();
      if (read) read.resolve({ done: false, value });
      else queued.push(value);
    },
    close() {
      if (terminal || cancelled) return;
      terminal = { type: "closed" };
      settleTerminal();
    },
    fail(error) {
      if (terminal || cancelled) return;
      terminal = { type: "failed", error };
      settleTerminal();
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          const value = queued.shift();
          if (value !== undefined) return Promise.resolve({ done: false, value });
          if (terminal?.type === "failed") return Promise.reject(terminal.error);
          if (terminal || cancelled) return Promise.resolve({ done: true, value: undefined });
          return new Promise((resolve, reject) => pending.push({ resolve, reject }));
        },
        return(): Promise<IteratorResult<T>> {
          cancelled = true;
          settleTerminal();
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };
  return source;
}
