"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Copy,
  Layers3,
  ListFilter,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  SquareCode,
} from "lucide-react";
import { useAuth } from "@/features/auth";
import { useProfile } from "@/features/profile";
import { DSATutorPanel } from "../reasonai/DSATutorPanel";
import { DSAVisualLesson } from "../reasonai/DSAVisualLesson";
import { useDSATutor } from "../reasonai/use-dsa-tutor";
import {
  useDSAScope,
  useProblem,
  useNotes,
  type Problem,
  type ProblemItem,
} from "./api";
import { Explorer, RequestError } from "./Explorer";
import { BookmarkControl, LearnerPanel } from "./LearnerPanel";
import {
  ApprovedTests,
  Examples,
  PanelTabs,
  Specification,
} from "./Specification";
import { PaneResize } from "./PaneResize";
import { draftKey, pythonStarterCode, readDraft, type Draft } from "./drafts";
import { useExecution, type ExecutionState } from "../execution/use-execution";
import {
  publicRunBundleSchema,
  approvedContractSchema,
  typedStarter,
  type PublicRunBundle,
  type ApprovedContract,
} from "@/lib/dsa-execution/python-contract";
import { ExecutionPanel } from "../execution/ExecutionPanel";
import { SubmissionIntelligence } from "../execution/CodeIntelligence";
import {
  useLocalPythonRun,
  type LocalTestCase,
} from "../execution/use-local-python-run";
import { usePracticeSubmissions } from "../execution/use-practice-submissions";
import { problemHref } from "../navigation/urls";
import { LearningResources } from "./LearningResources";
import { rememberProblem } from "../navigation/resume";
import "./workspace.css";

