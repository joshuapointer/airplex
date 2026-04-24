import { describe, it, expect } from 'vitest';

import { isDescendantOfShow } from '@/lib/scope-guard';
import type { PlexMetadata } from '@/types/plex';

function m(over: Partial<PlexMetadata>): PlexMetadata {
  return {
    ratingKey: '1',
    type: 'episode',
    title: 'x',
    ...over,
  };
}

describe('isDescendantOfShow', () => {
  it('accepts the show root itself', () => {
    expect(isDescendantOfShow(m({ ratingKey: 'show-1', type: 'show' }), 'show-1')).toBe(true);
  });

  it('accepts an episode whose grandparent is the show', () => {
    expect(
      isDescendantOfShow(
        m({ ratingKey: 'ep-1', type: 'episode', grandparentRatingKey: 'show-1' }),
        'show-1',
      ),
    ).toBe(true);
  });

  it('accepts a season whose parent is the show', () => {
    expect(
      isDescendantOfShow(
        m({ ratingKey: 'season-1', type: 'season', parentRatingKey: 'show-1' }),
        'show-1',
      ),
    ).toBe(true);
  });

  it('rejects an episode from a DIFFERENT show', () => {
    expect(
      isDescendantOfShow(
        m({ ratingKey: 'ep-X', type: 'episode', grandparentRatingKey: 'show-OTHER' }),
        'show-1',
      ),
    ).toBe(false);
  });

  it('rejects a season from a DIFFERENT show', () => {
    expect(
      isDescendantOfShow(
        m({ ratingKey: 'season-X', type: 'season', parentRatingKey: 'show-OTHER' }),
        'show-1',
      ),
    ).toBe(false);
  });

  it('rejects a movie even if its ratingKey matches a lookup by coincidence', () => {
    // Movies have no parent/grandparent pointers — must not satisfy the guard
    // unless the share root itself is a movie with an exact ratingKey match.
    expect(isDescendantOfShow(m({ ratingKey: 'movie-7', type: 'movie' }), 'show-1')).toBe(false);
  });

  it('rejects an episode with undefined grandparentRatingKey', () => {
    expect(isDescendantOfShow(m({ ratingKey: 'ep-orphan', type: 'episode' }), 'show-1')).toBe(
      false,
    );
  });
});
