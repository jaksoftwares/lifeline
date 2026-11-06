'use client';

import { type TransferDetail } from '@lifeline/schemas';
import { useQueryClient } from '@tanstack/react-query';

/** Refreshes every view that reflects a transfer change. */
export function useTransferInvalidation(transfer: Pick<TransferDetail, 'id' | 'referral'>) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['transfer', transfer.id] });
    void queryClient.invalidateQueries({ queryKey: ['transfer-suggestions', transfer.id] });
    void queryClient.invalidateQueries({ queryKey: ['transfers'] });
    void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    void queryClient.invalidateQueries({ queryKey: ['crew'] });
    void queryClient.invalidateQueries({ queryKey: ['referral', transfer.referral.id] });
    void queryClient.invalidateQueries({ queryKey: ['referrals'] });
  };
}