const CodeEditor = dynamic(() => import("./CodeEditor"), {
  ssr: false,
  loading: () => <p className="studio-empty">Loading code editor…</p>,
});
const LAYOUTS = ["judgment", "classic", "visual"] as const;
type Layout = (typeof LAYOUTS)[number];
const LANGUAGE_OPTIONS = [
  { id: "python", label: "Python 3" },
  { id: "typescript", label: "TypeScript" },
  { id: "cpp", label: "C++" },
];
function preferenceKey(user: string) {
  return `reasonai:dsa:layout:1:${user}`;
}
function savedLayout(user: string): Layout {
  try {
    const value = localStorage.getItem(preferenceKey(user));
    if (LAYOUTS.includes(value as Layout)) return value as Layout;
  } catch {
    /* Browser storage may be unavailable. */
  }
  return "judgment";
}
export default function Workspace({
  problemId,
  versionId,
  preview,
  submissionId,
}: {
  problemId?: string;
  versionId?: string;
  preview: boolean;
  submissionId?: string;
}) {
  const router = useRouter(),
    { user, isLoading } = useAuth();
  const profile = useProfile(),
    scope = useDSAScope(preview);
  const [explorerOpen, setExplorerOpen] = useState(!problemId);
  const problem = useProblem(scope, problemId, versionId);
  useEffect(() => {
    if (user?.id && problem.data && !preview)
      rememberProblem(user.id, problem.data);
  }, [user?.id, problem.data, preview]);
  const canPreview = profile.data?.roles.some(
    (role) => role === "admin" || role === "reviewer",
  );
  function select(item: ProblemItem) {
    setExplorerOpen(false);
    router.replace(problemHref(item, { preview }), { scroll: false });
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setExplorerOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  return (
    <div className="dsa-studio">
      <div className="studio-topbar">
        <nav className="studio-brand" aria-label="Breadcrumb">
          <Link href={preview ? "/dsa?preview=true" : "/dsa"}>DSA</Link>
          <ChevronRight size={13} />
          {problem.data?.categories[0] && (
            <>
              <Link
                href={`/dsa/${encodeURIComponent(problem.data.categories[0].slug)}${preview ? "?preview=true" : ""}`}
              >
                {problem.data.categories[0].name}
              </Link>
              <ChevronRight size={13} />
            </>
          )}
          <span>{problem.data?.title ?? "Problem"}</span>
        </nav>
        <div className="studio-actions">
          {canPreview && (
            <Link
              className={
                preview ? "studio-preview-link active" : "studio-preview-link"
              }
              href={
                problem.data
                  ? problemHref(problem.data, { preview: !preview })
                  : "/dsa"
              }
            >
              {preview ? "Exit preview" : "Reviewer preview"}
            </Link>
          )}
          <button type="button" onClick={() => setExplorerOpen(true)}>
            <ListFilter size={15} />
            Problems <kbd>Ctrl K</kbd>
          </button>
        </div>
      </div>
      {preview && (
        <div className="studio-preview-banner">
          Reviewer preview · Draft specifications require admin or reviewer
          authorization. <Link href="/dsa">Return to learner catalog</Link>
        </div>
      )}
      {isLoading ? (
        <div role="status" className="studio-empty">
          Restoring your session…
        </div>
      ) : problemId && problem.isPending ? (
        <div role="status" className="studio-empty">
          Loading specification…
        </div>
      ) : problemId && problem.error ? (
        <div className="studio-welcome">
          <h1>Problem unavailable</h1>
          <p>
            This version may no longer be published, or preview access may be
            restricted. Your local draft is retained.
          </p>
          <RequestError
            error={problem.error}
            retry={() => void problem.refetch()}
          />
          <button type="button" onClick={() => setExplorerOpen(true)}>
            Choose another problem
          </button>
          <Link
            href={
              problem.data
                ? `/dsa/problem/${encodeURIComponent(problem.data.slug)}${preview ? "?preview=true" : ""}`
                : "/dsa"
            }
          >
            Load current specification
          </Link>
        </div>
      ) : problem.data && user ? (
        <ProblemWorkspace
          key={`${user.id}:${preview}:${problem.data.id}:${problem.data.problem_version_id}:${submissionId ?? "latest"}`}
          problem={problem.data}
          preview={preview}
          userId={user.id}
          submissionId={submissionId}
        />
      ) : (
        <div className="studio-welcome">
          <div className="studio-welcome-icon">
            <SquareCode size={36} />
          </div>
          <span className="studio-eyebrow">THINK. CODE. UNDERSTAND.</span>
          <h1>Your algorithm workspace</h1>
          <p>
            Explore a problem, develop your approach, and reason through it with
            your AI tutor.
          </p>
          <button
            type="button"
            className="studio-primary"
            onClick={() => setExplorerOpen(true)}
          >
            <Layers3 size={17} />
            Explore problems
          </button>
          <Link href="/dsa/library">
            Continue with your study notes <ChevronRight size={14} />
          </Link>
          <p className="studio-muted">
            Your drafts stay in this browser, scoped to your account and
            specification version.
          </p>
        </div>
      )}
      {explorerOpen && (
        <Explorer
          key={`${scope.userId}:${preview}`}
          scope={scope}
          selected={problemId}
          onSelect={select}
          onClose={() => setExplorerOpen(false)}
        />
      )}
    </div>
  );
}

function ProblemWorkspace(props: {
  problem: Problem;
  preview: boolean;
  userId: string;
  submissionId?: string;
}) {
  const execution = useExecution(
    props.userId,
    props.problem.id,
    props.problem.problem_version_id,
    props.submissionId,
  );
  const parsed = publicRunBundleSchema.safeParse(
    execution.availability.data?.publicRun,
  );
  const bundle =
    parsed.success &&
    parsed.data.problemId === props.problem.id &&
    parsed.data.problemVersionId === props.problem.problem_version_id
      ? parsed.data
      : undefined;
  const contractResult = approvedContractSchema.safeParse(
    execution.availability.data?.approvedContract,
  );
  const registry =
    contractResult.success &&
    contractResult.data.problemId === props.problem.id &&
    contractResult.data.problemVersionId === props.problem.problem_version_id
      ? contractResult.data
      : undefined;
  const approved: ApprovedContract | undefined = bundle
    ? {
        problemId: bundle.problemId,
        problemVersionId: bundle.problemVersionId,
        contract: bundle.contract,
        contractRevision: bundle.contractRevision,
        sourceNotice:
          registry?.contractRevision === bundle.contractRevision
            ? registry.sourceNotice
            : null,
      }
    : registry;
  if (execution.availability.isPending)
    return (
      <p className="studio-empty" role="status">
        Loading the versioned execution contract…
      </p>
    );
  return (
    <EditorWorkspace
      key={approved?.contract.adapter ? approved.contractRevision : "legacy"}
      {...props}
      execution={execution}
      bundle={bundle}
      approved={approved}
    />
  );
}

function EditorWorkspace({
  problem,
  preview,
  userId,
  execution,
  bundle,
  approved,
}: {
  problem: Problem;
  preview: boolean;
  userId: string;
  execution: ExecutionState;
  bundle?: PublicRunBundle;
  approved?: ApprovedContract;
}) {
  const scope = useDSAScope(preview);
  const localPython = useLocalPythonRun();
  const { invalidate: invalidateLocalRun } = localPython;
  const practice = usePracticeSubmissions(
    problem.id,
    problem.problem_version_id,
  );
  const [layout, setLayout] = useState<Layout>(() => savedLayout(userId));
  const [panel, setPanel] = useState(layout === "visual" ? "canvas" : "spec"),
    [mobile, setMobile] = useState("spec"),
    [testTab, setTestTab] = useState("examples");
  const [leftWidth, setLeftWidth] = useState(layout === "visual" ? 58 : 34),
    [tutorWidth, setTutorWidth] = useState(27),
    [editorHeight, setEditorHeight] = useState(64);
  const [language, setLanguage] = useState("python");
  const [focused, setFocused] = useState(false);
  const storageKey = draftKey(
    userId,
    problem.id,
    problem.problem_version_id,
    language,
    language === "python" && approved?.contract.adapter
      ? approved.contractRevision
      : undefined,
  );
  const starterCode = (next: string) =>
    next === "python" && approved?.contract.adapter
      ? typedStarter(approved.contract)!
      : pythonStarterCode(problem.function_contract, next);
  const [draft, setDraft] = useState(() =>
    readDraft(storageKey, starterCode(language)),
  );
  const currentDraft = useRef(draft);
  const [previousDraft] = useState(() =>
    approved?.contract.adapter
      ? readDraft(
          draftKey(userId, problem.id, problem.problem_version_id, "python"),
        )
      : null,
  );
  const [customInput, setCustomInput] = useState(() =>
    JSON.stringify(problem.examples[0]?.input ?? {}, null, 2),
  );
  const [storageError, setStorageError] = useState(false),
    [notice, setNotice] = useState("");
  const [reset, setReset] = useState(false);
  const notes = useNotes(scope, problem.id);
  const context = {
    contentId: problem.id,
    problemVersionId: problem.problem_version_id,
    language: language as "python" | "typescript" | "cpp",
    preview,
    ...(execution.job?.mode === "run" && execution.job.result
      ? { publicExecutionId: execution.job.submissionId }
      : {}),
    slug: problem.slug,
    title: problem.title,
    difficulty: problem.difficulty ?? undefined,
    category: problem.categories
      .map((item) => item.name)
      .join(", ")
      .slice(0, 300),
    summary: problem.description.slice(0, 4000),
    userApproach: draft.approach,
    userCode: draft.code,
    userNotes: (
      notes.data?.pages
        .flatMap((page) => page.items)
        .map((note) => note.body)
        .join("\n\n") ?? ""
    ).slice(0, 12000),
  };
  const tutor = useDSATutor(
    context,
    `reasonai:dsa:conversation:1:${userId}:${problem.id}:${problem.problem_version_id}:${preview}`,
  );
  const visualMessage = [...tutor.messages]
    .reverse()
    .find((message) => message.response?.visual);
  const visual = visualMessage?.response?.visual;
  const { setVisualFocus } = tutor;
  const rememberCanvasStep = useCallback(
    (step: number) => {
      if (!visual) return;
      setVisualFocus((current) =>
        current?.lessonTitle === visual.title && current.stepNumber === step
          ? current
          : {
              lessonTitle: visual.title,
              stepNumber: step,
              stepTitle: visual.steps[step - 1].title,
            },
      );
    },
    [visual, setVisualFocus],
  );
  const persist = useCallback(
    (change: Partial<Draft>, render = true) => {
      if ("code" in change) invalidateLocalRun();
      const next = { ...currentDraft.current, ...change };
      currentDraft.current = next;
      if (render) setDraft(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    },
    [storageKey, invalidateLocalRun],
  );
  const changeCode = useCallback(
    (code: string) => persist({ code }),
    [persist],
  );
  const changeView = useCallback(
    (view: Draft["view"]) => persist({ view }, false),
    [persist],
  );
  const canRun =
    !preview && problem.availability === "available" && language === "python";
  const certifiedSubmit = execution.availability.data?.submit === true;
  const receipt = localPython.run?.receipt;
  const matchedRun =
    localPython.run?.state === "passed" &&
    localPython.run.source === "verified" &&
    localPython.run.code === draft.code &&
    language === "python" &&
    !!bundle &&
    receipt?.userId === userId &&
    receipt.problemId === problem.id &&
    receipt.problemVersionId === problem.problem_version_id &&
    receipt.publicRevision === bundle.revision &&
    receipt.harnessSha256 === bundle.harnessSha256;
  const canSubmitTrusted = canRun && certifiedSubmit && matchedRun;
  const canSubmit =
    !!draft.code.trim() && draft.code.length <= 24000 && canSubmitTrusted;
  const blocked =
    execution.creating ||
    execution.active ||
    execution.needsRetry ||
    localPython.run?.state === "running";
  const runReason = preview
    ? "Switch to learner view to run published examples."
    : language !== "python"
      ? "Browser execution currently supports Python only."
      : "Run Python locally against public statement examples; no Nebius request.";
  const submitReason = preview
    ? "Switch to learner view to submit a published specification."
    : language !== "python"
      ? "Only Python submissions are currently supported."
      : !certifiedSubmit
        ? "Trusted submission is awaiting independent suite and contract certification."
        : "Pass all certified public tests with unchanged code to unlock Submit.";
  async function execute(mode: "run" | "submit") {
    setTestTab("results");
    setMobile("tests");
    if (blocked) return;
    if (mode === "run") {
      if (!canRun) {
        setNotice(runReason);
        return;
      }
      if (execution.availability.data?.run && !bundle) {
        setNotice(
          "The certified execution contract could not be loaded. Reload before running.",
        );
        return;
      }
      const cases: LocalTestCase[] = bundle
        ? bundle.cases
        : problem.examples.map((example, index) => ({
            id: String(index),
            input: example.input,
            expected: example.output,
          }));
      void localPython.start(
        currentDraft.current.code,
        cases,
        bundle ? "verified" : "examples",
        "run",
        bundle
          ? {
              contract: bundle.contract,
              contractRevision: bundle.contractRevision,
              harnessSha256: bundle.harnessSha256,
              publicRevision: bundle.revision,
              userId,
              problemId: problem.id,
              problemVersionId: problem.problem_version_id,
            }
          : approved
            ? { contract: approved.contract }
            : undefined,
      );
      return;
    }
    if (!canSubmit) {
      setNotice(submitReason);
      return;
    }
    void execution.start(currentDraft.current.code, "submit");
  }
  function changeLayout(next: Layout) {
    setLayout(next);
    if (next === "visual") {
      setPanel("canvas");
      setLeftWidth(58);
    } else {
      setLeftWidth(34);
      if (next === "judgment" && panel === "tutor") setPanel("spec");
    }
    try {
      localStorage.setItem(preferenceKey(userId), next);
    } catch {
      setNotice(
        "Layout changed. Browser storage is unavailable, so the preference could not be saved.",
      );
    }
  }
  function changeLanguage(next: string) {
    localPython.invalidate();
    const recovered = readDraft(
      draftKey(
        userId,
        problem.id,
        problem.problem_version_id,
        next,
        next === "python" && approved?.contract.adapter
          ? approved.contractRevision
          : undefined,
      ),
      starterCode(next),
    );
    currentDraft.current = recovered;
    setDraft(recovered);
    setLanguage(next);
  }
  const showTutor = layout === "judgment" || panel === "tutor";
  const styles = {
    "--studio-left": `${leftWidth}%`,
    "--studio-tutor": `${tutorWidth}%`,
    "--studio-editor": `${editorHeight}%`,
  } as CSSProperties;
  return (
    <>
      <header className="studio-workspacebar">
        <div className="studio-title">
          <span className={`studio-badge ${problem.difficulty ?? ""}`}>
            {problem.difficulty ?? "Unrated"}
          </span>
          <h1>{problem.title}</h1>
          <BookmarkControl scope={scope} id={problem.id} />
        </div>
        <label className="studio-layout-label">
          Layout
          <select
            aria-label="Workspace layout"
            value={layout}
            onChange={(event) => changeLayout(event.target.value as Layout)}
          >
            <option value="judgment">Judgment Studio</option>
            <option value="classic">Classic Split</option>
            <option value="visual">Visual Trace</option>
          </select>
        </label>
      </header>
      {approved?.sourceNotice && (
        <p className="studio-preview-banner">{approved.sourceNotice}</p>
      )}
      <div
        className={`studio-grid layout-${layout} mobile-${mobile} ${showTutor ? "with-tutor" : ""}`}
        style={styles}
      >
        <section
          className={`studio-spec studio-pane ${panel === "tutor" ? "spec-obscured" : ""}`}
          aria-label="Problem and learning tools"
        >
          <PanelTabs
            label="Learning panels"
            options={[
              { id: "spec", label: "Specification" },
              { id: "canvas", label: "Canvas" },
              { id: "notes", label: "Notes" },
              ...(layout !== "judgment"
                ? [{ id: "tutor", label: "AI Tutor" }]
                : []),
            ]}
            selected={panel}
            onSelect={(next) => {
              setPanel(next);
              setMobile(next === "notes" ? "spec" : next);
            }}
          />
          <div className="studio-scroll" hidden={panel !== "spec"}>
            <Specification problem={problem} />
            <LearningResources id={problem.id} slug={problem.slug} />
          </div>
          <div
            className="studio-scroll studio-canvas"
            hidden={panel !== "canvas"}
          >
            <div className="studio-copy">
              <span className="studio-eyebrow">ALGORITHM CANVAS</span>
              <h2>See the idea take shape</h2>
              {visualMessage?.response?.visual ? (
                <DSAVisualLesson
                  key={visualMessage.id}
                  lesson={visualMessage.response.visual}
                  stage
                  active={panel === "canvas" || mobile === "canvas"}
                  onStepChange={rememberCanvasStep}
                />
              ) : (
                <div className="studio-canvas-empty">
                  <div className="studio-canvas-dots">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <p>Ask ReasonAI for a visual walkthrough.</p>
                  <small>
                    A generated learning example will appear here. It is
                    separate from code execution.
                  </small>
                </div>
              )}
              <button
                type="button"
                className="studio-primary"
                disabled={tutor.pending}
                onClick={() =>
                  tutor.send(
                    "visualize",
                    "Help me reason through this problem with a short visual walkthrough. Use the available statement and my approach, without revealing the full solution.",
                  )
                }
              >
                <Sparkles size={15} />
                {tutor.pending
                  ? "Preparing walkthrough…"
                  : "Create visual walkthrough"}
              </button>
              {tutor.error && <p role="alert">{tutor.error}</p>}
            </div>
          </div>
          <div className="studio-scroll" hidden={panel !== "notes"}>
            <LearnerPanel scope={scope} id={problem.id} />
          </div>
        </section>
        <div className="studio-left-resize">
          <PaneResize
            label="Resize specification"
            value={leftWidth}
            min={24}
            max={layout === "judgment" ? 44 : 68}
            onChange={setLeftWidth}
          />
        </div>
        <section
          className="studio-code studio-pane"
          aria-label="Code and tests"
        >
          <div className="studio-editor-toolbar">
            <div>
              <SquareCode size={15} />
              <label>
                <span className="sr-only">Editor language</span>
                <select
                  aria-label="Editor language"
                  value={language}
                  onChange={(event) => changeLanguage(event.target.value)}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                      disabled={
                        option.id !== "python" &&
                        !problem.supported_contract_languages.includes(
                          option.id,
                        )
                      }
                    >
                      {option.label}
                      {option.id === "python"
                        ? " · local Run"
                        : problem.supported_contract_languages.includes(
                              option.id,
                            )
                          ? " · contract only"
                          : " · unavailable"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <span
                role="status"
                className={`studio-save ${storageError ? "warning" : ""}`}
              >
                {storageError ? "Draft not saved" : "Saved locally"}
              </span>
              {!draft.code.trim() && starterCode(language) && (
                <button
                  type="button"
                  className="studio-icon"
                  onClick={() =>
                    persist({ code: starterCode(language), view: undefined })
                  }
                >
                  Insert starter code
                </button>
              )}
              <button
                type="button"
                className="studio-icon"
                aria-label="Copy code"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      currentDraft.current.code,
                    );
                    setNotice("Code copied.");
                  } catch {
                    setNotice(
                      "Clipboard unavailable. Select and copy your code in the editor.",
                    );
                  }
                }}
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                className="studio-icon"
                aria-label="Reset code"
                onClick={() => setReset(true)}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
          {reset && (
            <div className="studio-notice" role="alert">
              <p>
                {starterCode(language)
                  ? "Reset this language’s code to the starter template? Your current code will be replaced."
                  : "Reset this language’s code to an empty draft? Your current code will be replaced."}
              </p>
              <button
                type="button"
                onClick={() => {
                  persist({ code: starterCode(language), view: undefined });
                  setReset(false);
                }}
              >
                Reset draft
              </button>
              <button type="button" onClick={() => setReset(false)}>
                Keep code
              </button>
            </div>
          )}
          <div className="studio-editor">
            <CodeEditor
              key={storageKey}
              path={storageKey}
              value={draft.code}
              language={language}
              view={draft.view}
              onChange={changeCode}
              onView={changeView}
              onRun={() => execute("run")}
              onSubmit={() => execute("submit")}
            />
          </div>
          <PaneResize
            horizontal
            label="Resize editor and results"
            value={editorHeight}
            min={30}
            max={82}
            onChange={setEditorHeight}
          />
          <div className="studio-results">
            <PanelTabs
              label="Test panels"
              options={[
                { id: "examples", label: "Examples" },
                { id: "custom", label: "Custom testcase" },
                { id: "approved", label: "Approved tests" },
                { id: "hidden", label: "Hidden suite" },
                { id: "results", label: "Results" },
              ]}
              selected={testTab}
              onSelect={setTestTab}
            />
            <div
              className="studio-scroll studio-result-copy"
              hidden={testTab !== "custom"}
            >
              <p className="studio-muted">
                Custom inputs are exploratory and never unlock Submit.
              </p>
              <label>
                Custom input JSON
                <textarea
                  aria-label="Custom input JSON"
                  value={customInput}
                  onChange={(event) => setCustomInput(event.target.value)}
                  maxLength={65536}
                  rows={6}
                />
              </label>
              <button
                type="button"
                disabled={!canRun || blocked}
                onClick={() => {
                  try {
                    const input = JSON.parse(customInput);
                    setTestTab("results");
                    setMobile("tests");
                    void localPython.start(
                      currentDraft.current.code,
                      [{ id: "custom", input, expected: null }],
                      "custom",
                      "run",
                      bundle
                        ? {
                            contract: bundle.contract,
                            harnessSha256: bundle.harnessSha256,
                          }
                        : approved
                          ? { contract: approved.contract }
                          : undefined,
                    );
                  } catch {
                    setNotice("Custom input must be valid JSON.");
                  }
                }}
              >
                Run custom input
              </button>
            </div>
            <div
              className="studio-scroll studio-result-copy"
              hidden={testTab !== "examples"}
            >
              <p className="studio-muted">
                Statement examples · no execution results yet
              </p>
              <Examples problem={problem} />
            </div>
            <div
              className="studio-scroll studio-result-copy"
              hidden={testTab !== "approved"}
            >
              <ApprovedTests scope={scope} problem={problem} />
            </div>
            <div
              className="studio-scroll studio-result-copy"
              hidden={testTab !== "hidden"}
            >
              <h3>Hidden-suite status</h3>
              <p className="studio-muted">
                {execution.availability.data?.submit
                  ? "A certified hidden suite is available for this version. Hidden case details remain private."
                  : (execution.availability.data?.submitReason ??
                    "Hidden-suite availability is being checked.")}
              </p>
            </div>
            <div className="studio-scroll" hidden={testTab !== "results"}>
              <ExecutionPanel
                execution={execution}
                localRun={localPython.run}
                onCancelLocal={localPython.cancel}
                practiceSubmission={practice.latest}
              />
              <SubmissionIntelligence
                userId={userId}
                problemId={problem.id}
                versionId={problem.problem_version_id}
                slug={problem.slug}
                job={execution.job}
                onFollowup={(summary) => {
                  tutor.send(
                    "review",
                    `Explain the AI estimates for submission ${execution.job?.submissionId}. The saved analysis summary was: ${summary}. My current editor draft may differ from that submission.`,
                  );
                  setPanel("tutor");
                  setMobile("tutor");
                }}
              />
            </div>
          </div>
          <div className="studio-code-footer">
            <span>
              {draft.code.length.toLocaleString()} / 24,000 characters
            </span>
            <button
              type="button"
              onClick={() => {
                tutor.send(
                  "complexity",
                  "Review the time and space complexity of my current approach or code.",
                );
                setPanel("tutor");
                setMobile("tutor");
              }}
            >
              Analyze complexity <Sparkles size={12} />
            </button>
          </div>
        </section>
        <div className="studio-tutor-resize">
          <PaneResize
            label="Resize editor and tutor"
            value={100 - tutorWidth}
            min={64}
            max={78}
            onChange={(value) => setTutorWidth(100 - value)}
          />
        </div>
        <aside
          className={`studio-tutor ${focused ? "tutor-focused" : ""}`}
          aria-label="AI learning assistant"
        >
          <DSATutorPanel
            tutor={tutor}
            problem={context}
            slug={problem.slug}
            focused={focused}
            onFocusChange={setFocused}
            onClose={() => {
              setFocused(false);
              setPanel("spec");
              setMobile("spec");
              if (layout === "judgment") changeLayout("classic");
            }}
          />
        </aside>
      </div>
      {previousDraft?.code && (
        <details className="studio-resources">
          <summary>Previous contract draft retained</summary>
          <p>
            Your earlier code remains associated with its original contract.
            Copy it only if you want to adapt it to this signature.
          </p>
          <pre className="studio-json">{previousDraft.code}</pre>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Replace the current code with your previous contract draft?",
                )
              )
                persist({
                  code: previousDraft.code,
                  approach: previousDraft.approach,
                });
            }}
          >
            Copy previous draft into this contract
          </button>
        </details>
      )}
      <div className="studio-approach">
        <label htmlFor="studio-approach">My approach</label>
        <textarea
          id="studio-approach"
          rows={1}
          maxLength={12000}
          placeholder="What invariant are you trying to maintain?"
          value={draft.approach}
          onChange={(event) => persist({ approach: event.target.value })}
        />
        <button
          type="button"
          disabled={
            tutor.pending || (!draft.approach.trim() && !draft.code.trim())
          }
          onClick={() => {
            tutor.send(
              "review",
              "Review my approach and code. Help me find the next useful step without revealing a complete solution.",
            );
            setPanel("tutor");
            setMobile("tutor");
          }}
        >
          Review <Sparkles size={14} />
        </button>
      </div>
      <footer className="studio-bottom">
        <p id="studio-execution-reason">
          {canRun ? "Run is local, with no sandbox API request. " : runReason}
          {canSubmitTrusted
            ? "Submit uses trusted hidden grading."
            : ` ${submitReason}`}
        </p>
        <div className="studio-actions">
          <button
            type="button"
            disabled={!canRun || blocked}
            onClick={() => execute("run")}
            aria-describedby="studio-execution-reason"
            title={canRun ? "Run locally (Ctrl/Cmd+Enter)" : runReason}
          >
            <Play size={14} />
            Run
          </button>
          <button
            type="button"
            disabled={!canSubmit || blocked}
            onClick={() => execute("submit")}
            className="studio-primary"
            aria-describedby="studio-execution-reason"
            title={
              canSubmitTrusted
                ? "Submit to certified hidden tests (Ctrl/Cmd+Shift+Enter)"
                : submitReason
            }
          >
            <Send size={14} />
            Submit
          </button>
        </div>
      </footer>
      {notice && (
        <div role="status" className="studio-toast">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      <nav className="studio-mobile-tabs" aria-label="Workspace panels">
        {[
          { id: "spec", label: "Spec" },
          { id: "code", label: "Code" },
          { id: "canvas", label: "Canvas" },
          { id: "tutor", label: "AI Tutor" },
          { id: "tests", label: "Tests" },
        ].map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={mobile === item.id}
            onClick={() => {
              setMobile(item.id);
              if (["spec", "canvas", "tutor"].includes(item.id))
                setPanel(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
