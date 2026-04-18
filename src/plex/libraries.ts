// src/plex/libraries.ts
//
// Plex library listing helpers. Consume plexJson from ./client.

import { plexJson } from './client';
import type {
  PlexDirectory,
  PlexMediaContainerSections,
  PlexMetadata,
  PlexMetadataContainer,
} from '@/types/plex';

export async function listSections(): Promise<PlexDirectory[]> {
  const body = await plexJson<PlexMediaContainerSections>({
    path: '/library/sections',
  });
  return body.MediaContainer?.Directory ?? [];
}

export async function listItems(
  sectionId: string,
  start: number,
  size: number,
): Promise<{ items: PlexMetadata[]; total: number }> {
  const body = await plexJson<PlexMetadataContainer>({
    path: `/library/sections/${encodeURIComponent(sectionId)}/all`,
    query: {
      'X-Plex-Container-Start': start,
      'X-Plex-Container-Size': size,
    },
  });
  const mc = body.MediaContainer ?? {};
  return {
    items: mc.Metadata ?? [],
    total: mc.totalSize ?? mc.size ?? 0,
  };
}
