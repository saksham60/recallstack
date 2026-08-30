import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/features/auth";
import QueryProvider from "@/lib/query/QueryProvider";

export const metadata: Metadata = {
  title: "ReasonAI — Think Beyond",
  description:
    "A visual knowledge, learning, and system-design workspace for connected reasoning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
