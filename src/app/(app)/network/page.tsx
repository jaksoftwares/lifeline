import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge, Card, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import type { Organization } from '@/lib/types';

export const metadata: Metadata = { title: 'Network' };

/** Platform admin: every registered hospital and ambulance provider. */
export default async function NetworkPage() {
  const { profile } = await requireUser();
  if (!profile.is_platform_admin) redirect('/dashboard');

  const supabase = await createClient();
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });
  const orgs = (data as Organization[]) ?? [];
  const hospitals = orgs.filter((o) => o.type === 'hospital').length;

  return (
    <>
      <PageHeader
        title="Network"
        description={`${hospitals} hospitals and ${orgs.length - hospitals} ambulance providers.`}
      />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Organization</th>
              <th className="px-6 py-3 font-medium">Type</th>
              <th className="px-6 py-3 font-medium">County</th>
              <th className="px-6 py-3 font-medium">Phone</th>
              <th className="px-6 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map((o) => (
              <tr key={o.id}>
                <td className="px-6 py-3 font-medium">{o.name}</td>
                <td className="px-6 py-3">
                  {o.type === 'hospital' ? (
                    <Badge tone="brand">Hospital{o.level ? ` · L${o.level}` : ''}</Badge>
                  ) : (
                    <Badge tone="blue">Ambulance provider</Badge>
                  )}
                </td>
                <td className="px-6 py-3">{o.county}</td>
                <td className="px-6 py-3">{o.phone}</td>
                <td className="px-6 py-3 text-slate-500">{dateTime(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
