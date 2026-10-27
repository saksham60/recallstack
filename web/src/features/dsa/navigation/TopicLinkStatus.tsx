"use client";

import { useLinkStatus } from "next/link";

/** Must remain a descendant of Link so the router owns pending/cancellation. */
export function TopicLinkStatus({ name }: { name: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className="dsa-topic-pending"
      data-dsa-link-pending={pending}
      role="status"
      aria-live="polite"
    >
      {pending ? `Opening ${name}…` : ""}
    </span>
  );
}
