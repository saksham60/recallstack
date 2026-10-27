import Link from "next/link";
import { laneNames } from "./contracts";
import "./navigation.css";

export function ProblemLaneSkeleton() {
  return (
    <div className="dsa-problem-skeletons" aria-hidden="true">
      {[0, 1, 2].map(index => (
        <div className="dsa-problem-skeleton" key={index}>
          <span className="dsa-skeleton-line" />
          <span className="dsa-skeleton-line short" />
          <span className="dsa-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}

export function TopicBoardSkeleton() {
  return (
    <div className="dsa-journey" data-dsa-route-loading="true" aria-busy="true">
      <nav className="dsa-breadcrumb" aria-label="Breadcrumb">
        <Link href="/dsa">← DSA</Link><span>/</span><span>Topic explorer</span>
      </nav>
      <div role="status" aria-label="Loading topic board" className="sr-only">
        Loading your topic and challenges…
      </div>
      <div aria-hidden="true">
        <header className="dsa-topic-heading">
          <div>
            <span className="dsa-eyebrow">TOPIC EXPLORER · PERSONAL BOARD</span>
            <div className="dsa-skeleton-title"><span className="dsa-skeleton-line" /></div>
            <p>Find your next challenge. Arrange a study plan that works for you.</p>
          </div>
          <span className="dsa-count">Loading…</span>
        </header>
        <div className="dsa-board-filters dsa-skeleton-filters">
          {[0, 1, 2, 3].map(index => <span className="dsa-skeleton-line" key={index} />)}
        </div>
        <div className="dsa-board">
          {laneNames.map(lane => (
            <section className={`dsa-lane ${lane}`} key={lane}>
              <header><h2>{lane}</h2></header>
              <div className="dsa-lane-body"><ProblemLaneSkeleton /></div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
