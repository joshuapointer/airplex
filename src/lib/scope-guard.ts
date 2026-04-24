// src/lib/scope-guard.ts
//
// Scope containment helpers for share-scoped API routes. Used to enforce
// that a Plex `ratingKey` supplied via query-string belongs to the item
// the share actually grants access to — preventing a claimed recipient
// from enumerating unrelated Plex library content.

import type { PlexMetadata } from '@/types/plex';

/**
 * True iff `plex` (fetched metadata for some ratingKey) is the share root
 * or one of its immediate descendants. Uses Plex's own ancestry fields:
 *   - episodes point to their season (parentRatingKey) and show
 *     (grandparentRatingKey)
 *   - seasons point to their show (parentRatingKey)
 *
 * For non-show shares the caller already blocks `?rk=` overrides; this
 * helper is only called once the share is known to be a show and an
 * override was requested.
 */
export function isDescendantOfShow(plex: PlexMetadata, showRatingKey: string): boolean {
  if (String(plex.ratingKey) === showRatingKey) return true;
  if (plex.type === 'episode') return plex.grandparentRatingKey === showRatingKey;
  if (plex.type === 'season') return plex.parentRatingKey === showRatingKey;
  return false;
}
