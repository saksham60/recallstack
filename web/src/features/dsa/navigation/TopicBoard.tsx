"use client";
import { useState, type DragEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bookmark,
  Check,
  GripVertical,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  useCatalogProgress,
  useDSAScope,
  type ProblemItem,
} from "../workspace/api";
import { RequestError } from "../workspace/Explorer";
import {
  useBoardBookmarks,
  useBoardProblems,
  useCompanies,
  usePersonalBoard,
} from "./api";
import {
  emptyLayout,
  laneFor,
  laneNames,
  reorder,
  type BoardLayout,
} from "./contracts";
import { problemHref } from "./urls";
import { useToggleBookmark } from "@/features/bookmarks/use-bookmarks";
import "./navigation.css";
import {
  completionStatus,
  hasPassed,
  progressLabel,
} from "../progress/contract";

export function TopicBoard({
  topic,
  preview = false,
}: {
  topic: { id: string; slug: string; name: string };
  preview?: boolean;
}) {
  const scope = useDSAScope(preview),
    problems = useBoardProblems(scope, topic.id);
  const progress = useCatalogProgress(scope),
    bookmarks = useBoardBookmarks(scope);
  const companies = useCompanies(scope, problems.data),
    personal = usePersonalBoard(scope, topic.id);
  const toggleBookmark = useToggleBookmark();
  const params = useSearchParams();
  const [search, changeSearch] = useState(() => params.get("q") ?? ""),
    [difficulty, changeDifficulty] = useState(
      () => params.get("difficulty") ?? "all",
    );
  const [company, changeCompany] = useState(() => params.get("company") ?? ""),
    [pattern, changePattern] = useState(() => params.get("pattern") ?? "");
  const [status, changeStatus] = useState(() => params.get("status") ?? "all"),
    [onlyBookmarks, changeOnlyBookmarks] = useState(
      () => params.get("bookmarked") === "true",
    );
  function updateFilter(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", url.pathname + url.search);
  }
  const setSearch = (value: string) => {
    updateFilter("q", value);
    changeSearch(value);
  };
  const setDifficulty = (value: string) => {
    updateFilter("difficulty", value === "all" ? "" : value);
    changeDifficulty(value);
  };
  const setCompany = (value: string) => {
    updateFilter("company", value);
    changeCompany(value);
  };
  const setPattern = (value: string) => {
    updateFilter("pattern", value);
    changePattern(value);
  };
  const setStatus = (value: string) => {
    updateFilter("status", value === "all" ? "" : value);
    changeStatus(value);
  };
  const setOnlyBookmarks = (value: boolean) => {
    updateFilter("bookmarked", value ? "true" : "");
    changeOnlyBookmarks(value);
  };
  const [dragged, setDragged] = useState<string | null>(null),
    [dropTarget, setDropTarget] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState(""),
    [announcement, setAnnouncement] = useState("");
  const items = problems.data ?? [],
    layout = personal.query.data?.layout ?? emptyLayout();
  const editable =
    !!personal.query.data && !personal.change.isPending && !preview;
  const companyOptions = [
    ...new Map(companies.data?.map((c) => [c.slug, c])).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const patterns = [
    ...new Map(items.flatMap((p) => p.topics).map((p) => [p.id, p])).values(),
  ];
  const matches = (p: ProblemItem) =>
    p.title.toLowerCase().includes(search.trim().toLowerCase()) &&
    (difficulty === "all" || laneFor(p.difficulty) === difficulty) &&
    (!company ||
      companies.data?.some(
        (c) =>
          c.problemVersionId === p.problem_version_id && c.slug === company,
      )) &&
    (!pattern || p.topics.some((t) => t.id === pattern)) &&
    (!onlyBookmarks || bookmarks.data?.includes(p.id)) &&
    (status === "all" ||
      (status === "unsolved"
        ? !hasPassed(progress.data?.[p.id], p.problem_version_id)
        : status === "mastered"
          ? progress.data?.[p.id]?.learningStatus === "mastered"
          : completionStatus(progress.data?.[p.id], p.problem_version_id) ===
              status ||
            (!completionStatus(progress.data?.[p.id], p.problem_version_id) &&
              progress.data?.[p.id]?.learningStatus === status)));
  function save(next: BoardLayout, message: string) {
    if (!editable) return;
    personal.change.mutate(next, {
      onSuccess: () => setAnnouncement(message),
      onError: () =>
        setAnnouncement(
          "Your change could not be saved. The previous arrangement was restored.",
        ),
    });
  }
  function ordered(lane: (typeof laneNames)[number]) {
    const members = items.filter((p) => laneFor(p.difficulty) === lane);
    const rank = new Map(layout.lanes[lane].map((id, index) => [id, index]));
    return members.sort(
      (a, b) =>
        (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
  }
  function drop(
    event: DragEvent,
    target: string,
    lane: (typeof laneNames)[number],
  ) {
    event.preventDefault();
    setDropTarget(null);
    setDragged(null);
    const source = event.dataTransfer.getData("text/plain");
    const ids = ordered(lane).map((p) => p.id);
    if (!ids.includes(source)) return;
    save(
      {
        ...layout,
        lanes: { ...layout.lanes, [lane]: reorder(ids, source, target) },
      },
      "Problem order saved.",
    );
  }
  function move(
    id: string,
    lane: (typeof laneNames)[number],
    direction: number,
  ) {
    const ids = ordered(lane).map((p) => p.id),
      index = ids.indexOf(id),
      next = index + direction;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    save(
      { ...layout, lanes: { ...layout.lanes, [lane]: ids } },
      "Problem order saved.",
    );
  }
  function addToCollection(id: string, collection: string) {
    save(
      {
        ...layout,
        collections: layout.collections.map((c) =>
          c.id === collection
            ? { ...c, problemIds: [...new Set([...c.problemIds, id])] }
            : c,
        ),
      },
      "Problem added to collection.",
    );
  }
  function card(p: ProblemItem, lane: (typeof laneNames)[number] | null) {
    const learning = progress.data?.[p.id]?.learningStatus ?? "new";
    const tags =
      companies.data?.filter(
        (c) => c.problemVersionId === p.problem_version_id,
      ) ?? [];
    return (
      <article
        className={`dsa-problem-card ${dragged === p.id ? "dragging" : ""} ${dropTarget === p.id ? "drop-target" : ""}`}
        key={p.id}
        onDragOver={(e) => {
          if (
            editable &&
            lane &&
            laneFor(items.find((i) => i.id === dragged)?.difficulty ?? null) ===
              lane
          ) {
            e.preventDefault();
            setDropTarget(p.id);
          }
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => lane && drop(e, p.id, lane)}
      >
        <button
          className="dsa-drag"
          type="button"
          disabled={!editable || !lane}
          draggable={editable && !!lane}
          aria-label={`Reorder ${p.title}`}
          title="Drag to reorder; use Up and Down arrow keys"
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", p.id);
            e.dataTransfer.effectAllowed = "move";
            setDragged(p.id);
          }}
          onDragEnd={() => {
            setDragged(null);
            setDropTarget(null);
          }}
          onKeyDown={(e) => {
            if (lane && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              move(p.id, lane, e.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <GripVertical size={17} />
        </button>
        <Link href={problemHref(p, { preview })} className="dsa-problem-link">
          <strong>{p.title}</strong>
          <span className="dsa-card-meta">
            {p.difficulty ?? "Unrated"}
            {tags.length ? ` · ${tags.map((c) => c.name).join(" · ")}` : ""}
          </span>
          {tags.some((tag) => tag.reviewStatus === "imported") && (
            <small className="dsa-card-meta">Imported company metadata</small>
          )}
          <span className="dsa-card-status">
            {!scope.userId
              ? "Sign in to track progress"
              : progress.isPending
                ? "Loading progress…"
                : progress.error
                  ? "Progress unavailable"
                  : progressLabel(progress.data?.[p.id], p.problem_version_id)}
            {p.availability !== "available" ? " · Under review" : ""}
          </span>
        </Link>
        <button
          className="dsa-card-bookmark"
          type="button"
          disabled={
            !scope.userId ||
            bookmarks.isPending ||
            !!bookmarks.error ||
            toggleBookmark.isPending
          }
          aria-label={
            bookmarks.data?.includes(p.id)
              ? "Remove Bookmark"
              : "Bookmark problem"
          }
          aria-pressed={bookmarks.data?.includes(p.id) ?? false}
          onClick={() =>
            toggleBookmark.mutate({
              contentId: p.id,
              isBookmarked: bookmarks.data?.includes(p.id) ?? false,
            })
          }
        >
          <Bookmark
            size={14}
            fill={bookmarks.data?.includes(p.id) ? "currentColor" : "none"}
          />
        </button>
        {learning === "mastered" && <Check size={16} aria-label="Mastered" />}
        {!!layout.collections.length && (
          <select
            aria-label={`Add ${p.title} to collection`}
            className="dsa-collection-select"
            disabled={!editable}
            value=""
            onChange={(e) => {
              if (e.target.value) addToCollection(p.id, e.target.value);
            }}
          >
            <option value="">+ Collection</option>
            {layout.collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </article>
    );
  }
  return (
    <div className="dsa-journey">
      <nav className="dsa-breadcrumb" aria-label="Breadcrumb">
        <Link href={preview ? "/dsa?preview=true" : "/dsa"}>
          <ArrowLeft size={14} /> DSA
        </Link>
        <span>/</span>
        <span>{topic.name}</span>
      </nav>
      <header className="dsa-topic-heading">
        <div>
          <span className="dsa-eyebrow">TOPIC EXPLORER · PERSONAL BOARD</span>
          <h1>{topic.name}</h1>
          <p>
            Find your next challenge. Arrange a study plan that works for you.
          </p>
        </div>
        <span className="dsa-count">
          {problems.isPending ? "Loading…" : `${items.length} problems`}
        </span>
      </header>
      {preview && (
        <p className="dsa-banner">
          Reviewer preview. Personal arrangements are disabled.
        </p>
      )}
      <div className="dsa-board-filters">
        <label className="dsa-search">
          <Search size={16} />
          <input
            aria-label="Search problems"
            placeholder={`Search ${topic.name} problems…`}
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Difficulty filter"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="all">All difficulties</option>
          {laneNames.map((l) => (
            <option key={l} value={l}>
              {l[0].toUpperCase() + l.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Company filter"
          value={company}
          disabled={
            companies.isPending || !!companies.error || !companyOptions.length
          }
          onChange={(e) => setCompany(e.target.value)}
        >
          <option value="">All companies</option>
          {companyOptions.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Pattern filter"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        >
          <option value="">All patterns</option>
          {patterns.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Completion filter"
          value={status}
          disabled={progress.isPending || !!progress.error}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="unsolved">Not yet passed</option>
          <option value="solved">Solved (official)</option>
          <option value="passed_current_tests">Passed current tests</option>
          <option value="attempted">Attempted</option>
          <option value="mastered">Mastered</option>
        </select>
        <label className="dsa-bookmark-filter">
          <input
            type="checkbox"
            disabled={bookmarks.isPending || !!bookmarks.error}
            checked={onlyBookmarks}
            onChange={(e) => setOnlyBookmarks(e.target.checked)}
          />{" "}
          Bookmarked
        </label>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setDifficulty("all");
            setCompany("");
            setPattern("");
            setStatus("all");
            setOnlyBookmarks(false);
          }}
        >
          Clear filters
        </button>
      </div>
      {(progress.error || bookmarks.error) && (
        <RequestError
          error={progress.error ?? bookmarks.error}
          retry={() => {
            void progress.refetch();
            void bookmarks.refetch();
          }}
        />
      )}
      {companies.error && (
        <div className="dsa-banner">
          Company metadata is unavailable. Other filters remain usable.{" "}
          <button type="button" onClick={() => void companies.refetch()}>
            Retry
          </button>
        </div>
      )}
      {personal.query.error && !preview && (
        <div className="dsa-banner">
          Personal arrangements are unavailable until the board storage contract
          is ready.{" "}
          <button type="button" onClick={() => void personal.query.refetch()}>
            Retry
          </button>
        </div>
      )}
      {personal.change.error && (
        <div className="dsa-banner" role="alert">
          {personal.change.error.message}{" "}
          <button
            onClick={() => {
              personal.change.reset();
              void personal.query.refetch();
            }}
          >
            Reload saved arrangement
          </button>
        </div>
      )}
      {problems.error ? (
        <RequestError
          error={problems.error}
          retry={() => void problems.refetch()}
        />
      ) : (
        <div className="dsa-board" aria-busy={problems.isPending}>
          {laneNames.map((lane) => {
            const visible = ordered(lane).filter(matches);
            return (
              <section
                className={`dsa-lane ${lane}`}
                aria-label={`${lane[0].toUpperCase() + lane.slice(1)} problems`}
                key={lane}
              >
                <header>
                  <h2>{lane}</h2>
                  <span>{visible.length} problems</span>
                </header>
                <div className="dsa-lane-body">
                  {problems.isPending ? (
                    <div className="dsa-topic-skeleton" role="status">
                      Loading challenges…
                    </div>
                  ) : visible.length ? (
                    visible.map((p) => card(p, lane))
                  ) : (
                    <p className="dsa-empty">No matching problems</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {items.some((p) => !laneFor(p.difficulty)) && (
        <section className="dsa-collections">
          <h2>Unrated problems</h2>
          {items
            .filter((p) => !laneFor(p.difficulty))
            .filter(matches)
            .map((p) => card(p, null))}
        </section>
      )}
      <section className="dsa-collections">
        <div className="dsa-section-head">
          <div>
            <h2>My study collections</h2>
            <p>
              Collect problems without changing their canonical difficulty or
              topic.
            </p>
          </div>
          <button
            type="button"
            disabled={!editable}
            onClick={() =>
              save(
                { ...layout, lanes: emptyLayout().lanes },
                "Personal order reset.",
              )
            }
          >
            Reset order
          </button>
        </div>
        <form
          className="dsa-new-collection"
          onSubmit={(e) => {
            e.preventDefault();
            if (collectionName.trim()) {
              save(
                {
                  ...layout,
                  collections: [
                    ...layout.collections,
                    {
                      id: crypto.randomUUID(),
                      title: collectionName.trim(),
                      problemIds: [],
                    },
                  ],
                },
                "Collection created.",
              );
              setCollectionName("");
            }
          }}
        >
          <input
            aria-label="Collection name"
            placeholder="Name a study collection…"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            maxLength={80}
            disabled={!editable}
          />
          <button
            disabled={
              !editable ||
              !collectionName.trim() ||
              layout.collections.length >= 30
            }
          >
            <Plus size={15} />
            Create collection
          </button>
        </form>
        <div className="dsa-collection-grid">
          {layout.collections.map((c) => (
            <section
              className={`dsa-collection ${dropTarget === c.id ? "drop-target" : ""}`}
              key={c.id}
              onDragOver={(e) => {
                if (editable) {
                  e.preventDefault();
                  setDropTarget(c.id);
                }
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                if (items.some((p) => p.id === id)) addToCollection(id, c.id);
                setDragged(null);
                setDropTarget(null);
              }}
            >
              <header>
                <h3>{c.title}</h3>
                <button
                  aria-label={`Delete ${c.title}`}
                  disabled={!editable}
                  onClick={() =>
                    save(
                      {
                        ...layout,
                        collections: layout.collections.filter(
                          (v) => v.id !== c.id,
                        ),
                      },
                      "Collection deleted.",
                    )
                  }
                >
                  <X size={15} />
                </button>
              </header>
              {c.problemIds.map((id, index) => {
                const p = items.find((i) => i.id === id);
                return p ? (
                  <div className="dsa-collection-item" key={id}>
                    <Link href={problemHref(p, { preview })}>{p.title}</Link>
                    <button
                      disabled={!editable || index === 0}
                      aria-label={`Move ${p.title} up in ${c.title}`}
                      onClick={() => {
                        const ids = [...c.problemIds];
                        [ids[index - 1], ids[index]] = [
                          ids[index],
                          ids[index - 1],
                        ];
                        save(
                          {
                            ...layout,
                            collections: layout.collections.map((v) =>
                              v.id === c.id ? { ...v, problemIds: ids } : v,
                            ),
                          },
                          "Collection order saved.",
                        );
                      }}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Remove ${p.title} from ${c.title}`}
                      disabled={!editable}
                      onClick={() =>
                        save(
                          {
                            ...layout,
                            collections: layout.collections.map((v) =>
                              v.id === c.id
                                ? {
                                    ...v,
                                    problemIds: v.problemIds.filter(
                                      (value) => value !== id,
                                    ),
                                  }
                                : v,
                            ),
                          },
                          "Problem removed from collection.",
                        )
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <p key={id}>
                    Previously saved problem is currently unavailable.
                  </p>
                );
              })}
              {!c.problemIds.length && (
                <p className="dsa-empty">
                  Drop a problem here, or use its collection menu.
                </p>
              )}
            </section>
          ))}
        </div>
      </section>
      <p className="dsa-board-help">
        Drag a handle to reorder within a lane. Use Up/Down arrow keys on a
        handle for keyboard ordering. Changes apply only to your account.
      </p>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
        {personal.change.isPending ? " Saving arrangement…" : ""}
      </div>
    </div>
  );
}
