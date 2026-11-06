'use client';

import { type LiveEvent } from '@lifeline/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { api } from './api';

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

const LiveContext = createContext<LiveStatus>('connecting');

const MAX_BACKOFF_MS = 30_000;

/**
 * One Server-Sent Events connection per tab. Events only say what changed; the affected queries are
 * reloaded through the API, which applies the viewer's permissions. Lists still refresh on a timer,
 * so nothing is missed while the connection is down.
 */
export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stopped = false;

    const onTransfer = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as LiveEvent;
      void queryClient.invalidateQueries({ queryKey: ['transfer', event.transferId] });
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
      if (event.type === 'transfer') {
        void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
        void queryClient.invalidateQueries({ queryKey: ['referral'] });
        void queryClient.invalidateQueries({ queryKey: ['referrals'] });
      }
    };

    const connect = () => {
      source = new EventSource('/api/live');
      source.addEventListener('ready', () => {
        attempts = 0;
        setStatus('live');
      });
      source.addEventListener('transfer', onTransfer);
      source.addEventListener('position', onTransfer);
      source.onerror = () => {
        setStatus('reconnecting');
        // The browser retries dropped connections itself, but gives up on an error response such as
        // an expired session. Then renew the session through the API and open a new connection.
        if (source?.readyState !== EventSource.CLOSED || stopped) return;
        source.close();
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts++);
        retry = setTimeout(() => {
          void api('/auth/me')
            .catch(() => undefined)
            .finally(() => !stopped && connect());
        }, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [queryClient]);

  return <LiveContext.Provider value={status}>{children}</LiveContext.Provider>;
}

export function useLiveStatus(): LiveStatus {
  return useContext(LiveContext);
}
