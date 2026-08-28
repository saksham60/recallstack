import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live System Design | RecallStack",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
  referrer: "no-referrer",
};

export default function LiveSystemDesignLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
