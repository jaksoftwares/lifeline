import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig } from '../config/app-config';
import { RoutingService } from './routing.service';

const from = { latitude: -1.005, longitude: 36.903 };
const to = { latitude: -1.518, longitude: 37.264 };
const service = (osrm?: string) =>
  new RoutingService({ env: { OSRM_URL: osrm } } as unknown as AppConfig);

afterEach(() => vi.unstubAllGlobals());

describe('RoutingService', () => {
  it('estimates from straight-line distance when no routing server is configured', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = await service().driveTime(from, to);
    expect(result.source).toBe('ESTIMATE');
    expect(result.minutes).toBeGreaterThan(60);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses road times from OSRM, and caches them', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ code: 'Ok', routes: [{ duration: 5400 }] })),
      );
    vi.stubGlobal('fetch', fetch);
    const routing = service('https://osrm.test');
    expect(await routing.driveTime(from, to)).toEqual({ minutes: 90, source: 'ROAD' });
    expect(fetch.mock.calls[0]![0]).toBe(
      'https://osrm.test/route/v1/driving/36.903,-1.005;37.264,-1.518?overview=false',
    );
    await routing.driveTime(from, to);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the estimate when OSRM fails, so tracking never stops', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect((await service('https://osrm.test').driveTime(from, to)).source).toBe('ESTIMATE');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'NoRoute' }))),
    );
    expect((await service('https://osrm.test').driveTime(from, to)).source).toBe('ESTIMATE');
  });
});
