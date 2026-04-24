// src/plex/search.ts
//
// Plex search helper. When `sectionId` is provided, narrows to that section's
// /all?title=<q>; otherwise uses the global /library/sections/all/search.
// Filters to {movie, show, episode} per plan §A.9.

import type { PlexMetadata } from '@/types/plex';
import { plexJson } from './client';

export interface PlexSearchResult {
  ratingKey: string;
  type: 'movie' | 'show' | 'episode';
  title: string;
  grandparentTitle?: string;
  parentTitle?: string;
  year?: number;
  thumb?: string;
}

interface PlexSearchResponse {
  MediaContainer: { Metadata?: PlexMetadata[]; size?: number };
}

export async function searchPlex(opts: {
  query: string;
  sectionId?: string;
  limit?: number;
}): Promise<PlexSearchResult[]> {
  const { query, sectionId, limit = 15 } = opts;

  let path: string;
  let queryParams: Record<string, string | number>;

  if (sectionId) {
    path = `/library/sections/${encodeURIComponent(sectionId)}/all`;
    queryParams = { title: query, 'X-Plex-Container-Size': limit };
  } else {
    path = '/library/sections/all/search';
    queryParams = { query, limit };
  }

  const res = await plexJson<PlexSearchResponse>({
    path,
    query: queryParams,
    method: 'GET',
    accept: 'json',
  });

  const items = res.MediaContainer?.Metadata ?? [];
  return items
    .filter((i) => i.type === 'movie' || i.type === 'show' || i.type === 'episode')
    .slice(0, limit)
    .map((i) => ({
      ratingKey: i.ratingKey,
      type: i.type as 'movie' | 'show' | 'episode',
      title: i.title,
      grandparentTitle: i.grandparentTitle,
      parentTitle: i.parentTitle,
      year: (i as { year?: number }).year,
      thumb: i.thumb,
    }));
}
