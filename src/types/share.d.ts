// src/types/share.d.ts
// Single source of truth for share-related DB row types.
// Plan §A.1 — any drift from this file is a review-blocking issue.

export type ShareMediaType = 'movie' | 'episode' | 'show';

export interface ShareRow {
  id: string; // nanoid(12) link_id
  token_hash: string; // hex sha256(full_token)
  plex_rating_key: string;
  title: string;
  plex_media_type: ShareMediaType;
  recipient_label: string;
  recipient_note: string | null;
  sender_label: string | null;
  poster_path: string | null;
  created_at: number; // unix seconds
  expires_at: number | null; // null = never expires
  max_plays: number | null;
  play_count: number;
  device_fingerprint_hash: string | null;
  device_locked_at: number | null;
  revoked_at: number | null;
  created_by_sub: string;
}

export type ShareEventKind =
  | 'created'
  | 'claimed'
  | 'play'
  | 'rejected_device'
  | 'expired'
  | 'revoked'
  | 'reset'
  | 'extended';

export interface ShareEventRow {
  id: number;
  share_id: string;
  at: number;
  kind: ShareEventKind;
  ip_hash: string | null;
  ua_hash: string | null;
  detail: string | null; // JSON blob
}

export interface ShareStatus {
  active: boolean;
  expired: boolean;
  revoked: boolean;
  exhausted: boolean; // play_count >= max_plays
  claimed: boolean; // device_fingerprint_hash != null
}
