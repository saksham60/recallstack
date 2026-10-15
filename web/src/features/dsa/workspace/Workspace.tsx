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
  BookOpen,
  Braces,
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
import { draftKey, readDraft, type Draft } from "./drafts";
import { useExecution } from "../execution/use-execution";
import { ExecutionPanel } from "../execution/ExecutionPanel";
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
}: {
  problemId?: string;
  versionId?: string;
  preview: boolean;
}) {
  const router = useRouter(),
    { user, isLoading } = useAuth();
  const profile = useProfile(),
    scope = useDSAScope(preview);
  const [explorerOpen, setExplorerOpen] = useState(!problemId);
  const problem = useProblem(scope, problemId, versionId);
  const canPreview = profile.data?.roles.some(
    (role) => role === "admin" || role === "reviewer",
  );
  function select(item: ProblemItem) {
    setExplorerOpen(false);
    router.replace(
      `/dsa?problem=${encodeURIComponent(item.id)}&version=${encodeURIComponent(item.problem_version_id)}${preview ? "&preview=true" : ""}`,
      { scroll: false },
    );
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
        <div className="studio-brand">
          <span className="studio-logo">
            <Braces size={19} />
          </span>
          <span>
            DSA <ChevronRight size={13} />
            <b>Workspace</b>
          </span>
        </div>
        <div className="studio-actions">
          <Link className="studio-library-link" href="/dsa/library">
            <BookOpen size={15} />
            Study notes
          </Link>
          {canPreview && (
            <Link
              className={
                preview ? "studio-preview-link active" : "studio-preview-link"
              }
              href={preview ? "/dsa" : "/dsa?preview=true"}
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
            href={`/dsa?problem=${encodeURIComponent(problemId)}${preview ? "&preview=true" : ""}`}
          >
            Load current specification
          </Link>
        </div>
      ) : problem.data && user ? (
        <ProblemWorkspace
          key={`${user.id}:${preview}:${problem.data.id}:${problem.data.problem_version_id}`}
          problem={problem.data}
          preview={preview}
          userId={user.id}
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

function ProblemWorkspace({
  problem,
  preview,
  userId,
}: {
  problem: Problem;
  preview: boolean;
  userId: string;
}) {
  const scope = useDSAScope(preview);
  const execution = useExecution(
    userId,
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
  );
  const [draft, setDraft] = useState(() => readDraft(storageKey));
  const currentDraft = useRef(draft);
  const [storageError, setStorageError] = useState(false),
    [notice, setNotice] = useState("");
  const [reset, setReset] = useState(false);
  const notes = useNotes(scope, problem.id);
  const context = {
    contentId: problem.id,
    problemVersionId: problem.problem_version_id,
    language: language as "python" | "typescript" | "cpp",
    preview,
    ...(execution.job?.mode === "run" && execution.job.result ? { publicExecutionId: execution.job.submissionId } : {}),
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
  const tutor = useDSATutor(context, `reasonai:dsa:conversation:1:${userId}:${problem.id}:${problem.problem_version_id}:${preview}`);
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
    [storageKey],
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
    !preview &&
    problem.availability === "available" &&
    !execution.availability.error &&
    language === "python" &&
    execution.availability.data?.run === true;
  const canSubmit =
    !preview &&
    problem.availability === "available" &&
    !execution.availability.error &&
    language === "python" &&
    execution.availability.data?.submit === true;
  const blocked =
    execution.creating || execution.active || execution.needsRetry;
  const runReason = preview
    ? "Switch to learner view to execute a published specification."
    : language !== "python"
      ? "Only certified Python execution is supported."
      : (execution.availability.data?.runReason ??
        "Execution availability is being checked.");
  const submitReason = preview
    ? "Switch to learner view to submit a published specification."
    : language !== "python"
      ? "Only certified Python execution is supported."
      : (execution.availability.data?.submitReason ??
        "Submission availability is being checked.");
  function execute(mode: "run" | "submit") {
    setTestTab("results");
    setMobile("tests");
    if (blocked) return;
    if (mode === "run" ? !canRun : !canSubmit) {
      setNotice(mode === "run" ? runReason : submitReason);
      return;
    }
    void execution.start(currentDraft.current.code, mode);
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
    const recovered = readDraft(
      draftKey(userId, problem.id, problem.problem_version_id, next),
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
                        ? canRun || canSubmit
                          ? " · execution available"
                          : " · draft only"
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
                Reset this language’s code to an empty draft? No starter
                template is supplied by this specification.
              </p>
              <button
                type="button"
                onClick={() => {
                  persist({ code: "", view: undefined });
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
                { id: "approved", label: "Approved tests" },
                { id: "hidden", label: "Hidden suite" },
                { id: "results", label: "Results" },
              ]}
              selected={testTab}
              onSelect={setTestTab}
            />
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
              <ExecutionPanel execution={execution} />
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
          {execution.availability.error
            ? "Execution availability could not be checked. "
            : canRun
              ? "Run uses verified public fixtures. "
              : runReason}
          {canSubmit
            ? "Submit uses a certified hidden suite."
            : ` ${submitReason}`}
        </p>
        <div className="studio-actions">
          <button
            type="button"
            disabled={!canRun || blocked}
            onClick={() => execute("run")}
            aria-describedby="studio-execution-reason"
            title={canRun ? "Run public tests (Ctrl/Cmd+Enter)" : runReason}
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
              canSubmit
                ? "Submit to hidden tests (Ctrl/Cmd+Shift+Enter)"
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
