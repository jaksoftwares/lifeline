import { describe, expect, it } from 'vitest';
import { etaTarget, isTracked, locationFreshness, thinPath } from './tracking';

const now = new Date('2026-11-01T10:00:00Z');
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe('tracking', () => {
  it('tracks from dispatch until arrival', () => {
    expect(isTracked('AMBULANCE_ASSIGNED')).toBe(false);
    expect(isTracked('DISPATCHED')).toBe(true);
    expect(isTracked('INTERRUPTED')).toBe(true);
    expect(isTracked('ARRIVED')).toBe(false);
  });

  it('estimates arrival at the pickup, then at the destination', () => {
    expect(etaTarget('DISPATCHED')).toBe('PICKUP');
    expect(etaTarget('AT_PICKUP')).toBeNull();
    expect(etaTarget('IN_TRANSIT')).toBe('DESTINATION');
    expect(etaTarget('INTERRUPTED')).toBeNull();
  });

  it('labels positions by age', () => {
    expect(locationFreshness(ago(60), now)).toBe('LIVE');
    expect(locationFreshness(ago(5 * 60), now)).toBe('DELAYED');
    expect(locationFreshness(ago(20 * 60), now)).toBe('LOST');
  });

  it('thins a trail evenly, keeping both ends', () => {
    const trail = Array.from({ length: 1000 }, (_, i) => i);
    const thinned = thinPath(trail, 5);
    expect(thinned).toEqual([0, 250, 500, 749, 999]);
    expect(thinPath([1, 2, 3], 5)).toEqual([1, 2, 3]);
  });
});
