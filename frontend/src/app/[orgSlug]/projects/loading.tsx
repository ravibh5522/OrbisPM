export default function ProjectsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-base-300" />
        <div className="h-10 w-36 rounded bg-base-200" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-2xl border border-base-200 bg-base-100"
          />
        ))}
      </div>
    </div>
  );
}
