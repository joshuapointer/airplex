import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeLong } from '@/components/player/formatTime';

describe('formatTime', () => {
  it('handles invalid input', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
  });

  it('formats sub-hour durations as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(59)).toBe('0:59');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(125)).toBe('2:05');
  });

  it('formats hour+ durations as h:mm:ss', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(7325)).toBe('2:02:05');
  });

  it('floors fractional seconds', () => {
    expect(formatTime(59.9)).toBe('0:59');
    expect(formatTime(60.5)).toBe('1:00');
  });
});

describe('formatTimeLong', () => {
  it('handles invalid input', () => {
    expect(formatTimeLong(NaN)).toBe('0 seconds');
    expect(formatTimeLong(-1)).toBe('0 seconds');
  });

  it('pluralizes units correctly', () => {
    expect(formatTimeLong(0)).toBe('0 seconds');
    expect(formatTimeLong(1)).toBe('1 second');
    expect(formatTimeLong(60)).toBe('1 minute');
    expect(formatTimeLong(61)).toBe('1 minute 1 second');
    expect(formatTimeLong(3600)).toBe('1 hour');
    expect(formatTimeLong(3661)).toBe('1 hour 1 minute 1 second');
    expect(formatTimeLong(7200)).toBe('2 hours');
  });

  it('skips zero intermediate units when higher units present', () => {
    expect(formatTimeLong(3605)).toBe('1 hour 5 seconds');
  });
});
