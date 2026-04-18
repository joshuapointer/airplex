import type { ShareRow } from '@/types/share';

const NOW = Math.floor(Date.now() / 1000);

export function makeFakeShareRow(partial?: Partial<ShareRow>): ShareRow {
  return {
    id: 'testlinkid1',
    token_hash: 'a'.repeat(64),
    plex_rating_key: '12345',
    title: 'Test Movie',
    plex_media_type: 'movie',
    recipient_label: 'Test User',
    recipient_note: null,
    created_at: NOW,
    expires_at: NOW + 86400,
    max_plays: null,
    play_count: 0,
    device_fingerprint_hash: null,
    device_locked_at: null,
    revoked_at: null,
    created_by_sub: 'sub-test',
    ...partial,
  };
}
