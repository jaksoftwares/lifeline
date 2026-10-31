'use client';

import {
  type CatalogueResponse,
  type FacilityDetail,
  type FacilitySearchResult,
  type InstitutionSummary,
} from '@lifeline/schemas';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './api';

export function useInstitutions(networkId: string) {
  return useQuery({
    queryKey: ['institutions', networkId],
    queryFn: () => api<InstitutionSummary[]>(`/networks/${networkId}/institutions`),
  });
}

export function useCatalogue(networkId: string) {
  return useQuery({
    queryKey: ['catalogue', networkId],
    queryFn: () => api<CatalogueResponse>(`/networks/${networkId}/catalogue`),
    staleTime: 5 * 60_000,
  });
}

export function useFacilitySearch(
  networkId: string,
  filters: { serviceIds: string[]; resourceIds: string[]; originId?: string },
) {
  return useQuery({
    queryKey: ['facility-search', networkId, filters],
    queryFn: () =>
      api<FacilitySearchResult[]>(`/networks/${networkId}/facilities`, {
        query: {
          serviceIds: filters.serviceIds.join(','),
          resourceIds: filters.resourceIds.join(','),
          originId: filters.originId,
        },
      }),
    placeholderData: keepPreviousData,
    // Capacity changes during a shift; keep results fresh while the page is open.
    refetchInterval: 60_000,
  });
}

export function useFacility(institutionId: string) {
  return useQuery({
    queryKey: ['facility', institutionId],
    queryFn: () => api<FacilityDetail>(`/institutions/${institutionId}`),
    refetchInterval: 60_000,
  });
}
