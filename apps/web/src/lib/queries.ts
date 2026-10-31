'use client';

import { type InstitutionSummary } from '@lifeline/schemas';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function useInstitutions(networkId: string) {
  return useQuery({
    queryKey: ['institutions', networkId],
    queryFn: () => api<InstitutionSummary[]>(`/networks/${networkId}/institutions`),
  });
}
