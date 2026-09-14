export function JudgeLoginOption({ enabled, disabled }: { enabled: boolean; disabled: boolean }) {
  if (!enabled) return null;

  return (
    <form action="/api/auth/demo" method="post" className="mt-3 text-center">
      <button
        type="submit"
        disabled={disabled}
        className="flex w-full items-center justify-center rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        🏆 Continue as Hackathon Judge
      </button>
      <p className="mt-2 text-xs text-muted">No account setup required</p>
    </form>
  );
}
