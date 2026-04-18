import { describe, it, expect, beforeEach } from 'vitest';
import { __resetDbForTests } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import {
  insertShare,
  getShareById,
  claimDevice,
  revokeShare,
  resetDevice,
  extendShare,
  incrementPlayCount,
  computeShareStatus,
  __resetStmtsForTests,
} from '@/db/queries/shares';
import { makeFakeShareRow } from './_helpers';
import type { ShareRow } from '@/types/share';

// Reset the in-memory DB before each test so tests are independent.
// Also reset the prepared-statement cache so stmts are re-created against the new db.
beforeEach(() => {
  __resetStmtsForTests();
  __resetDbForTests();
  runMigrations();
});

function makeRow(partial?: Partial<ShareRow>): ShareRow {
  return makeFakeShareRow({
    id: `share${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    ...partial,
  });
}

describe('db-queries: insertShare / getShareById', () => {
  it('inserts a share and retrieves it by id', () => {
    const row = makeRow();
    insertShare(row);
    const fetched = getShareById(row.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(row.id);
    expect(fetched!.title).toBe(row.title);
    expect(fetched!.plex_rating_key).toBe(row.plex_rating_key);
  });

  it('returns null for non-existent id', () => {
    expect(getShareById('doesnotexist')).toBeNull();
  });

  it('round-trips all nullable fields correctly', () => {
    const row = makeRow({
      recipient_note: 'A note',
      max_plays: 5,
      device_fingerprint_hash: null,
      device_locked_at: null,
      revoked_at: null,
    });
    insertShare(row);
    const fetched = getShareById(row.id)!;
    expect(fetched.recipient_note).toBe('A note');
    expect(fetched.max_plays).toBe(5);
    expect(fetched.device_fingerprint_hash).toBeNull();
    expect(fetched.revoked_at).toBeNull();
  });
});

describe('db-queries: claimDevice atomicity', () => {
  it('first claim returns true and sets device_fingerprint_hash', () => {
    const row = makeRow();
    insertShare(row);
    const claimed = claimDevice(row.id, 'fp_aabbccdd112233440000000000000000');
    expect(claimed).toBe(true);
    const fetched = getShareById(row.id)!;
    expect(fetched.device_fingerprint_hash).toBe('fp_aabbccdd112233440000000000000000');
    expect(fetched.device_locked_at).not.toBeNull();
  });

  it('second claim (different fp) returns false — device already locked', () => {
    const row = makeRow();
    insertShare(row);
    // First claim wins
    const first = claimDevice(row.id, 'fp_first_1234567890123456789012345');
    expect(first).toBe(true);
    // Second claim loses
    const second = claimDevice(row.id, 'fp_second_123456789012345678901234');
    expect(second).toBe(false);
    // DB still has the first fingerprint
    const fetched = getShareById(row.id)!;
    expect(fetched.device_fingerprint_hash).toBe('fp_first_1234567890123456789012345');
  });

  it('simulates concurrent-ish claims — only one wins', () => {
    const row = makeRow();
    insertShare(row);
    // SQLite is synchronous so we call both back-to-back to simulate concurrency
    const results = [
      claimDevice(row.id, 'fp_concurrent_a0000000000000000000000'),
      claimDevice(row.id, 'fp_concurrent_b0000000000000000000000'),
    ];
    const trueCount = results.filter(Boolean).length;
    const falseCount = results.filter((r) => !r).length;
    expect(trueCount).toBe(1);
    expect(falseCount).toBe(1);
  });
});

describe('db-queries: revokeShare', () => {
  it('sets revoked_at to a non-null unix timestamp', () => {
    const row = makeRow();
    insertShare(row);
    const before = Math.floor(Date.now() / 1000);
    revokeShare(row.id);
    const after = Math.floor(Date.now() / 1000);
    const fetched = getShareById(row.id)!;
    expect(fetched.revoked_at).not.toBeNull();
    expect(fetched.revoked_at!).toBeGreaterThanOrEqual(before);
    expect(fetched.revoked_at!).toBeLessThanOrEqual(after);
  });
});

describe('db-queries: resetDevice', () => {
  it('clears device_fingerprint_hash and device_locked_at', () => {
    const row = makeRow();
    insertShare(row);
    claimDevice(row.id, 'fp_reset_test_0000000000000000000');
    resetDevice(row.id);
    const fetched = getShareById(row.id)!;
    expect(fetched.device_fingerprint_hash).toBeNull();
    expect(fetched.device_locked_at).toBeNull();
  });
});

describe('db-queries: extendShare', () => {
  it('updates expires_at to new value', () => {
    const row = makeRow();
    insertShare(row);
    const newExpiry = Math.floor(Date.now() / 1000) + 7 * 86400;
    extendShare(row.id, newExpiry);
    const fetched = getShareById(row.id)!;
    expect(fetched.expires_at).toBe(newExpiry);
  });
});

describe('db-queries: incrementPlayCount', () => {
  it('increments play_count by 1', () => {
    const row = makeRow({ play_count: 0 });
    insertShare(row);
    incrementPlayCount(row.id);
    const fetched = getShareById(row.id)!;
    expect(fetched.play_count).toBe(1);
  });

  it('increments multiple times correctly', () => {
    const row = makeRow({ play_count: 0 });
    insertShare(row);
    incrementPlayCount(row.id);
    incrementPlayCount(row.id);
    incrementPlayCount(row.id);
    const fetched = getShareById(row.id)!;
    expect(fetched.play_count).toBe(3);
  });
});

describe('db-queries: computeShareStatus', () => {
  const NOW = Math.floor(Date.now() / 1000);

  it('active share is active', () => {
    const row = makeFakeShareRow({
      expires_at: NOW + 86400,
      revoked_at: null,
      max_plays: null,
      play_count: 0,
      device_fingerprint_hash: null,
    });
    const status = computeShareStatus(row, NOW);
    expect(status.active).toBe(true);
    expect(status.expired).toBe(false);
    expect(status.revoked).toBe(false);
    expect(status.exhausted).toBe(false);
    expect(status.claimed).toBe(false);
  });

  it('expired share: expires_at <= now', () => {
    const row = makeFakeShareRow({
      expires_at: NOW - 1,
      revoked_at: null,
      max_plays: null,
      play_count: 0,
    });
    const status = computeShareStatus(row, NOW);
    expect(status.expired).toBe(true);
    expect(status.active).toBe(false);
  });

  it('revoked share', () => {
    const row = makeFakeShareRow({
      expires_at: NOW + 86400,
      revoked_at: NOW - 100,
      max_plays: null,
      play_count: 0,
    });
    const status = computeShareStatus(row, NOW);
    expect(status.revoked).toBe(true);
    expect(status.active).toBe(false);
  });

  it('exhausted share: play_count >= max_plays', () => {
    const row = makeFakeShareRow({
      expires_at: NOW + 86400,
      revoked_at: null,
      max_plays: 3,
      play_count: 3,
    });
    const status = computeShareStatus(row, NOW);
    expect(status.exhausted).toBe(true);
    expect(status.active).toBe(false);
  });

  it('not exhausted when play_count < max_plays', () => {
    const row = makeFakeShareRow({
      expires_at: NOW + 86400,
      revoked_at: null,
      max_plays: 5,
      play_count: 4,
    });
    const status = computeShareStatus(row, NOW);
    expect(status.exhausted).toBe(false);
    expect(status.active).toBe(true);
  });

  it('claimed when device_fingerprint_hash is set', () => {
    const row = makeFakeShareRow({
      expires_at: NOW + 86400,
      revoked_at: null,
      device_fingerprint_hash: 'abcd1234abcd1234abcd1234abcd1234',
    });
    const status = computeShareStatus(row, NOW);
    expect(status.claimed).toBe(true);
  });

  it('not exhausted when max_plays is null', () => {
    const row = makeFakeShareRow({
      expires_at: NOW + 86400,
      max_plays: null,
      play_count: 999,
    });
    const status = computeShareStatus(row, NOW);
    expect(status.exhausted).toBe(false);
  });
});
