'use client';
import { useEffect, useRef, useState } from 'react';
import type { EventTailRow, EventTailResponse } from '@/types/transmission';

function formatClock(at: number): string {
  return new Date(at * 1000).toLocaleTimeString('en-GB', { hour12: false });
}

export function EventTail() {
  const [events, setEvents] = useState<EventTailRow[]>([]);
  const [newIds, setNewIds] = useState<Set<number>>(new Set());
  const knownIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const controller = new AbortController();

    async function fetchEvents() {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/admin/events/recent', {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data: EventTailResponse = (await res.json()) as EventTailResponse;
        const incoming = data.events;

        const fresh: number[] = [];
        for (const e of incoming) {
          if (!knownIdsRef.current.has(e.id)) {
            fresh.push(e.id);
          }
        }

        // Update known ids
        const newKnown = new Set<number>(incoming.map((e) => e.id));
        knownIdsRef.current = newKnown;

        setEvents(incoming);

        if (fresh.length > 0) {
          setNewIds(new Set(fresh));
          setTimeout(() => {
            setNewIds((prev) => {
              const next = new Set(prev);
              for (const id of fresh) next.delete(id);
              return next;
            });
          }, 1200);
        }
      } catch {
        // fetch aborted or network error — ignore
      }
    }

    function startPolling() {
      void fetchEvents();
      intervalId = setInterval(() => void fetchEvents(), 2000);
    }

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        startPolling();
      } else {
        stopPolling();
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    startPolling();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopPolling();
      controller.abort();
    };
  }, []);

  return (
    <aside className="event-tail" role="log" aria-live="polite" aria-label="Recent events">
      {events.map((e) => (
        <div key={e.id} className="event-tail-row" data-new={newIds.has(e.id) ? 'true' : undefined}>
          <span className="event-tail-ts">{formatClock(e.at)}</span>
          <span className="event-tail-kind">{e.kind}</span>
          <span className="event-tail-body">
            {e.recipient_label ?? e.share_id.slice(0, 6)}
            {e.short_detail ? ` · ${e.short_detail}` : ''}
          </span>
        </div>
      ))}
    </aside>
  );
}
