import type { Metadata } from 'next';
import { ConfirmAction } from '@/components/confirm-action';
import { ActionForm } from '@/components/form';
import { AddPersonForm, PeopleList } from '@/components/people';
import { Card, Field, Input, PageHeader, Select } from '@/components/ui';
import { requireMemberPage } from '@/lib/actions';
import { AMBULANCE_TYPES, EQUIPMENT } from '@/lib/constants';
import { createClient } from '@/lib/supabase/server';
import type { Ambulance, Profile } from '@/lib/types';
import { addAmbulance, removeAmbulance } from './actions';
import { AmbulanceStatusToggle } from './ambulance-status';

export const metadata: Metadata = { title: 'Fleet & drivers' };

export default async function FleetPage() {
  const { organization, profile } = await requireMemberPage('ambulance_provider');
  const isAdmin = profile.role === 'admin';
  const supabase = await createClient();
  const [ambulances, drivers] = await Promise.all([
    supabase.from('ambulances').select('*').eq('provider_id', organization.id).order('plate'),
    supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', organization.id)
      .eq('role', 'driver')
      .order('full_name'),
  ]);
  const fleet = (ambulances.data as Ambulance[]) ?? [];
  const available = fleet.filter((a) => a.status === 'available').length;

  return (
    <>
      <PageHeader
        title="Fleet & drivers"
        description={`${fleet.length} ambulance${fleet.length === 1 ? '' : 's'}, ${available} available now.`}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <h2 className="px-6 pt-5 font-semibold">Ambulances</h2>
            {fleet.length ? (
              <ul className="mt-2 divide-y divide-slate-100">
                {fleet.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 px-5 py-3 sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{a.plate}</p>
                      <p className="text-sm text-slate-500">
                        {AMBULANCE_TYPES[a.type]} · {a.fuel_use} L/100 km
                      </p>
                      <p className="mt-1 text-xs capitalize text-slate-500">
                        {a.equipment.join(', ') || 'No equipment listed'}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <AmbulanceStatusToggle id={a.id} status={a.status} />
                      {isAdmin && a.status !== 'on_trip' && (
                        <ConfirmAction
                          action={removeAmbulance.bind(null, a.id)}
                          label="Remove"
                          confirm={`Remove ${a.plate}?`}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-4 text-sm text-slate-500">Add your first ambulance.</p>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold">Drivers</h2>
            <PeopleList
              people={(drivers.data as Profile[]) ?? []}
              currentUserId={profile.id}
              canManage={isAdmin}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Add ambulance</h2>
            <ActionForm action={addAmbulance} submit="Add ambulance" resetOnSuccess>
              <Field label="Number plate">
                <Input name="plate" placeholder="KDA 123A" required />
              </Field>
              <Field label="Type">
                <Select name="type" defaultValue="basic">
                  {Object.entries(AMBULANCE_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-slate-700">
                  Equipment on board
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {EQUIPMENT.map((item) => (
                    <label key={item} className="flex items-center gap-2 text-sm capitalize">
                      <input
                        type="checkbox"
                        name="equipment[]"
                        value={item}
                        className="accent-brand-600"
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Fuel use (litres per 100 km)">
                <Input
                  name="fuel_use"
                  type="number"
                  step="0.1"
                  min={1}
                  defaultValue={15}
                  required
                />
              </Field>
            </ActionForm>
          </Card>

          {isAdmin && (
            <Card className="p-6">
              <h2 className="mb-4 font-semibold">Add driver</h2>
              <AddPersonForm roles={['driver']} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
