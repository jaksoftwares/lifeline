'use client';

import { DECLINE_REASON_LABELS } from '@lifeline/domain';
import { type RequestView } from '@lifeline/schemas';
import { Alert, Button, Card, cn, Input, Textarea } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { useState } from 'react';
import { RequestStatusChip } from '@/components/referral-chips';
import { api } from '@/lib/api';
import { formatDateTime, formatWhen } from '@/lib/format';

const KIND_LABEL = {
  INFO_REQUEST: 'Asked for information',
  INFO_RESPONSE: 'Answer',
  NOTE: null,
} as const;

/** One receiving facility: its answer and the conversation with the referring facility. */
export function RequestThread({
  referralId,
  request,
  canMessage,
  isReferrer,
  referringInstitutionId,
}: {
  referralId: string;
  request: RequestView;
  canMessage: boolean;
  isReferrer: boolean;
  referringInstitutionId: string;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['referral', referralId] });
    void queryClient.invalidateQueries({ queryKey: ['referrals'] });
  };

  const send = useMutation({
    mutationFn: () =>
      api(`/referral-requests/${request.id}/messages`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      setBody('');
      refresh();
    },
  });
  const withdraw = useMutation({
    mutationFn: () =>
      api(`/referral-requests/${request.id}/withdraw`, { method: 'POST', body: { reason } }),
    onSuccess: refresh,
  });

  const awaitingAnswer = isReferrer && request.status === 'INFO_REQUESTED';
  const open = request.status === 'PENDING' || request.status === 'INFO_REQUESTED';

  return (
    <Card className={cn(awaitingAnswer && 'border-info')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <p className="font-semibold text-navy">{request.institution.name}</p>
          <p className="tabular text-xs text-slate">Sent {formatDateTime(request.sentAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {request.institutionPhone && (
            <a
              href={`tel:${request.institutionPhone}`}
              className="inline-flex items-center gap-1 text-sm text-teal-deep hover:underline"
            >
              <Phone aria-hidden className="size-3.5" />
              <span className="tabular">{request.institutionPhone}</span>
            </a>
          )}
          <RequestStatusChip status={request.status} />
        </div>
      </div>

      <div className="space-y-3 px-5 py-4 text-sm">
        {request.status === 'ACCEPTED' && (
          <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3">
            <p className="font-semibold text-ink">
              Accepted by {request.respondedBy?.fullName} at{' '}
              {request.respondedAt && formatWhen(request.respondedAt)}
            </p>
            {request.receivingDepartment && (
              <p className="text-ink">
                Department: {request.receivingDepartment.name}
                {request.receivingDepartment.phone && (
                  <a
                    href={`tel:${request.receivingDepartment.phone}`}
                    className="tabular ml-2 text-teal-deep hover:underline"
                  >
                    {request.receivingDepartment.phone}
                  </a>
                )}
              </p>
            )}
            {request.readyAt && (
              <p className="tabular text-ink">Ready from {formatDateTime(request.readyAt)}</p>
            )}
            {request.responseNote && <p className="mt-1 text-slate">“{request.responseNote}”</p>}
          </div>
        )}
        {request.status === 'DECLINED' && (
          <p className="text-slate">
            Declined by {request.respondedBy?.fullName}
            {request.declineReason && `: ${DECLINE_REASON_LABELS[request.declineReason]}`}
            {request.responseNote && ` — “${request.responseNote}”`}
          </p>
        )}
        {request.status === 'WITHDRAWN' && (
          <p className="text-slate">
            Withdrawn{request.withdrawReason && `: ${request.withdrawReason}`}
          </p>
        )}

        {request.messages.length > 0 && (
          <ol className="space-y-2" aria-label={`Messages with ${request.institution.name}`}>
            {request.messages.map((m) => {
              const fromReferrer = m.institution.id === referringInstitutionId;
              return (
                <li
                  key={m.id}
                  className={cn(
                    'max-w-[90%] rounded-md px-3 py-2',
                    fromReferrer ? 'ml-auto bg-surface-blue' : 'bg-surface-subtle',
                    m.kind === 'INFO_REQUEST' && 'border border-info/40',
                  )}
                >
                  <p className="text-xs text-slate">
                    <span className="font-medium text-ink">{m.author.fullName}</span> ·{' '}
                    {m.institution.name} ·{' '}
                    <span className="tabular">{formatWhen(m.createdAt)}</span>
                    {KIND_LABEL[m.kind] && (
                      <span className="ml-1 font-medium text-info">· {KIND_LABEL[m.kind]}</span>
                    )}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink">{m.body}</p>
                </li>
              );
            })}
          </ol>
        )}

        {canMessage && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) send.mutate();
            }}
          >
            {awaitingAnswer && (
              <Alert tone="info" title={`${request.institution.name} needs more information`} />
            )}
            {send.isError && <Alert tone="critical" title={send.error.message} />}
            <label htmlFor={`msg-${request.id}`} className="sr-only">
              Message to {request.institution.name}
            </label>
            <Textarea
              id={`msg-${request.id}`}
              rows={2}
              placeholder={
                awaitingAnswer ? 'Answer their question…' : `Message ${request.institution.name}…`
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              variant={awaitingAnswer ? 'primary' : 'secondary'}
              disabled={!body.trim() || send.isPending}
            >
              {awaitingAnswer ? 'Send answer' : 'Send message'}
            </Button>
          </form>
        )}

        {isReferrer && open && (
          <div className="border-t border-border pt-3">
            {!withdrawing ? (
              <button
                type="button"
                className="text-sm text-slate hover:text-ink hover:underline"
                onClick={() => setWithdrawing(true)}
              >
                Withdraw this request
              </button>
            ) : (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  withdraw.mutate();
                }}
              >
                <label className="min-w-56 flex-1 text-[13px] font-medium text-ink">
                  Reason for withdrawing
                  <Input
                    className="mt-1"
                    required
                    minLength={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button type="submit" size="sm" variant="secondary" disabled={withdraw.isPending}>
                  Withdraw
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setWithdrawing(false)}>
                  Keep
                </Button>
                {withdraw.isError && (
                  <p className="w-full text-xs text-critical">{withdraw.error.message}</p>
                )}
              </form>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
