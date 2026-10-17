import Link from "next/link";
export default function DSANotFound() {
  return <div className="p-8 space-y-4"><h1 className="text-xl font-semibold">Problem or topic unavailable</h1><p>This link may refer to an unpublished version or a topic that is no longer available. Your saved drafts are retained.</p><Link className="text-accent" href="/dsa">Explore DSA topics</Link></div>;
}
