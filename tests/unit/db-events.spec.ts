/**
 * Unit tests for src/db/queries/events.ts
 *
 * Because events.ts caches prepared statements in module-level variables and has
 * no __resetStmtsForTests export, we use vi.resetModules() + dynamic imports so
 * that each test gets a fresh module with brand-new statements bound to the
 * newly-created in-memory DB.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __resetDbForTests } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { __resetStmtsForTests, insertShare } from '@/db/queries/shares';
import { makeFakeShareRow } from './_helpers';
import type { ShareRow } from '@/types/share';

// Reset DB + module cache before every test so each test gets isolated state.
beforeEach(() => {
  vi.resetModules();
  __resetStmtsForTests();
  __resetDbForTests();
  runMigrations();
});

// Build a minimal valid ShareRow with a unique id.
function makeRow(partial?: Partial<ShareRow>): ShareRow {
  return makeFakeShareRow({
    id: `evtshare-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ...partial,
  });
}

describe('db-events: logEvent', () => {
  it('inserts a row that appears in listRecentEventsWithShare', async () => {
    const { logEvent, listRecentEventsWithShare } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);

    logEvent({ share_id: row.id, kind: 'play' });

    const events = listRecentEventsWithShare(10);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const found = events.find((e) => e.share_id === row.id);
    expect(found).toBeDefined();
    expect(found!.kind).toBe('play');
  });

  it('stores the detail string when provided as a string', async () => {
    const { logEvent } = await import('@/db/queries/events');
    // Importing getDb directly to verify raw storage.
    const { getDb } = await import('@/db/client');

    const row = makeRow();
    insertShare(row);

    logEvent({ share_id: row.id, kind: 'created', detail: 'custom-detail' });

    const db = getDb();
    const stored = db
      .prepare('SELECT detail FROM share_events WHERE share_id = ? AND kind = ?')
      .get(row.id, 'created') as { detail: string | null } | undefined;
    expect(stored).toBeDefined();
    expect(stored!.detail).toBe('custom-detail');
  });

  it('stores JSON-serialised detail when detail is an object', async () => {
    const { logEvent } = await import('@/db/queries/events');
    const { getDb } = await import('@/db/client');

    const row = makeRow();
    insertShare(row);

    logEvent({ share_id: row.id, kind: 'claimed', detail: { device_fp: 'abc123' } });

    const db = getDb();
    const stored = db
      .prepare('SELECT detail FROM share_events WHERE share_id = ? AND kind = ?')
      .get(row.id, 'claimed') as { detail: string | null } | undefined;
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!.detail!);
    expect(parsed.device_fp).toBe('abc123');
  });

  it('stores null detail when none provided', async () => {
    const { logEvent } = await import('@/db/queries/events');
    const { getDb } = await import('@/db/client');

    const row = makeRow();
    insertShare(row);

    logEvent({ share_id: row.id, kind: 'revoked' });

    const db = getDb();
    const stored = db
      .prepare('SELECT detail FROM share_events WHERE share_id = ? AND kind = ?')
      .get(row.id, 'revoked') as { detail: string | null } | undefined;
    expect(stored!.detail).toBeNull();
  });

  it('records at as a unix-seconds timestamp', async () => {
    const { logEvent } = await import('@/db/queries/events');
    const { getDb } = await import('@/db/client');

    const row = makeRow();
    insertShare(row);

    const before = Math.floor(Date.now() / 1000);
    logEvent({ share_id: row.id, kind: 'play' });
    const after = Math.floor(Date.now() / 1000);

    const db = getDb();
    const stored = db
      .prepare('SELECT at FROM share_events WHERE share_id = ?')
      .get(row.id) as { at: number } | undefined;
    expect(stored!.at).toBeGreaterThanOrEqual(before);
    expect(stored!.at).toBeLessThanOrEqual(after);
  });
});

describe('db-events: listRecentEventsWithShare', () => {
  it('returns events joined with share recipient_label', async () => {
    const { logEvent, listRecentEventsWithShare } = await import('@/db/queries/events');

    const row = makeRow({ recipient_label: 'Alice' });
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play' });

    const events = listRecentEventsWithShare(10);
    const found = events.find((e) => e.share_id === row.id);
    expect(found).toBeDefined();
    expect(found!.recipient_label).toBe('Alice');
  });

  it('respects the limit parameter', async () => {
    const { logEvent, listRecentEventsWithShare } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);

    // Insert 5 events.
    for (let i = 0; i < 5; i++) {
      logEvent({ share_id: row.id, kind: 'play' });
    }

    const events = listRecentEventsWithShare(3);
    expect(events.length).toBeLessThanOrEqual(3);
  });

  it('returns an empty array when no events exist', async () => {
    const { listRecentEventsWithShare } = await import('@/db/queries/events');
    const events = listRecentEventsWithShare(10);
    expect(events).toEqual([]);
  });

  it('returned rows have the expected shape (id, at, kind, share_id, recipient_label, short_detail)', async () => {
    const { logEvent, listRecentEventsWithShare } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'revoked' });

    const events = listRecentEventsWithShare(1);
    expect(events.length).toBe(1);
    const e = events[0];
    expect(typeof e.id).toBe('number');
    expect(typeof e.at).toBe('number');
    expect(e.kind).toBe('revoked');
    expect(e.share_id).toBe(row.id);
    // short_detail for 'revoked' is 'revoked'
    expect(e.short_detail).toBe('revoked');
  });

  it('orders events newest first', async () => {
    const { logEvent, listRecentEventsWithShare } = await import('@/db/queries/events');
    const { getDb } = await import('@/db/client');

    const row = makeRow();
    insertShare(row);

    const db = getDb();
    // Insert two events with explicit timestamps so ordering is predictable.
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'play', NULL, NULL, NULL)",
    ).run(row.id, 1000);
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'revoked', NULL, NULL, NULL)",
    ).run(row.id, 2000);

    // Force stmt re-creation since we inserted directly.
    vi.resetModules();
    const { listRecentEventsWithShare: list2 } = await import('@/db/queries/events');
    const events = list2(10);
    // Newest (at=2000, 'revoked') should come first.
    expect(events[0].at).toBeGreaterThanOrEqual(events[1].at);
  });
});

describe('db-events: getRecentPlayShareIds', () => {
  it('returns share IDs from recent play events', async () => {
    const { logEvent, getRecentPlayShareIds } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play' });

    const ids = getRecentPlayShareIds(60);
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has(row.id)).toBe(true);
  });

  it('does not include non-play events', async () => {
    const { logEvent, getRecentPlayShareIds } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'claimed' });

    const ids = getRecentPlayShareIds(60);
    expect(ids.has(row.id)).toBe(false);
  });

  it('returns an empty Set when no play events exist', async () => {
    const { getRecentPlayShareIds } = await import('@/db/queries/events');
    const ids = getRecentPlayShareIds(60);
    expect(ids.size).toBe(0);
  });

  it('de-duplicates share IDs (multiple plays on the same share count once)', async () => {
    const { logEvent, getRecentPlayShareIds } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play' });
    logEvent({ share_id: row.id, kind: 'play' });
    logEvent({ share_id: row.id, kind: 'play' });

    const ids = getRecentPlayShareIds(60);
    // Set: only one entry for this share.
    let count = 0;
    for (const id of ids) {
      if (id === row.id) count++;
    }
    expect(count).toBe(1);
  });

  it('excludes play events outside the time window', async () => {
    vi.useFakeTimers();
    const { getRecentPlayShareIds } = await import('@/db/queries/events');
    const { getDb } = await import('@/db/client');

    const row = makeRow();
    insertShare(row);

    // Insert an event far in the past (beyond 60 seconds).
    const db = getDb();
    const oldAt = Math.floor(Date.now() / 1000) - 200;
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'play', NULL, NULL, NULL)",
    ).run(row.id, oldAt);

    const ids = getRecentPlayShareIds(60);
    expect(ids.has(row.id)).toBe(false);

    vi.useRealTimers();
  });
});

describe('db-events: listEventsByShare', () => {
  it('returns events for a specific share in descending order', async () => {
    const { logEvent, listEventsByShare } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'created' });
    logEvent({ share_id: row.id, kind: 'play' });

    const events = listEventsByShare(row.id);
    expect(events.length).toBe(2);
    // Most recent first.
    const kinds = events.map((e) => e.kind);
    // play was logged after created, so it should appear first.
    expect(kinds[0]).toBe('play');
    expect(kinds[1]).toBe('created');
  });

  it('returns an empty array for a share with no events', async () => {
    const { listEventsByShare } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);

    const events = listEventsByShare(row.id);
    expect(events).toEqual([]);
  });

  it('does not return events from a different share', async () => {
    const { logEvent, listEventsByShare } = await import('@/db/queries/events');

    const rowA = makeRow();
    const rowB = makeRow();
    insertShare(rowA);
    insertShare(rowB);

    logEvent({ share_id: rowA.id, kind: 'play' });
    logEvent({ share_id: rowB.id, kind: 'revoked' });

    const eventsA = listEventsByShare(rowA.id);
    expect(eventsA.every((e) => e.share_id === rowA.id)).toBe(true);
  });

  it('respects the limit parameter', async () => {
    const { logEvent, listEventsByShare } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);
    for (let i = 0; i < 10; i++) {
      logEvent({ share_id: row.id, kind: 'play' });
    }

    const events = listEventsByShare(row.id, 3);
    expect(events.length).toBeLessThanOrEqual(3);
  });

  it('returned rows include ip_hash, ua_hash, and detail fields', async () => {
    const { logEvent, listEventsByShare } = await import('@/db/queries/events');

    const row = makeRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play', ip: '1.2.3.4', userAgent: 'test-agent' });

    const events = listEventsByShare(row.id, 1);
    expect(events.length).toBe(1);
    const e = events[0];
    // ip_hash and ua_hash are derived — just assert they're strings or null.
    expect(e.ip_hash === null || typeof e.ip_hash === 'string').toBe(true);
    expect(e.ua_hash === null || typeof e.ua_hash === 'string').toBe(true);
  });
});
