export default function SharesLoading() {
  return (
    <div className="animate-pulse flex flex-col gap-6" aria-label="Loading shares" aria-busy="true">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-24 rounded-sharp" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-8 w-28 rounded-sharp" style={{ background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {/* Shares list skeleton */}
      <div className="glass p-4 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2 rounded-sharp"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            {/* Poster thumbnail */}
            <div
              className="shrink-0 rounded-sharp"
              style={{ width: 36, height: 54, background: 'rgba(255,255,255,0.06)' }}
            />
            {/* Text block */}
            <div className="flex-1 flex flex-col gap-1.5 min-w-0">
              <div className="h-4 w-40 rounded-sharp" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-3 w-24 rounded-sharp" style={{ background: 'rgba(255,255,255,0.04)' }} />
            </div>
            {/* Badge */}
            <div className="shrink-0 h-5 w-16 rounded-sharp" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
