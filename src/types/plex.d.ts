// src/types/plex.d.ts
//
// Shared Plex response shapes. Source of truth per plan §A.5.

export interface PlexDirectory {
  key: string;
  title: string;
  type: 'movie' | 'show' | 'artist' | 'photo';
}

export interface PlexMediaContainerSections {
  MediaContainer: { Directory: PlexDirectory[] };
}

export interface PlexMetadata {
  ratingKey: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  title: string;
  parentTitle?: string;
  grandparentTitle?: string;
  duration?: number;
  index?: number;
  summary?: string;
  thumb?: string;
  art?: string;
  leafCount?: number;
  Media?: { Part?: { file: string; key: string }[] }[];
}

export interface PlexMetadataContainer {
  MediaContainer: { Metadata?: PlexMetadata[]; size?: number; totalSize?: number };
}

export interface PlexTranscodeStartParams {
  ratingKey: string;
  linkId: string; // used as session id
  maxVideoBitrate?: number; // default 20000
}
