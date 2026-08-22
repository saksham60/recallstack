import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/features/auth";
import QueryProvider from "@/lib/query/QueryProvider";

export const metadata: Metadata = {
  title: "RecallStack",
  description: "Technical learning, revision, and active-recall platform",
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
