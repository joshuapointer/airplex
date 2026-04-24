'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlexMetadata } from '@/types/plex';
import { LibraryPicker } from './LibraryPicker';
import { useCsrf } from './CsrfContext';

type Step = 'library' | 'item' | 'details' | 'done';

interface CreateResult {
  id: string;
  token: string;
  shareUrl: string;
}

export function NewShareForm() {
  const csrf = useCsrf();
  const router = useRouter();

  const [step, setStep] = useState<Step>('library');
  const [sectionId, setSectionId] = useState('');
  const [items, setItems] = useState<PlexMetadata[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [selectedItem, setSelectedItem] = useState<PlexMetadata | null>(null);

  // Details form state
  const [recipientLabel, setRecipientLabel] = useState('');
  const [recipientNote, setRecipientNote] = useState('');
  const [senderLabel, setSenderLabel] = useState('');
  const [ttlHours, setTtlHours] = useState('48');
  const [maxPlays, setMaxPlays] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Done state
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadItems(sid: string) {
    if (!sid) return;
    setItemsLoading(true);
    setItemsError(null);
    try {
      const r = await fetch(`/api/admin/libraries/${sid}/items?start=0&size=100`, {
        headers: { 'x-airplex-csrf': csrf },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { items: PlexMetadata[]; total: number };
      setItems(data.items);
      setStep('item');
    } catch (err) {
      setItemsError(err instanceof Error ? err.message : 'Failed to load items');
    } finally {
      setItemsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem) return;
    setSubmitting(true);
    setSubmitError(null);

    const mediaType: 'movie' | 'show' | 'episode' =
      selectedItem.type === 'movie' ? 'movie' : selectedItem.type === 'show' ? 'show' : 'episode';

    const body: Record<string, unknown> = {
      ratingKey: selectedItem.ratingKey,
      title: selectedItem.title,
      mediaType,
      recipient_label: recipientLabel,
    };
    if (recipientNote.trim()) body.recipient_note = recipientNote.trim();
    if (senderLabel.trim()) body.sender_label = senderLabel.trim();
    if (ttlHours) body.ttl_hours = Number(ttlHours);
    if (maxPlays.trim()) body.max_plays = Number(maxPlays);

    try {
      const r = await fetch('/api/admin/shares', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-airplex-csrf': csrf,
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const json = (await r.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as CreateResult;
      setResult(data);
      setStep('done');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create share');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!result) return;
    await navigator.clipboard.writeText(result.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ---- Step: library ----
  if (step === 'library') {
    return (
      <div>
        <h2 style={headingStyle}>Step 1 — Pick a Library</h2>
        <div style={{ maxWidth: '400px' }}>
          <LibraryPicker value={sectionId} onChange={setSectionId} disabled={itemsLoading} />
          {itemsError && (
            <p style={{ color: 'var(--np-magenta)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
              {itemsError}
            </p>
          )}
          <button
            onClick={() => loadItems(sectionId)}
            disabled={!sectionId || itemsLoading}
            style={primaryBtnStyle(!sectionId || itemsLoading)}
          >
            {itemsLoading ? 'Loading…' : 'Next →'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Step: pick item ----
  if (step === 'item') {
    return (
      <div>
        <h2 style={headingStyle}>Step 2 — Pick an Item</h2>
        <button onClick={() => setStep('library')} style={ghostBtnStyle}>
          ← Back
        </button>
        <div
          style={{
            marginTop: '1rem',
            maxHeight: '400px',
            overflowY: 'auto',
            border: '1px solid var(--np-muted)',
            borderRadius: 'var(--np-radius-soft)',
          }}
        >
          {items.length === 0 ? (
            <p style={{ padding: '1rem', color: 'var(--np-muted)', fontSize: '0.85rem' }}>
              No items found in this library.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.ratingKey}
                onClick={() => {
                  setSelectedItem(item);
                  setStep('details');
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '0.6rem 1rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  color: 'var(--np-fg)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                <span style={{ color: 'var(--np-cyan)', marginRight: '0.5rem' }}>
                  [{item.type}]
                </span>
                {item.grandparentTitle
                  ? `${item.grandparentTitle} — ${item.parentTitle ?? ''} — ${item.title}`
                  : item.title}
              </button>
            ))
          )}
        </div>
      </div>
    );
  }

  // ---- Step: details ----
  if (step === 'details') {
    return (
      <div>
        <h2 style={headingStyle}>Step 3 — Share Details</h2>
        <button onClick={() => setStep('item')} style={ghostBtnStyle}>
          ← Back
        </button>

        <p style={{ color: 'var(--np-muted)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
          Sharing: <strong style={{ color: 'var(--np-fg)' }}>{selectedItem?.title}</strong>
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: '1.25rem', maxWidth: '480px' }}>
          <Field label="Recipient label *">
            <input
              required
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
              placeholder="e.g. Alice"
              style={inputStyle}
            />
          </Field>

          <Field label="From (shown to recipient, optional)">
            <input
              maxLength={60}
              value={senderLabel}
              onChange={(e) => setSenderLabel(e.target.value)}
              placeholder="e.g. Josh"
              style={inputStyle}
            />
          </Field>

          <Field label="Note (optional)">
            <textarea
              value={recipientNote}
              onChange={(e) => setRecipientNote(e.target.value)}
              placeholder="Private note about this share"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          <Field label="TTL (hours)">
            <input
              type="number"
              min={1}
              max={168}
              value={ttlHours}
              onChange={(e) => setTtlHours(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Max plays (blank = unlimited)">
            <input
              type="number"
              min={1}
              value={maxPlays}
              onChange={(e) => setMaxPlays(e.target.value)}
              placeholder="Unlimited"
              style={inputStyle}
            />
          </Field>

          {submitError && (
            <p style={{ color: 'var(--np-magenta)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !recipientLabel.trim()}
            style={primaryBtnStyle(submitting || !recipientLabel.trim())}
          >
            {submitting ? 'Creating…' : 'Create Share'}
          </button>
        </form>
      </div>
    );
  }

  // ---- Step: done ----
  if (step === 'done' && result) {
    return (
      <div>
        <h2 style={{ ...headingStyle, color: 'var(--np-green)' }}>Share Created</h2>
        <p style={{ color: 'var(--np-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          The share link is shown only once. Copy it now.
        </p>

        <div
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--np-muted)',
            borderRadius: 'var(--np-radius-sharp)',
            padding: '0.75rem 1rem',
            fontFamily: 'var(--np-font-body)',
            fontSize: '0.8rem',
            wordBreak: 'break-all',
            color: 'var(--np-cyan)',
            marginBottom: '1rem',
          }}
        >
          {result.shareUrl}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={copyLink} style={primaryBtnStyle(false)}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button
            onClick={() => router.push(`/dashboard/shares/${result.id}`)}
            style={ghostBtnStyle}
          >
            View Share →
          </button>
          <button
            onClick={() => {
              setStep('library');
              setSectionId('');
              setItems([]);
              setSelectedItem(null);
              setRecipientLabel('');
              setRecipientNote('');
              setSenderLabel('');
              setTtlHours('48');
              setMaxPlays('');
              setResult(null);
            }}
            style={ghostBtnStyle}
          >
            Create Another
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ---- Shared style helpers ----

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--np-font-display)',
  color: 'var(--np-cyan)',
  fontSize: '1.1rem',
  fontWeight: 700,
  marginBottom: '1rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--np-muted)',
  borderRadius: 'var(--np-radius-sharp)',
  color: 'var(--np-fg)',
  padding: '0.45rem 0.75rem',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    marginTop: '1rem',
    padding: '0.5rem 1.25rem',
    background: disabled ? 'rgba(255,255,255,0.1)' : 'var(--np-cyan)',
    color: disabled ? 'var(--np-muted)' : 'var(--np-bg)',
    border: 'none',
    borderRadius: 'var(--np-radius-sharp)',
    fontWeight: 700,
    fontSize: '0.9rem',
    cursor: disabled ? 'not-allowed' : 'pointer',
  };
}

const ghostBtnStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '0.5rem 1rem',
  background: 'transparent',
  color: 'var(--np-cyan)',
  border: '1px solid var(--np-cyan)',
  borderRadius: 'var(--np-radius-sharp)',
  fontWeight: 600,
  fontSize: '0.85rem',
  cursor: 'pointer',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.8rem',
          color: 'var(--np-muted)',
          marginBottom: '0.3rem',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
