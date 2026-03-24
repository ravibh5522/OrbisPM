export default function OrgLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-base-300" />
        <div className="h-4 w-80 rounded bg-base-200" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-2xl border border-base-200 bg-base-100"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="h-72 rounded-2xl border border-base-200 bg-base-100 xl:col-span-2" />
        <div className="h-72 rounded-2xl border border-base-200 bg-base-100" />
      </div>
    </div>
  );
}
