"use client";
import type { ExecutionState } from "./use-execution";
import { JsonBlock } from "../workspace/Specification";
export function ExecutionPanel({ execution }: { execution: ExecutionState }) {
  const { job } = execution;
  return (
    <div
      className="studio-result-copy studio-scroll"
      aria-label="Execution results"
    >
      <div role="status" className="studio-execution-status">
        <h3>
          {execution.creating
            ? "Sending execution request…"
            : job
              ? `Execution ${job.status.replaceAll("_", " ")}`
              : "No execution yet"}
        </h3>
        {execution.active && (
          <button
            type="button"
            disabled={execution.cancelling || execution.cancelRequested}
            onClick={() => void execution.cancel()}
          >
            {execution.cancelRequested
              ? "Cancellation requested"
              : "Cancel execution"}
          </button>
        )}
      </div>
      {job && (
        <>
          <p className="studio-muted">
            {job.mode === "run"
              ? "Public fixture run"
              : "Hidden-suite submission"}{" "}
            · {job.language} · Results belong to the code submitted for this
            execution.
          </p>
          <p className="studio-version">
            Submission <code>{job.submissionId}</code>
          </p>
        </>
      )}
      {execution.error && (
        <p className="studio-notice" role="alert">
          {execution.error}
        </p>
      )}
      {execution.needsRetry && (
        <div className="studio-notice">
          <p>
            The previous request could not be confirmed. Retry it with the
            original code and execution key.
          </p>
          <button
            type="button"
            disabled={execution.creating}
            onClick={() => void execution.retryCreate()}
          >
            Retry execution request
          </button>
        </div>
      )}
      {execution.pollingStopped && (
        <button type="button" onClick={execution.resume}>
          Resume status checks
        </button>
      )}
      {execution.missing && (
        <button type="button" onClick={execution.clearMissing}>
          Clear unavailable execution
        </button>
      )}
      {job?.error && (
        <p className="studio-notice" role="alert">
          {job.error}
        </p>
      )}
      {job?.result && (
        <>
          <h3 className="studio-verdict">
            {job.result.verdict.replaceAll("_", " ")}
          </h3>
          {job.result.totalTests !== undefined && (
            <p>
              {job.result.passedTests} / {job.result.totalTests} tests passed
            </p>
          )}
          <p className="studio-muted">
            {job.result.executionTimeMs !== undefined &&
              `Measured test time ${job.result.executionTimeMs} ms`}
            {job.result.memoryKiB !== undefined &&
              ` · Peak child memory ${job.result.memoryKiB} KiB`}
          </p>
          {job.mode === "run" &&
            job.result.publicCases?.map((row, index) => (
              <article className="studio-example" key={row.id}>
                <h4>
                  Public case {index + 1} · {row.verdict.replaceAll("_", " ")}
                </h4>
                <span className="studio-eyebrow">INPUT</span>
                <JsonBlock value={row.input} />
                <span className="studio-eyebrow">EXPECTED OUTPUT</span>
                <JsonBlock value={row.expectedOutput} />
                <span className="studio-eyebrow">ACTUAL OUTPUT</span>
                {"actualOutput" in row ? (
                  <JsonBlock value={row.actualOutput} />
                ) : (
                  <p className="studio-muted">No output returned</p>
                )}
                {row.stdout && (
                  <>
                    <span className="studio-eyebrow">STDOUT</span>
                    <JsonBlock value={row.stdout} />
                  </>
                )}
                {row.stderr && (
                  <>
                    <span className="studio-eyebrow">STDERR</span>
                    <JsonBlock value={row.stderr} />
                  </>
                )}
                {row.executionTimeMs !== undefined && (
                  <p className="studio-muted">
                    Measured time {row.executionTimeMs} ms
                  </p>
                )}
              </article>
            ))}
          {job.mode === "submit" && (
            <p className="studio-muted">
              Hidden inputs, outputs, logs and expected answers are kept
              private.
            </p>
          )}
        </>
      )}
    </div>
  );
}
