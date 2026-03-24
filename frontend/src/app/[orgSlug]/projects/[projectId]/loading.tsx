export default function ProjectDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-6 w-6 rounded bg-base-300" />
        <div className="h-8 w-64 rounded bg-base-300" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-base-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-64 rounded-2xl border border-base-200 bg-base-100"
          />
        ))}
      </div>
    </div>
  );
}
