'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlexMetadata } from '@/types/plex';
import type { PlexSearchResult } from '@/plex/search';
import { LibraryPicker } from './LibraryPicker';
import { useCsrf } from './CsrfContext';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { InlineError } from '@/components/ui/InlineError';
import { Spinner } from '@/components/ui/Spinner';
import { PosterCard } from '@/components/ui/transmission';

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
        <span key={s.key} className="chip-tab" aria-selected={i === currentIdx ? 'true' : 'false'}>
          {s.label}
        </span>
      ))}
    </div>
  );
}

function EnvelopeField({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="envelope-input mb-4">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Adapt a PlexSearchResult (typeahead response) into a PlexMetadata shape
 * the rest of the wizard consumes. Missing `ratingKey`/`title` would already
 * have been filtered by the server; defensive mapping here.
 */
function adaptSearchResultsToMetadata(results: PlexSearchResult[]): PlexMetadata[] {
  return results.map((r) => ({
    ratingKey: r.ratingKey,
    type: r.type,
    title: r.title,
    grandparentTitle: r.grandparentTitle,
    parentTitle: r.parentTitle,
    thumb: r.thumb,
  }));
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
  const [itemQuery, setItemQuery] = useState('');

  // Server-side typeahead (M9)
  const debouncedQuery = useDebouncedValue(itemQuery, 250);
  const [typeaheadItems, setTypeaheadItems] = useState<PlexMetadata[] | null>(null);
  const [typeaheadLoading, setTypeaheadLoading] = useState(false);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setTypeaheadItems(null);
      setTypeaheadLoading(false);
      return;
    }
    const ac = new AbortController();
    setTypeaheadLoading(true);
    const url =
      `/api/admin/libraries/search?q=${encodeURIComponent(debouncedQuery)}` +
      (sectionId ? `&sectionId=${encodeURIComponent(sectionId)}` : '');
    fetch(url, { signal: ac.signal, headers: { 'x-airplex-csrf': csrf } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { items: PlexSearchResult[] }) => {
        setTypeaheadItems(adaptSearchResultsToMetadata(data.items ?? []));
      })
      .catch(() => {
        /* aborted or error — revert to initial items */
      })
      .finally(() => {
        setTypeaheadLoading(false);
      });
    return () => ac.abort();
  }, [debouncedQuery, sectionId, csrf]);

  // Details form state
  const [recipientLabel, setRecipientLabel] = useState('');
  const [recipientNote, setRecipientNote] = useState('');
  const [senderLabel, setSenderLabel] = useState('');
  const [ttlHours, setTtlHours] = useState('48');
  const [ttlNever, setTtlNever] = useState(false);
  const [maxPlays, setMaxPlays] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Done state
  const [result, setResult] = useState<CreateResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Wizard slide — track previous step to run exit animation
  const stepRef = useRef<Step>(step);
  const [previous, setPrevious] = useState<Step | null>(null);
  useEffect(() => {
    if (stepRef.current !== step) {
      setPrevious(stepRef.current);
      stepRef.current = step;
    }
  }, [step]);
  const handleExitEnd = () => setPrevious(null);

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
    if (ttlNever) {
      body.ttl_hours = null;
    } else if (ttlHours) {
      body.ttl_hours = Number(ttlHours);
    }
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
  const headingDone = 'font-display uppercase tracking-wide text-lg text-np-green mb-4';

  function renderLibrary() {
    return (
      <div>
        <h2 className={heading}>Step 1 — Pick a Library</h2>
        <div className="max-w-[400px] flex flex-col gap-3">
          <LibraryPicker value={sectionId} onChange={setSectionId} disabled={itemsLoading} />
          {itemsError && <InlineError>{itemsError}</InlineError>}
          <div>
            <button
              onClick={() => loadItems(sectionId)}
              disabled={!sectionId || itemsLoading}
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {itemsLoading ? <Spinner variant="dots" label="Loading" /> : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderItem() {
    // Server-side typeahead when user has typed ≥ 2 chars; else show initial items.
    const displayItems: PlexMetadata[] = typeaheadItems ?? items;
    return (
      <div>
        <h2 className={heading}>Step 2 — Pick an Item</h2>
        <button
          onClick={() => {
            setItemQuery('');
            setTypeaheadItems(null);
            setStep('library');
          }}
          className="btn-ghost text-xs mb-4"
        >
          ← Back
        </button>
        <input
          type="text"
          value={itemQuery}
          onChange={(e) => setItemQuery(e.target.value)}
          placeholder="⌕ Search…"
          className="w-full bg-transparent border border-[rgba(255,255,255,0.12)] rounded-sharp px-3 py-2 text-sm font-mono text-np-fg outline-none focus:border-np-green mb-4"
          aria-label="Search items"
        />
        {typeaheadLoading && (
          <div className="mb-2">
            <Spinner variant="dots" label="Searching" />
          </div>
        )}
        {displayItems.length === 0 ? (
          <p className="p-4 text-np-muted font-mono text-sm">
            {typeaheadItems !== null ? 'No matches.' : 'No items found in this library.'}
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
            {displayItems.map((item) => (
              <button
                key={item.ratingKey}
                onClick={() => {
                  setSelectedItem(item);
                  setStep('details');
                }}
                className="library-tile snap-start shrink-0 bg-transparent border border-[rgba(255,255,255,0.1)] rounded-sharp p-2 hover:border-np-cyan transition-colors text-left"
                style={{ width: '180px' }}
              >
                <PosterCard
                  posterUrl={
                    item.thumb
                      ? `/api/admin/plex/thumb?path=${encodeURIComponent(item.thumb)}`
                      : null
                  }
                  title={item.title}
                  aspect="3/4"
                  width={160}
                  height={240}
                  loading="lazy"
                />
                <div className="mt-2 flex flex-col gap-0.5">
                  <span className="font-mono text-xs text-np-muted uppercase">{item.type}</span>
                  <span className="font-mono text-sm text-np-fg line-clamp-2">
                    {item.grandparentTitle
                      ? `${item.grandparentTitle} — ${item.title}`
                      : item.title}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderDetails() {
    return (
      <div>
        <h2 className={heading}>Step 3 — Share Details</h2>
        <button onClick={() => setStep('item')} className="btn-ghost text-xs">
          ← Back
        </button>

        <p className="text-np-muted font-mono text-sm mt-4">
          Sharing: <strong className="text-np-fg">{selectedItem?.title}</strong>
        </p>

        <form onSubmit={handleSubmit} className="mt-5 max-w-[480px]">
          <EnvelopeField label="To" id="recipient_label">
            <input
              id="recipient_label"
              required
              value={recipientLabel}
              onChange={(e) => setRecipientLabel(e.target.value)}
              placeholder="Alice"
            />
          </EnvelopeField>
          <EnvelopeField label="From" id="sender_label">
            <input
              id="sender_label"
              maxLength={60}
              value={senderLabel}
              onChange={(e) => setSenderLabel(e.target.value)}
              placeholder="Josh"
            />
          </EnvelopeField>
          <EnvelopeField label="Note" id="recipient_note">
            <textarea
              id="recipient_note"
              value={recipientNote}
              onChange={(e) => setRecipientNote(e.target.value)}
              placeholder="Optional private note"
              rows={2}
            />
          </EnvelopeField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EnvelopeField label="TTL (hours)" id="ttl_hours">
              <input
                id="ttl_hours"
                type="number"
                min={1}
                max={168}
                value={ttlNever ? '' : ttlHours}
                disabled={ttlNever}
                onChange={(e) => setTtlHours(e.target.value)}
                placeholder={ttlNever ? 'Never expires' : undefined}
              />
            </EnvelopeField>
            <EnvelopeField label="Max plays" id="max_plays">
              <input
                id="max_plays"
                type="number"
                min={1}
                value={maxPlays}
                onChange={(e) => setMaxPlays(e.target.value)}
                placeholder="Unlimited"
              />
            </EnvelopeField>
          </div>
          <label className="flex items-center gap-2 mt-2 font-mono text-xs text-np-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ttlNever}
              onChange={(e) => setTtlNever(e.target.checked)}
              className="accent-np-cyan"
              style={{ width: 16, height: 16 }}
            />
            Never expires
          </label>

          {submitError && (
            <div className="mb-3">
              <InlineError>{submitError}</InlineError>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={submitting || !recipientLabel.trim()}
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {submitting ? <Spinner variant="dots" label="Creating" /> : 'Create Share'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function renderDone() {
    if (!result) return null;
    return (
      <div>
        <h2 className={headingDone}>Share Created</h2>
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
              setItemQuery('');
              setTypeaheadItems(null);
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
    );
  }

  function renderStep(s: Step) {
    if (s === 'library') return renderLibrary();
    if (s === 'item') return renderItem();
    if (s === 'details') return renderDetails();
    if (s === 'done') return renderDone();
    return null;
  }

  return (
    <div>
      <StepIndicator current={step} />
      <div className="wizard-stage">
        {previous !== null && (
          <div data-wizard-layer="exit" onAnimationEnd={handleExitEnd} key={`exit-${previous}`}>
            {renderStep(previous)}
          </div>
        )}
        <div data-wizard-layer="enter" key={`enter-${step}`}>
          {renderStep(step)}
        </div>
      </div>
    </div>
  );
}
