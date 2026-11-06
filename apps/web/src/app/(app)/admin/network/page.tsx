'use client';

import { type NetworkSettings } from '@lifeline/schemas';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select } from '@lifeline/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function NetworkSettingsPage() {
  const { network, can } = useSession();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['network-settings', network.id],
    queryFn: () => api<NetworkSettings>(`/networks/${network.id}/settings`),
    enabled: can('network:configure'),
  });
  const save = useMutation({
    mutationFn: (settings: Omit<NetworkSettings, 'networkId'>) =>
      api<NetworkSettings>(`/networks/${network.id}/settings`, {
        method: 'PUT',
        body: settings,
      }),
    onSuccess: (settings) => {
      client.setQueryData(['network-settings', network.id], settings);
    },
  });
  const resetSave = save.reset;
  const [capacityMinutes, setCapacityMinutes] = useState<number | null>(null);
  const [vehicleMinutes, setVehicleMinutes] = useState<number | null>(null);
  const [score, setScore] = useState<NetworkSettings['earlyWarningScore'] | null>(null);
  useEffect(() => {
    setCapacityMinutes(null);
    setVehicleMinutes(null);
    setScore(null);
    resetSave();
  }, [network.id, resetSave]);

  if (!can('network:configure')) {
    return (
      <Alert tone="critical" title="You cannot configure this network">
        Ask a network administrator to make these changes.
      </Alert>
    );
  }

  const settings = query.data;
  return (
    <>
      <PageHeader
        title="Network configuration"
        description={`Capacity and vehicle freshness, and clinical scoring for ${network.name}.`}
      />
      {query.isError && (
        <Alert tone="critical" title="We couldn’t load network settings" className="mb-4">
          {query.error.message}
        </Alert>
      )}
      {save.isError && (
        <Alert tone="critical" title="Settings were not saved" className="mb-4">
          {save.error.message}
        </Alert>
      )}
      {save.isSuccess && <Alert tone="success" title="Settings saved" className="mb-4" />}
      <Card>
        <CardHeader
          title="Operational and clinical settings"
          description="Set when capacity and vehicle reports become stale. Clinical score changes require governance approval."
        />
        <CardBody>
          {query.isPending ? (
            <p className="text-sm text-slate">Loading settings…</p>
          ) : settings ? (
            <form
              className="max-w-2xl space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate({
                  capacityStaleAfterMinutes: capacityMinutes ?? settings.capacityStaleAfterMinutes,
                  vehicleStatusStaleAfterMinutes:
                    vehicleMinutes ?? settings.vehicleStatusStaleAfterMinutes,
                  earlyWarningScore: score ?? settings.earlyWarningScore,
                });
              }}
            >
              <Field label="Capacity report is stale after (minutes)">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    max={10_080}
                    value={capacityMinutes ?? settings.capacityStaleAfterMinutes}
                    onChange={(event) => setCapacityMinutes(Number(event.target.value))}
                  />
                )}
              </Field>
              <Field label="Vehicle availability is stale after (minutes)">
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    min={1}
                    max={10_080}
                    value={vehicleMinutes ?? settings.vehicleStatusStaleAfterMinutes}
                    onChange={(event) => setVehicleMinutes(Number(event.target.value))}
                  />
                )}
              </Field>
              <Field label="Early-warning score">
                {(props) => (
                  <Select
                    {...props}
                    value={score ?? settings.earlyWarningScore}
                    onChange={(event) =>
                      setScore(event.target.value as NetworkSettings['earlyWarningScore'])
                    }
                  >
                    <option value="NONE">Disabled</option>
                    <option value="MEWS">MEWS</option>
                    <option value="NEWS2">NEWS2</option>
                  </Select>
                )}
              </Field>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save network settings'}
              </Button>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </>
  );
}
