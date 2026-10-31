'use client';

import { type MembershipGrant, type Permission, permittedInstitutionIds } from '@lifeline/domain';
import { type CurrentUser } from '@lifeline/schemas';
import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { api } from './api';

export const ME_QUERY_KEY = ['me'] as const;

export function useMe() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: () => api<CurrentUser>('/auth/me') });
}

interface SessionValue {
  user: CurrentUser;
  networks: { id: string; name: string }[];
  network: { id: string; name: string };
  setNetworkId: (id: string) => void;
  /** Shapes navigation and forms only. The API decides what is actually allowed. */
  can: (permission: Permission) => boolean;
  /** Institutions in the active network where the permission applies; 'ALL' for network-wide roles. */
  scopeFor: (permission: Permission) => 'ALL' | string[];
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ user, children }: { user: CurrentUser; children: ReactNode }) {
  const networks = useMemo(() => {
    const byId = new Map(user.memberships.map((m) => [m.network.id, m.network]));
    return [...byId.values()];
  }, [user]);
  const [networkId, setNetworkId] = useState(() => networks[0]?.id ?? '');
  const network = networks.find((n) => n.id === networkId) ?? networks[0]!;

  const value = useMemo<SessionValue>(() => {
    const grants: MembershipGrant[] = user.memberships.map((m) => ({
      role: m.role,
      networkId: m.network.id,
      institutionId: m.institution?.id ?? null,
    }));
    const scopeFor = (permission: Permission) =>
      permittedInstitutionIds(grants, permission, network.id);
    const can = (permission: Permission) => {
      const scope = scopeFor(permission);
      return scope === 'ALL' || scope.length > 0;
    };
    return { user, networks, network, setNetworkId, can, scopeFor };
  }, [user, networks, network]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
