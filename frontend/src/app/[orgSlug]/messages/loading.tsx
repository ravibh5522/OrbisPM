export default function MessagesLoading() {
  return (
    <div className="flex h-[calc(100vh-5rem)] bg-base-100 rounded-2xl border border-base-200 shadow-sm overflow-hidden animate-pulse">
      <div className="w-80 lg:w-96 border-r border-base-300/50 p-4 space-y-3">
        <div className="h-8 w-full rounded bg-base-200" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 w-full rounded-lg bg-base-200" />
        ))}
      </div>
      <div className="flex-1 flex flex-col p-4">
        <div className="h-12 w-48 rounded bg-base-200 mb-4" />
        <div className="flex-1" />
        <div className="h-12 w-full rounded bg-base-200" />
      </div>
    </div>
  );
}
