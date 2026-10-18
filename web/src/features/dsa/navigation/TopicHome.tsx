"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, Braces, Search } from "lucide-react";
import { useProfile } from "@/features/profile";
import { useDSAScope, useStatistics, useTaxonomy } from "../workspace/api";
import { RequestError } from "../workspace/Explorer";
import { useTopicProgress } from "./api";
import { readResume } from "./resume";
import { problemHref } from "./urls";
import "./navigation.css";

const symbols: Record<string, string> = {
  arrays: "[ ]",
  strings: "“ ”",
  trees: "♧",
  graphs: "◇",
  "dynamic-programming": "∑",
  searching: "⌕",
  sorting: "↕",
  "stacks-queues": "▤",
  "linked-lists": "↔",
  backtracking: "↶",
  "bit-manipulation": "01",
};
export function TopicHome({ preview = false }: { preview?: boolean }) {
  const scope = useDSAScope(preview),
    categories = useTaxonomy(scope, "categories");
  const progress = useTopicProgress(scope),
    stats = useStatistics(scope),
    profile = useProfile();
  const [search, setSearch] = useState("");
  const resume = useQuery({
    queryKey: [...scope.key, "resume"],
    enabled: !!scope.userId && !preview,
    queryFn: () => readResume(scope.userId!),
  });
  const topics = categories.data?.items ?? [];
  const visible = topics.filter((t) =>
    t.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const canPreview = profile.data?.roles.some(
    (r) => r === "admin" || r === "reviewer",
  );
  return (
    <div className="dsa-journey">
      <header className="dsa-home-hero">
        <div>
          <span className="dsa-eyebrow">YOUR LEARNING SPACE</span>
          <h1>
            Choose a topic.
            <br />
            <em>Master the pattern.</em>
          </h1>
          <p>
            Explore grouped challenges, develop your solution, and understand
            your approach with ReasonAI.
          </p>
          <div className="dsa-home-facts">
            <span>
              {categories.isPending
                ? "Loading catalog…"
                : `${topics.length} topics`}
            </span>
            <span>
              {stats.data
                ? `${stats.data.total_catalog_problems} problems`
                : "Explore by topic"}
            </span>
            <span>Python practice</span>
          </div>
        </div>
        <div className="dsa-hero-art" aria-hidden="true">
          <Braces size={88} strokeWidth={1} />
        </div>
      </header>
      {resume.data && (
        <p className="dsa-banner">
          <Link href={problemHref(resume.data)}>
            Continue your last problem: {resume.data.title}{" "}
            <ArrowRight size={14} className="inline" />
          </Link>
        </p>
      )}
      {canPreview && (
        <Link
          className="dsa-preview-toggle"
          href={preview ? "/dsa" : "/dsa?preview=true"}
        >
          {preview ? "Exit reviewer preview" : "Reviewer preview"}
        </Link>
      )}
      {preview && (
        <p className="dsa-banner">
          Reviewer preview — draft content remains subject to backend
          authorization. Learning counts apply to published content.
        </p>
      )}
      <div className="dsa-section-head">
        <h2>Explore DSA topics</h2>
        <label className="dsa-search">
          <Search size={16} />
          <input
            aria-label="Search topics"
            placeholder="Find a topic…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
          />
        </label>
      </div>
      {categories.error ? (
        <RequestError
          error={categories.error}
          retry={() => void categories.refetch()}
        />
      ) : categories.isPending ? (
        <div className="dsa-topics" role="status" aria-label="Loading topics">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="dsa-topic-skeleton" />
          ))}
        </div>
      ) : (
        <div className="dsa-topics">
          {visible.map((topic, index) => {
            const state =
              progress.data?.find((p) => p.id === topic.id) ??
              (progress.data
                ? {
                    attempted_count: 0,
                    mastered_count: 0,
                    solved_count: 0,
                    passed_count: 0,
                  }
                : undefined);
            const percent =
              state && topic.problem_count
                ? Math.round(
                    ((state.solved_count + state.passed_count) /
                      topic.problem_count) *
                      100,
                  )
                : 0;
            return (
              <Link
                href={`/dsa/${encodeURIComponent(topic.slug)}${preview ? "?preview=true" : ""}`}
                className={`dsa-topic-card tone-${index % 4}`}
                key={topic.id}
              >
                <span className="dsa-topic-symbol" aria-hidden="true">
                  {symbols[topic.slug] ?? "⌘"}
                </span>
                <h3>{topic.name}</h3>
                <p>
                  {topic.problem_count}{" "}
                  {topic.problem_count === 1 ? "problem" : "problems"}
                </p>
                <div className="dsa-topic-counts">
                  <span>{state?.attempted_count ?? "—"} attempted</span>
                  <span>{state?.solved_count ?? "—"} solved</span>
                  <span>{state?.passed_count ?? "—"} passed current tests</span>
                  <span>{state?.mastered_count ?? "—"} mastered</span>
                </div>
                <div className="dsa-topic-bottom">
                  <progress
                    aria-label={`${topic.name} completion`}
                    value={percent}
                    max={100}
                  />
                  <span>
                    {state?.attempted_count ? "Continue" : "Explore"}{" "}
                    <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {!categories.isPending && !categories.error && !visible.length && (
        <div className="dsa-empty">
          <h3>{search ? "No matching topics" : "No topics available yet"}</h3>
          <p>
            {search
              ? "Try a different name."
              : "Topics will appear when canonical category metadata is available."}
          </p>
        </div>
      )}
      {progress.error && (
        <RequestError
          error={progress.error}
          retry={() => void progress.refetch()}
        />
      )}
      <footer className="dsa-home-summary">
        <div>
          <strong>{stats.data?.total_catalog_problems ?? "—"}</strong>
          <span>Published problems</span>
        </div>
        <div>
          <strong>{stats.data?.attempted_problem_count ?? "—"}</strong>
          <span>Practiced</span>
        </div>
        <div>
          <strong>{stats.data?.mastered_problem_count ?? "—"}</strong>
          <span>Mastered</span>
        </div>
        <p>
          Build understanding at your own pace.
          <br />
          Your notes, bookmarks and progress stay with your account.
        </p>
      </footer>
    </div>
  );
}
