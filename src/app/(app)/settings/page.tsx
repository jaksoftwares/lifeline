import type { Metadata } from 'next';
import { ActionForm } from '@/components/form';
import { LocationField } from '@/components/location-field';
import { AddPersonForm, PeopleList } from '@/components/people';
import { Card, Field, Input, PageHeader, Select } from '@/components/ui';
import { requireMemberPage } from '@/lib/actions';
import { COUNTIES } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { saveOrganization } from './actions';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { organization: org, profile } = await requireMemberPage();
  const isAdmin = profile.role === 'admin';
  const isHospital = org.type === 'hospital';

  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', org.id)
    .neq('role', 'driver') // drivers are managed on the Fleet page
    .order('full_name');

  return (
    <>
      <PageHeader title="Settings" description={org.name} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">{isHospital ? 'Hospital' : 'Organization'} details</h2>
          {isAdmin ? (
            <ActionForm action={saveOrganization} submit="Save details">
              <Field label="Name">
                <Input name="name" defaultValue={org.name} required />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="County">
                  <Select name="county" defaultValue={org.county}>
                    {COUNTIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Phone">
                  <Input name="phone" type="tel" defaultValue={org.phone} required />
                </Field>
                <Field label="Address">
                  <Input name="address" defaultValue={org.address ?? ''} />
                </Field>
                {isHospital ? (
                  <Field label="Facility level">
                    <Select name="level" defaultValue={org.level ?? 4}>
                      {[2, 3, 4, 5, 6].map((l) => (
                        <option key={l} value={l}>
                          Level {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Fuel price (KES per litre)" hint="Used to cost every trip.">
                    <Input
                      name="fuel_price"
                      type="number"
                      step="0.01"
                      min={1}
                      defaultValue={org.fuel_price ?? ''}
                      required
                    />
                  </Field>
                )}
              </div>
              <LocationField
                defaultValue={
                  org.lat != null && org.lng != null ? { lat: org.lat, lng: org.lng } : null
                }
              />
            </ActionForm>
          ) : (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">County</dt>
                <dd>{org.county}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd>{org.phone}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Address</dt>
                <dd>{org.address ?? '—'}</dd>
              </div>
            </dl>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-semibold">Team</h2>
            <PeopleList
              people={(data as Profile[]) ?? []}
              currentUserId={profile.id}
              canManage={isAdmin}
            />
          </Card>
          {isAdmin && (
            <Card className="p-6">
              <h2 className="mb-4 font-semibold">Add a team member</h2>
              <AddPersonForm roles={['staff', 'admin']} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
