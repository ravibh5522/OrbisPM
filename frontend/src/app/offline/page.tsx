"use client";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-base-200/30 gap-4 p-8 text-center">
      <div className="text-6xl">📡</div>
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-base-content/60 max-w-md">
        Check your internet connection and try again. Previously visited pages
        are still available from cache.
      </p>
      <button
        className="btn btn-primary"
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  );
}
