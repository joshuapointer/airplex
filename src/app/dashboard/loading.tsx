export default function DashboardLoading() {
  return (
    <div className="animate-pulse flex flex-col gap-4 py-2" aria-label="Loading dashboard" aria-busy="true">
      {/* Header bar skeleton */}
      <div
        className="h-8 w-48 rounded-sharp"
        style={{ background: 'rgba(255,255,255,0.06)' }}
      />

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass p-4 flex flex-col gap-2"
          >
            <div className="h-3 w-16 rounded-sharp" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="h-6 w-10 rounded-sharp" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
        ))}
      </div>

      {/* Content block skeleton */}
      <div className="glass p-6 flex flex-col gap-3 mt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-sharp"
            style={{ background: 'rgba(255,255,255,0.04)', width: i === 4 ? '60%' : '100%' }}
          />
        ))}
      </div>
    </div>
  );
}
