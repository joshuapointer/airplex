/**
 * Unit tests for src/db/queries/events.ts
 *
 * Uses in-memory SQLite (same pattern as db-queries.spec.ts).
 * __resetEventsStmtsForTests resets all cached prepared statements so each
 * test gets fresh statements bound to the newly-created in-memory DB.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { __resetDbForTests, getDb } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import { __resetStmtsForTests, insertShare } from '@/db/queries/shares';
import {
  logEvent,
  listRecentEventsWithShare,
  getRecentPlayShareIds,
  listEventsByShare,
  __resetEventsStmtsForTests,
} from '@/db/queries/events';
import { makeFakeShareRow } from './_helpers';
import type { ShareRow } from '@/types/share';

// Reset in-memory DB and all prepared-statement caches before each test.
beforeEach(() => {
  __resetStmtsForTests();
  __resetEventsStmtsForTests();
  __resetDbForTests();
  runMigrations();
});

afterEach(() => {
  vi.useRealTimers();
});

// Build a share row with a guaranteed-unique token_hash to avoid UNIQUE violations.
let _tokenCounter = 0;
function makeUniqueRow(partial?: Partial<ShareRow>): ShareRow {
  _tokenCounter++;
  const hash = String(_tokenCounter).padStart(64, '0');
  return makeFakeShareRow({
    id: `evtshare-${_tokenCounter}-${Math.random().toString(36).slice(2, 6)}`,
    token_hash: hash,
    ...partial,
  });
}

describe('db-events: logEvent', () => {
  it('inserts a row that appears in listRecentEventsWithShare', () => {
    const row = makeUniqueRow();
    insertShare(row);

    logEvent({ share_id: row.id, kind: 'play' });

    const events = listRecentEventsWithShare(10);
    expect(events.length).toBeGreaterThanOrEqual(1);
    const found = events.find((e) => e.share_id === row.id);
    expect(found).toBeDefined();
    expect(found!.kind).toBe('play');
  });

  it('stores the detail string when provided as a string', () => {
    const row = makeUniqueRow();
    insertShare(row);

    logEvent({ share_id: row.id, kind: 'created', detail: 'custom-detail' });

    const db = getDb();
    const stored = db
      .prepare('SELECT detail FROM share_events WHERE share_id = ? AND kind = ?')
      .get(row.id, 'created') as { detail: string | null } | undefined;
    expect(stored).toBeDefined();
    expect(stored!.detail).toBe('custom-detail');
  });

  it('stores JSON-serialised detail when detail is an object', () => {
    const row = makeUniqueRow();
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

  it('stores null detail when none provided', () => {
    const row = makeUniqueRow();
    insertShare(row);

    logEvent({ share_id: row.id, kind: 'revoked' });

    const db = getDb();
    const stored = db
      .prepare('SELECT detail FROM share_events WHERE share_id = ? AND kind = ?')
      .get(row.id, 'revoked') as { detail: string | null } | undefined;
    expect(stored!.detail).toBeNull();
  });

  it('records at as a unix-seconds timestamp close to now', () => {
    const row = makeUniqueRow();
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
  it('returns events joined with share recipient_label', () => {
    const row = makeUniqueRow({ recipient_label: 'Alice' });
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play' });

    const events = listRecentEventsWithShare(10);
    const found = events.find((e) => e.share_id === row.id);
    expect(found).toBeDefined();
    expect(found!.recipient_label).toBe('Alice');
  });

  it('respects the limit parameter', () => {
    const row = makeUniqueRow();
    insertShare(row);

    for (let i = 0; i < 5; i++) {
      logEvent({ share_id: row.id, kind: 'play' });
    }

    const events = listRecentEventsWithShare(3);
    expect(events.length).toBeLessThanOrEqual(3);
  });

  it('returns an empty array when no events exist', () => {
    const events = listRecentEventsWithShare(10);
    expect(events).toEqual([]);
  });

  it('returned rows have the expected shape (id, at, kind, share_id, recipient_label, short_detail)', () => {
    const row = makeUniqueRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'revoked' });

    const events = listRecentEventsWithShare(1);
    expect(events.length).toBe(1);
    const e = events[0]!;
    expect(typeof e.id).toBe('number');
    expect(typeof e.at).toBe('number');
    expect(e.kind).toBe('revoked');
    expect(e.share_id).toBe(row.id);
    // short_detail for 'revoked' kind is 'revoked'
    expect(e.short_detail).toBe('revoked');
  });

  it('orders events newest first', () => {
    const row = makeUniqueRow();
    insertShare(row);

    const db = getDb();
    // Insert two events with explicit timestamps so ordering is predictable.
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'play', NULL, NULL, NULL)",
    ).run(row.id, 1000);
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'revoked', NULL, NULL, NULL)",
    ).run(row.id, 2000);

    // Reset statement caches since we inserted directly via raw SQL.
    __resetEventsStmtsForTests();

    const events = listRecentEventsWithShare(10);
    // The event with at=2000 ('revoked') should appear before at=1000 ('play').
    const myEvents = events.filter((e) => e.share_id === row.id);
    expect(myEvents.length).toBe(2);
    expect(myEvents[0]!.at).toBeGreaterThanOrEqual(myEvents[1]!.at);
    expect(myEvents[0]!.kind).toBe('revoked');
  });
});

describe('db-events: getRecentPlayShareIds', () => {
  it('returns share IDs from recent play events', () => {
    const row = makeUniqueRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play' });

    const ids = getRecentPlayShareIds(60);
    expect(ids).toBeInstanceOf(Set);
    expect(ids.has(row.id)).toBe(true);
  });

  it('does not include non-play events', () => {
    const row = makeUniqueRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'claimed' });

    const ids = getRecentPlayShareIds(60);
    expect(ids.has(row.id)).toBe(false);
  });

  it('returns an empty Set when no play events exist', () => {
    const ids = getRecentPlayShareIds(60);
    expect(ids.size).toBe(0);
  });

  it('de-duplicates share IDs (multiple plays on same share count once)', () => {
    const row = makeUniqueRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play' });
    logEvent({ share_id: row.id, kind: 'play' });
    logEvent({ share_id: row.id, kind: 'play' });

    const ids = getRecentPlayShareIds(60);
    let count = 0;
    for (const id of ids) {
      if (id === row.id) count++;
    }
    expect(count).toBe(1);
  });

  it('excludes play events outside the time window', () => {
    const row = makeUniqueRow();
    insertShare(row);

    // Insert a play event with a timestamp far in the past (beyond 60 s window).
    const db = getDb();
    const oldAt = Math.floor(Date.now() / 1000) - 200;
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'play', NULL, NULL, NULL)",
    ).run(row.id, oldAt);

    // Reset so the fresh stmt sees the raw-inserted row.
    __resetEventsStmtsForTests();

    const ids = getRecentPlayShareIds(60);
    expect(ids.has(row.id)).toBe(false);
  });
});

describe('db-events: listEventsByShare', () => {
  it('returns events for a specific share', () => {
    const row = makeUniqueRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'created' });
    logEvent({ share_id: row.id, kind: 'play' });

    const events = listEventsByShare(row.id);
    expect(events.length).toBe(2);
  });

  it('returns events in descending order (most recent first)', () => {
    const row = makeUniqueRow();
    insertShare(row);

    const db = getDb();
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'created', NULL, NULL, NULL)",
    ).run(row.id, 100);
    db.prepare(
      "INSERT INTO share_events (share_id, at, kind, ip_hash, ua_hash, detail) VALUES (?, ?, 'play', NULL, NULL, NULL)",
    ).run(row.id, 200);

    __resetEventsStmtsForTests();
    const events = listEventsByShare(row.id);
    expect(events.length).toBe(2);
    // at=200 ('play') should come first.
    expect(events[0]!.at).toBe(200);
    expect(events[0]!.kind).toBe('play');
    expect(events[1]!.at).toBe(100);
    expect(events[1]!.kind).toBe('created');
  });

  it('returns an empty array for a share with no events', () => {
    const row = makeUniqueRow();
    insertShare(row);

    const events = listEventsByShare(row.id);
    expect(events).toEqual([]);
  });

  it('does not return events from a different share', () => {
    const rowA = makeUniqueRow();
    const rowB = makeUniqueRow();
    insertShare(rowA);
    insertShare(rowB);

    logEvent({ share_id: rowA.id, kind: 'play' });
    logEvent({ share_id: rowB.id, kind: 'revoked' });

    const eventsA = listEventsByShare(rowA.id);
    expect(eventsA.every((e) => e.share_id === rowA.id)).toBe(true);
  });

  it('respects the limit parameter', () => {
    const row = makeUniqueRow();
    insertShare(row);
    for (let i = 0; i < 10; i++) {
      logEvent({ share_id: row.id, kind: 'play' });
    }

    const events = listEventsByShare(row.id, 3);
    expect(events.length).toBeLessThanOrEqual(3);
  });

  it('returned rows include share_id, kind, at, ip_hash, ua_hash, detail fields', () => {
    const row = makeUniqueRow();
    insertShare(row);
    logEvent({ share_id: row.id, kind: 'play', ip: '1.2.3.4', userAgent: 'test-agent' });

    const events = listEventsByShare(row.id, 1);
    expect(events.length).toBe(1);
    const e = events[0]!;
    expect(typeof e.id).toBe('number');
    expect(e.share_id).toBe(row.id);
    expect(e.kind).toBe('play');
    expect(typeof e.at).toBe('number');
    // ip_hash and ua_hash are hashed — just assert they're strings or null.
    expect(e.ip_hash === null || typeof e.ip_hash === 'string').toBe(true);
    expect(e.ua_hash === null || typeof e.ua_hash === 'string').toBe(true);
  });
});
