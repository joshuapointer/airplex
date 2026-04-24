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

export interface PlexTag {
  tag: string;
  id?: number;
  filter?: string;
  thumb?: string; // for Role (actors) — character-portrait URL
  role?: string; // for Role (actors) — character name
}

export interface PlexMetadata {
  ratingKey: string;
  type: 'movie' | 'show' | 'season' | 'episode';
  title: string;
  parentTitle?: string;
  parentIndex?: number;
  parentYear?: number;
  parentRatingKey?: string;
  grandparentTitle?: string;
  grandparentRatingKey?: string;
  duration?: number;
  index?: number;
  year?: number;
  summary?: string;
  tagline?: string;
  contentRating?: string;
  rating?: number; // critic / Plex aggregate
  audienceRating?: number;
  userRating?: number;
  studio?: string;
  originallyAvailableAt?: string;
  addedAt?: number;
  updatedAt?: number;
  thumb?: string;
  art?: string;
  leafCount?: number;
  viewedLeafCount?: number;
  Genre?: PlexTag[];
  Director?: PlexTag[];
  Writer?: PlexTag[];
  Producer?: PlexTag[];
  Role?: PlexTag[];
  Country?: PlexTag[];
  Collection?: PlexTag[];
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
