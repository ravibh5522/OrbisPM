export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-32 rounded bg-base-300" />
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-9 w-20 rounded-lg bg-base-200" />
        ))}
      </div>
      <div className="h-96 rounded-2xl border border-base-200 bg-base-100" />
    </div>
  );
}
