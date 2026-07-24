export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-md bg-muted animate-pulse" />
          <div className="h-4 w-64 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="h-9 w-32 rounded-md bg-muted animate-pulse" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="h-10 flex-1 rounded-md bg-muted animate-pulse" />
        <div className="h-10 w-full sm:w-[180px] rounded-md bg-muted animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="h-5 w-32 rounded-md bg-muted animate-pulse" />
              <div className="h-5 w-14 rounded-full bg-muted animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-3.5 w-full rounded-md bg-muted animate-pulse" />
              <div className="h-3.5 w-3/4 rounded-md bg-muted animate-pulse" />
              <div className="h-3.5 w-2/3 rounded-md bg-muted animate-pulse" />
            </div>
            <div className="flex gap-2 pt-2">
              <div className="h-9 flex-1 rounded-md bg-muted animate-pulse" />
              <div className="h-9 flex-1 rounded-md bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
