import type { ReactNode } from "react";
import { DSATutorMarkdown } from "../reasonai/DSATutorMarkdown";
import { usePublicTests, type Problem, type useDSAScope } from "./api";
import { RequestError } from "./Explorer";

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="studio-json">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
export function Examples({ problem }: { problem: Problem }) {
  return (
    <>
      {!problem.examples.length && (
        <p className="studio-muted">
          No statement examples have been provided.
        </p>
      )}
      {problem.examples.map((example, index) => (
        <article className="studio-example" key={index}>
          <h4>Example {index + 1}</h4>
          <div>
            <span className="studio-eyebrow">INPUT</span>
            <JsonBlock value={example.input} />
          </div>
          <div>
            <span className="studio-eyebrow">OUTPUT</span>
            <JsonBlock value={example.output} />
          </div>
          {example.explanation && <p>{example.explanation}</p>}
        </article>
      ))}
    </>
  );
}
export function Specification({ problem }: { problem: Problem }) {
  const contract = Object.entries(problem.function_contract).filter(
    ([, value]) => value != null,
  );
  return (
    <div className="studio-copy">
      <span className="studio-eyebrow">PROBLEM SPECIFICATION</span>
      <h2>{problem.title}</h2>
      <div className="studio-tags">
        <span className={`studio-badge ${problem.difficulty ?? ""}`}>
          {problem.difficulty ?? "Unrated"}
        </span>
        {[...problem.categories, ...problem.topics].map((item) => (
          <span className="studio-badge" key={item.id}>
            {item.name}
          </span>
        ))}
      </div>
      {problem.availability !== "available" && (
        <p className="studio-notice">
          Review pending · This specification is visible in reviewer preview.
        </p>
      )}
      {problem.description ? (
        <DSATutorMarkdown text={problem.description} />
      ) : (
        <p className="studio-muted">No description provided.</p>
      )}
      <h3>Function contract</h3>
      {contract.length ? (
        <dl className="studio-contract">
          {contract.map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>
                <JsonBlock value={value} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="studio-muted">
          A function contract has not been provided. Start with your own code;
          no template is assumed.
        </p>
      )}
      <h3>Constraints</h3>
      {problem.constraints.length ? (
        <ul>
          {problem.constraints.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="studio-muted">No constraints provided.</p>
      )}
      <h3>Examples</h3>
      <Examples problem={problem} />
      <h3>Contract languages</h3>
      <p className="studio-muted">
        {problem.supported_contract_languages.join(", ") ||
          "No contract languages declared."}
      </p>
      <p className="studio-version">
        Specification version <code>{problem.problem_version_id}</code>
      </p>
    </div>
  );
}
export function ApprovedTests({
  problem,
  scope,
}: {
  problem: Problem;
  scope: ReturnType<typeof useDSAScope>;
}) {
  const tests = usePublicTests(scope, problem);
  if (tests.isPending)
    return (
      <p role="status" className="studio-empty">
        Loading approved public tests…
      </p>
    );
  if (tests.isError && !tests.data)
    return (
      <RequestError error={tests.error} retry={() => void tests.refetch()} />
    );
  const cases = tests.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <p className="studio-muted">
        Verified public fixtures for this specification version. Statement
        examples are shown separately.
      </p>
      {!cases.length && (
        <p className="studio-notice">
          No approved public tests are available for this version.
        </p>
      )}
      {cases.map((test, index) => (
        <article className="studio-example" key={test.id}>
          <h4>Public test {index + 1}</h4>
          <span className="studio-eyebrow">INPUT</span>
          <JsonBlock value={test.input_json} />
          <span className="studio-eyebrow">EXPECTED OUTPUT</span>
          <JsonBlock value={test.expected_output_json} />
        </article>
      ))}
      {tests.isFetchNextPageError && (
        <RequestError
          error={tests.error}
          retry={() => void tests.fetchNextPage()}
        />
      )}
      {tests.hasNextPage && (
        <button
          type="button"
          disabled={tests.isFetchingNextPage}
          onClick={() => void tests.fetchNextPage()}
        >
          Load more tests
        </button>
      )}
    </>
  );
}
export function PanelTabs({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly { id: string; label: ReactNode }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="studio-tabs" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          aria-pressed={option.id === selected}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
