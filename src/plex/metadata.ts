// src/plex/metadata.ts
//
// Plex metadata helpers. Consume plexJson from ./client.

import { plexJson } from './client';
import { notFound } from '@/lib/errors';
import type { PlexMetadata, PlexMetadataContainer } from '@/types/plex';

export async function getMetadata(ratingKey: string): Promise<PlexMetadata> {
  const body = await plexJson<PlexMetadataContainer>({
    path: `/library/metadata/${encodeURIComponent(ratingKey)}`,
  });
  const item = body.MediaContainer?.Metadata?.[0];
  if (!item) {
    throw notFound(`Plex metadata not found for ratingKey=${ratingKey}`);
  }
  return item;
}

export async function getChildren(ratingKey: string): Promise<PlexMetadata[]> {
  const body = await plexJson<PlexMetadataContainer>({
    path: `/library/metadata/${encodeURIComponent(ratingKey)}/children`,
  });
  return body.MediaContainer?.Metadata ?? [];
}
