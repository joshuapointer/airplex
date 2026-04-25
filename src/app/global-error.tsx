'use client';

export default function RootGlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#000',
          color: '#fff',
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            maxWidth: '360px',
            width: '100%',
            padding: '2rem',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px',
            background: 'rgba(15,15,15,0.9)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: '#00f0ff',
            }}
          >
            airPointer
          </p>

          <div>
            <h1
              style={{
                margin: '0 0 0.5rem',
                fontFamily: 'sans-serif',
                fontSize: '1.5rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Something went wrong
            </h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
              A critical error occurred in the application layout. Please reload to continue.
            </p>
          </div>

          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: 'block',
              width: '100%',
              padding: '0.6rem 1rem',
              background: '#00ff99',
              color: '#000',
              border: '1px solid #00ff99',
              borderRadius: '2px',
              fontFamily: 'sans-serif',
              fontWeight: 700,
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
