import type { Metadata } from 'next';
import { ActionForm } from '@/components/form';
import { Card, Input, PageHeader } from '@/components/ui';
import { requireMemberPage } from '@/lib/actions';
import { SERVICES } from '@/lib/constants';
import { timeAgo } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { HospitalCapacity, Service } from '@/lib/types';
import { saveCapacity } from './actions';

export const metadata: Metadata = { title: 'Beds & services' };

export default async function CapacityPage() {
  const { organization } = await requireMemberPage('hospital');
  const supabase = await createClient();
  const { data } = await supabase
    .from('hospital_capacity')
    .select('*')
    .eq('hospital_id', organization.id);
  const rows = new Map((data as HospitalCapacity[] | null)?.map((r) => [r.service, r]));
  const lastUpdate = [...rows.values()]
    .map((r) => r.updated_at)
    .sort()
    .at(-1);

  return (
    <>
      <PageHeader
        title="Beds & services"
        description={lastUpdate ? `Updated ${timeAgo(lastUpdate)}` : 'Not set yet'}
      />
      <Card className="max-w-2xl p-6">
        <ActionForm action={saveCapacity} submit="Save beds">
          <p className="text-sm text-slate-600">Beds available now. Leave empty if not offered.</p>
          <div className="divide-y divide-slate-100">
            {(Object.entries(SERVICES) as [Service, string][]).map(([service, label]) => (
              <label key={service} className="flex items-center justify-between gap-4 py-2.5">
                <span className="font-medium">{label}</span>
                <Input
                  name={service}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={9999}
                  placeholder="—"
                  defaultValue={rows.get(service)?.beds_available ?? ''}
                  className="w-24 text-right"
                />
              </label>
            ))}
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
