import Link from "next/link";
import { DomainDashboard } from "@/features/catalog";

export default function DSALibraryPage() {
  return (
    <>
      <Link className="mb-5 inline-block text-sm text-accent" href="/dsa">
        ← Open DSA workspace
      </Link>
      <DomainDashboard
        domainSlug="dsa"
        title="Data Structures & Algorithms"
        description="Master the core patterns."
      />
    </>
  );
}
