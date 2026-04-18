import { NewShareForm } from '@/components/dashboard/NewShareForm';

export default function NewSharePage() {
  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--np-font-display)',
          color: 'var(--np-cyan)',
          fontSize: '1.5rem',
          fontWeight: 700,
          marginBottom: '1.5rem',
        }}
      >
        New Share
      </h1>

      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--np-muted)',
          borderRadius: 'var(--np-radius-soft)',
          padding: '1.5rem',
          backdropFilter: 'blur(8px)',
          maxWidth: '600px',
        }}
      >
        <NewShareForm />
      </div>
    </div>
  );
}
