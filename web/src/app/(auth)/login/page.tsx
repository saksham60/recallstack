import { Suspense } from "react";
import { LoginContent } from "./LoginContent";

function LoginFallback() {
  return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted text-sm">Loading...</p></div>;
}

export default function LoginPage() {
  const demoEnabled = process.env.DEMO_ACCESS_ENABLED === "1";

  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent demoEnabled={demoEnabled} />
    </Suspense>
  );
}
