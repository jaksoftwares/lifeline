'use client';

import { type AttachmentView, type ReferralDetail } from '@lifeline/schemas';
import { Alert, Card, CardBody, CardHeader } from '@lifeline/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Paperclip } from 'lucide-react';
import { useRef } from 'react';
import { ApiError, apiUpload } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

function size(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function Attachments({
  referral,
  canUpload,
}: {
  referral: ReferralDetail;
  canUpload: boolean;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Checked here too so nobody waits for a large upload over a slow connection only to be refused.
      if (file.size > 10 * 1024 * 1024) throw new ApiError(413, 'Files must be 10 MB or smaller.');
      const form = new FormData();
      form.append('file', file);
      return apiUpload<AttachmentView>(`/referrals/${referral.id}/attachments`, form);
    },
    onSettled: () => {
      if (input.current) input.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['referral', referral.id] });
    },
  });

  return (
    <Card>
      <CardHeader
        title="Documents"
        description="Results, letters and images. PDF, JPEG or PNG up to 10 MB."
      />
      <CardBody className="space-y-3">
        {referral.attachments.length === 0 && (
          <p className="text-sm text-slate">No documents attached.</p>
        )}
        <ul className="space-y-2">
          {referral.attachments.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-slate" />
              <div className="min-w-0">
                <a
                  href={`/api/attachments/${a.id}`}
                  className="break-words font-medium text-teal-deep hover:underline"
                >
                  {a.fileName}
                </a>
                <p className="tabular text-xs text-slate">
                  {size(a.sizeBytes)} · {a.uploadedBy.fullName}, {a.uploadedByInstitution.name} ·{' '}
                  {formatDateTime(a.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {upload.isError && <Alert tone="critical" title={upload.error.message} />}
        {canUpload && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-border-strong px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-subtle focus-within:outline-2 focus-within:outline-teal-deep">
            <Paperclip aria-hidden className="size-4" />
            {upload.isPending ? 'Uploading…' : 'Attach a document'}
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
              }}
            />
          </label>
        )}
      </CardBody>
    </Card>
  );
}
