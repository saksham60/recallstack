export default function HomePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted text-sm mt-1">Ready for a quick refresh.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Placeholder cards for dashboard */}
        <div className="rounded-xl border border-border bg-surface text-foreground shadow-sm">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Continue Learning</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">Arrays</div>
            <p className="text-xs text-muted mt-1">Next up: Maximum Subarray</p>
          </div>
        </div>
        
        <div className="rounded-xl border border-border bg-surface text-foreground shadow-sm">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Quick Recall</h3>
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted mt-1">Concepts ready to revise</p>
          </div>
        </div>
      </div>
    </div>
  );
}
