"use client";
import Link from "next/link";
export default function DSAError({ retry }: { retry: () => void }) {
  return (
    <div className="p-8 space-y-4" role="alert">
      <h1 className="text-xl font-semibold">DSA is temporarily unavailable</h1>
      <p>Your saved drafts and learning history are retained. Please retry the catalog connection.</p>
      <button className="text-accent" onClick={retry}>Try again</button>
      <p><Link href="/dsa">Return to DSA topics</Link></p>
    </div>
  );
}
