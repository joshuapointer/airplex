import { describe, it, expect, beforeEach } from 'vitest';
import { __resetDbForTests } from '@/db/client';
import { runMigrations } from '@/db/migrate';
import {
  getSetting,
  setSetting,
  deleteSetting,
  __resetSettingsStmtsForTests,
} from '@/db/queries/settings';
import { __resetStmtsForTests } from '@/db/queries/shares';

// Reset in-memory DB and all prepared-statement caches before each test so
// tests are fully independent.
beforeEach(() => {
  __resetStmtsForTests();
  __resetSettingsStmtsForTests();
  __resetDbForTests();
  runMigrations();
});

describe('db-settings: getSetting', () => {
  it('returns null for a key that does not exist', () => {
    expect(getSetting('nonexistent.key')).toBeNull();
  });

  it('returns null after the table is freshly migrated (empty state)', () => {
    expect(getSetting('plex_base_url')).toBeNull();
    expect(getSetting('plex_token')).toBeNull();
  });
});

describe('db-settings: setSetting', () => {
  it('inserts a new key-value pair', () => {
    setSetting('plex_base_url', 'http://plex.local:32400');
    expect(getSetting('plex_base_url')).toBe('http://plex.local:32400');
  });

  it('stores an empty string value', () => {
    setSetting('empty.key', '');
    expect(getSetting('empty.key')).toBe('');
  });

  it('stores a JSON string value', () => {
    const json = JSON.stringify({ a: 1, b: true });
    setSetting('complex.key', json);
    expect(getSetting('complex.key')).toBe(json);
  });
});

describe('db-settings: upsert behaviour', () => {
  it('getSetting returns value after setSetting', () => {
    setSetting('my.key', 'initial');
    expect(getSetting('my.key')).toBe('initial');
  });

  it('setSetting with same key updates the existing row (upsert)', () => {
    setSetting('my.key', 'first');
    setSetting('my.key', 'second');
    expect(getSetting('my.key')).toBe('second');
  });

  it('multiple upserts always reflect the last written value', () => {
    for (let i = 0; i < 5; i++) {
      setSetting('counter', String(i));
    }
    expect(getSetting('counter')).toBe('4');
  });

  it('different keys are stored independently', () => {
    setSetting('key.a', 'alpha');
    setSetting('key.b', 'beta');
    expect(getSetting('key.a')).toBe('alpha');
    expect(getSetting('key.b')).toBe('beta');
  });

  it('updating one key does not affect another', () => {
    setSetting('stable.key', 'unchanged');
    setSetting('other.key', 'value1');
    setSetting('other.key', 'value2');
    expect(getSetting('stable.key')).toBe('unchanged');
  });
});

describe('db-settings: deleteSetting', () => {
  it('removes the row so getSetting returns null', () => {
    setSetting('to.delete', 'present');
    expect(getSetting('to.delete')).toBe('present');
    deleteSetting('to.delete');
    expect(getSetting('to.delete')).toBeNull();
  });

  it('does not throw when deleting a non-existent key', () => {
    expect(() => deleteSetting('never.existed')).not.toThrow();
  });

  it('deleting one key does not remove another key', () => {
    setSetting('keep.this', 'kept');
    setSetting('remove.this', 'gone');
    deleteSetting('remove.this');
    expect(getSetting('keep.this')).toBe('kept');
    expect(getSetting('remove.this')).toBeNull();
  });

  it('setSetting after deleteSetting inserts a fresh row', () => {
    setSetting('cycle.key', 'first');
    deleteSetting('cycle.key');
    setSetting('cycle.key', 'reborn');
    expect(getSetting('cycle.key')).toBe('reborn');
  });

  it('repeated deletes are idempotent', () => {
    setSetting('idempotent.key', 'val');
    deleteSetting('idempotent.key');
    deleteSetting('idempotent.key'); // should not throw
    expect(getSetting('idempotent.key')).toBeNull();
  });
});
