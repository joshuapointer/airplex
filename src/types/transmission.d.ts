// src/types/transmission.d.ts
// Mission B — Phase 2 transmission types (plan §A.5).

export interface LiveMap {
  /** share.id → true if a recent play event was observed within LIVE_WINDOW_S. */
  [shareId: string]: boolean;
}

// LIVE_WINDOW_S lives in src/db/queries/events.ts

// ── Mission C (Autopilot) — event tail types ──

import type { ShareEventKind } from '@/types/share';

export interface EventTailRow {
  id: number;
  at: number;
  kind: ShareEventKind;
  share_id: string;
  recipient_label: string | null;
  short_detail: string | null;
}

export interface EventTailResponse {
  events: EventTailRow[];
  serverTs: number;
}
