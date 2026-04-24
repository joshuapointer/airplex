'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlexMetadata } from '@/types/plex';
import { LibraryPicker } from './LibraryPicker';
import { useCsrf } from './CsrfContext';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Input } from '@/components/ui/Input';

type Step = 'library' | 'item' | 'details' | 'done';

interface CreateResult {
  id: string;
  token: string;
  shareUrl: string;
}

const STEPS: { key: Step; label: string }[] = [
  { key: 'library', label: '1 · Library' },
  { key: 'item', label: '2 · Item' },
  { key: 'details', label: '3 · Details' },
  { key: 'done', label: '4 · Done' },
];

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {STEPS.map((s, i) => (
        <span
          key={s.key}
          className="season-tab"
          aria-selected={i === currentIdx ? 'true' : 'false'}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
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

  const heading = 'font-display uppercase tracking-wide text-lg text-np-cyan mb-4';
  const textareaCls =
    'w-full rounded-sharp border px-3 py-2 text-sm font-mono text-np-fg placeholder-np-muted bg-[var(--np-input-bg,rgba(0,0,0,0.4))] border-[rgba(255,255,255,0.12)] outline-none focus:border-np-green focus:ring-1 focus:ring-np-green transition-colors resize-y';

  // ---- Step: library ----
  if (step === 'library') {
    return (
      <div>
        <StepIndicator current={step} />
        <div key="library" className="animate-enter">
          <h2 className={heading}>Step 1 — Pick a Library</h2>
          <div className="max-w-[400px] flex flex-col gap-3">
            <LibraryPicker value={sectionId} onChange={setSectionId} disabled={itemsLoading} />
            {itemsError && <p className="text-np-magenta font-mono text-sm">{itemsError}</p>}
            <div>
              <button
                onClick={() => loadItems(sectionId)}
                disabled={!sectionId || itemsLoading}
                className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {itemsLoading ? 'Loading…' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Step: pick item ----
  if (step === 'item') {
    return (
      <div>
        <StepIndicator current={step} />
        <div key="item" className="animate-enter">
          <h2 className={heading}>Step 2 — Pick an Item</h2>
          <button onClick={() => setStep('library')} className="btn-ghost text-xs mb-4">
            ← Back
          </button>
          <GlassPanel className="max-h-[400px] overflow-y-auto p-2 flex flex-col gap-1">
            {items.length === 0 ? (
              <p className="p-4 text-np-muted font-mono text-sm">No items found in this library.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.ratingKey}
                  onClick={() => {
                    setSelectedItem(item);
                    setStep('details');
                  }}
                  className="episode-row text-sm"
                >
                  <span>
                    <span className="text-np-cyan mr-2 font-mono text-xs uppercase">
                      [{item.type}]
                    </span>
                    {item.grandparentTitle
                      ? `${item.grandparentTitle} — ${item.parentTitle ?? ''} — ${item.title}`
                      : item.title}
                  </span>
                </button>
              ))
            )}
          </GlassPanel>
        </div>
      </div>
    );
  }

  // ---- Step: details ----
  if (step === 'details') {
    return (
      <div>
        <StepIndicator current={step} />
        <div key="details" className="animate-enter">
          <h2 className={heading}>Step 3 — Share Details</h2>
          <button onClick={() => setStep('item')} className="btn-ghost text-xs">
            ← Back
          </button>

          <p className="text-np-muted font-mono text-sm mt-4">
            Sharing: <strong className="text-np-fg">{selectedItem?.title}</strong>
          </p>

          <form onSubmit={handleSubmit} className="mt-5 max-w-[480px] flex flex-col gap-4">
            <Input
              label="Recipient label *"
              required
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
              placeholder="e.g. Alice"
            />

            <Input
              label="From (shown to recipient, optional)"
              maxLength={60}
              value={senderLabel}
              onChange={(e) => setSenderLabel(e.target.value)}
              placeholder="e.g. Josh"
            />

            <div className="flex flex-col gap-1">
              <label
                htmlFor="recipient-note"
                className="text-xs font-mono uppercase tracking-wider text-np-muted"
              >
                Note (optional)
              </label>
              <textarea
                id="recipient-note"
                value={recipientNote}
                onChange={(e) => setRecipientNote(e.target.value)}
                placeholder="Private note about this share"
                rows={2}
                className={textareaCls}
              />
            </div>

            <Input
              label="TTL (hours)"
              type="number"
              min={1}
              max={168}
              value={ttlHours}
              onChange={(e) => setTtlHours(e.target.value)}
            />

            <Input
              label="Max plays (blank = unlimited)"
              type="number"
              min={1}
              value={maxPlays}
              onChange={(e) => setMaxPlays(e.target.value)}
              placeholder="Unlimited"
            />

            {submitError && <p className="text-np-magenta font-mono text-sm">{submitError}</p>}

            <div>
              <button
                type="submit"
                disabled={submitting || !recipientLabel.trim()}
                className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating…' : 'Create Share'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ---- Step: done ----
  if (step === 'done' && result) {
    return (
      <div>
        <StepIndicator current={step} />
        <div key="done" className="animate-enter">
          <h2 className="font-display uppercase tracking-wide text-lg text-np-green mb-4">
            Share Created
          </h2>
          <p className="text-np-muted font-mono text-sm mb-4">
            The share link is shown only once. Copy it now.
          </p>

          <GlassPanel className="p-4 mb-4">
            <div className="font-mono break-all text-np-cyan text-sm">{result.shareUrl}</div>
          </GlassPanel>

          <div className="flex flex-wrap gap-3">
            <button onClick={copyLink} className="btn-primary text-sm">
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
            <button
              onClick={() => router.push(`/dashboard/shares/${result.id}`)}
              className="btn-ghost text-sm"
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
              className="btn-ghost text-sm"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
