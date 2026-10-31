'use client';

import { RESOURCE_KIND_LABELS, type ResourceKind } from '@lifeline/domain';
import { type FacilitySearchResult, type ServiceView } from '@lifeline/schemas';
import { Alert, Button, Card, cn, EmptyState, Loading, Select } from '@lifeline/ui';
import { Car, List, Map as MapIcon, Phone, SearchX } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CapacityGrid, Freshness, latestUpdate } from '@/components/capacity';
import { formatMinutes } from '@/lib/format';
import { useCatalogue, useFacilitySearch, useInstitutions } from '@/lib/queries';
import { useSession } from '@/lib/session';

const FacilityMap = dynamic(() => import('@/components/facility-map'), {
  ssr: false,
  loading: () => <Loading label="Loading map…" />,
});

export function FacilitySearch() {
  const { network, user } = useSession();
  const catalogue = useCatalogue(network.id);
  const institutions = useInstitutions(network.id);

  const facilities = (institutions.data ?? []).filter(
    (i) => i.type === 'FACILITY' && i.status === 'ACTIVE',
  );
  const ownFacilityId = user.memberships.find(
    (m) => m.network.id === network.id && m.institution?.type === 'FACILITY',
  )?.institution?.id;

  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [originChoice, setOriginChoice] = useState<string | undefined>(undefined);
  const originId = originChoice ?? ownFacilityId ?? '';
  const [view, setView] = useState<'list' | 'map'>('list');

  const results = useFacilitySearch(network.id, {
    serviceIds,
    resourceIds,
    originId: originId || undefined,
  });

  const servicesByCategory = useMemo(() => {
    const groups = new Map<string, ServiceView[]>();
    for (const s of catalogue.data?.services ?? [])
      groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
    return [...groups.entries()];
  }, [catalogue.data]);
  const bedResources = (catalogue.data?.resources ?? []).filter((r) => r.kind === 'BED');
  const otherResources = (catalogue.data?.resources ?? []).filter((r) => r.kind !== 'BED');
  const origin = facilities.find((f) => f.id === originId);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
      <Card className="h-fit">
        <form
          className="space-y-5 p-5"
          onSubmit={(e) => e.preventDefault()}
          aria-label="Search filters"
        >
          <div className="space-y-1.5">
            <label htmlFor="origin" className="block text-[13px] font-medium text-ink">
              Patient is at
            </label>
            <Select id="origin" value={originId} onChange={(e) => setOriginChoice(e.target.value)}>
              <option value="">No starting point (sort by name)</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </div>

          <fieldset>
            <legend className="text-[13px] font-medium text-ink">Services needed</legend>
            <p className="text-xs text-slate">Facilities must offer all selected services.</p>
            {servicesByCategory.map(([category, services]) => (
              <div key={category} className="mt-3">
                <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
                  {category}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {services.map((s) => (
                    <ToggleChip
                      key={s.id}
                      label={s.name}
                      pressed={serviceIds.includes(s.id)}
                      onClick={() => toggle(serviceIds, setServiceIds, s.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset>
            <legend className="text-[13px] font-medium text-ink">Must currently have</legend>
            <p className="text-xs text-slate">
              Hides facilities whose latest report says unavailable. Old or missing reports stay
              listed and are flagged.
            </p>
            {(
              [
                ['BED', bedResources],
                ['OTHER', otherResources],
              ] as const
            ).map(([group, resources]) => (
              <div key={group} className="mt-3">
                <p className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">
                  {group === 'BED'
                    ? RESOURCE_KIND_LABELS.BED
                    : `${RESOURCE_KIND_LABELS.EQUIPMENT} and specialists`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {resources.map((r) => (
                    <ToggleChip
                      key={r.id}
                      label={r.name}
                      pressed={resourceIds.includes(r.id)}
                      onClick={() => toggle(resourceIds, setResourceIds, r.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          {(serviceIds.length > 0 || resourceIds.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setServiceIds([]);
                setResourceIds([]);
              }}
            >
              Clear filters
            </Button>
          )}
        </form>
      </Card>

      <section aria-live="polite" aria-busy={results.isFetching}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate">
            {results.data
              ? `${results.data.length} ${results.data.length === 1 ? 'facility' : 'facilities'}${origin ? `, nearest to ${origin.name} first` : ''}`
              : ' '}
          </p>
          <div
            className="inline-flex rounded-sm border border-border-strong bg-surface p-0.5"
            role="group"
            aria-label="View"
          >
            {(
              [
                ['list', 'List', List],
                ['map', 'Map', MapIcon],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[4px] px-3 py-1 text-sm',
                  view === value ? 'bg-navy text-white' : 'text-slate hover:text-ink',
                )}
              >
                <Icon aria-hidden className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {results.isPending && <Loading label="Finding facilities…" />}
        {results.isError && (
          <Alert tone="critical" title="We couldn’t search facilities">
            {results.error.message}
          </Alert>
        )}
        {results.data?.length === 0 && (
          <Card>
            <EmptyState
              icon={SearchX}
              title="No facility in this network matches all of these needs."
            >
              Try removing a filter, or contact network operations for help finding a receiving
              facility.
            </EmptyState>
          </Card>
        )}

        {results.data && results.data.length > 0 && view === 'map' && (
          <Card>
            <FacilityMap
              points={[
                ...(origin?.latitude != null && origin.longitude != null
                  ? [
                      {
                        id: origin.id,
                        name: origin.name,
                        latitude: origin.latitude,
                        longitude: origin.longitude,
                        isOrigin: true,
                      },
                    ]
                  : []),
                ...results.data
                  .filter((r) => r.facility.latitude != null && r.facility.longitude != null)
                  .map((r) => ({
                    id: r.facility.id,
                    name: r.facility.name,
                    latitude: r.facility.latitude!,
                    longitude: r.facility.longitude!,
                    detail:
                      r.travelMinutes != null
                        ? `About ${formatMinutes(r.travelMinutes)} by road (estimate)`
                        : undefined,
                  })),
              ]}
            />
          </Card>
        )}

        {results.data && results.data.length > 0 && view === 'list' && (
          <ul className="space-y-4">
            {results.data.map((result) => (
              <ResultCard key={result.facility.id} result={result} highlight={resourceIds} />
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-slate">
          Travel times are estimates from straight-line distance and assume typical road speeds.
          Capacity is as reported by each facility; always confirm with the receiving facility
          before the patient moves.
        </p>
      </section>
    </div>
  );
}

function ToggleChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors',
        pressed
          ? 'border-teal-deep bg-teal-soft text-teal-deep'
          : 'border-border-strong bg-surface text-slate hover:border-teal-deep hover:text-ink',
      )}
    >
      {label}
    </button>
  );
}

function ResultCard({ result, highlight }: { result: FacilitySearchResult; highlight: string[] }) {
  const { facility, capacity, travelMinutes, distanceKm, unconfirmedResourceIds } = result;
  const latest = latestUpdate(capacity);
  const kinds: ResourceKind[] = ['BED', 'EQUIPMENT', 'SPECIALIST'];
  const ordered = kinds.flatMap((k) => capacity.filter((c) => c.resource.kind === k));

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              <Link href={`/network/${facility.id}`} className="hover:underline">
                {facility.name}
              </Link>
            </h2>
            <p className="text-sm text-slate">
              {facility.level ? `Level ${facility.level}` : ''}
              {facility.county ? ` · ${facility.county}` : ''}
            </p>
          </div>
          <div className="text-right">
            {travelMinutes != null ? (
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                <Car aria-hidden className="size-4 text-slate" />
                <span className="tabular">≈ {formatMinutes(travelMinutes)}</span>
                <span className="font-normal text-slate">by road (estimate)</span>
              </p>
            ) : (
              <p className="text-sm text-slate">No travel estimate</p>
            )}
            {distanceKm != null && (
              <p className="tabular text-xs text-slate">{distanceKm} km straight line</p>
            )}
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          {unconfirmedResourceIds.length > 0 && (
            <Alert tone="warning" title="Some of what you need isn’t confirmed">
              The latest report is missing or out of date for{' '}
              {capacity
                .filter((c) => unconfirmedResourceIds.includes(c.resource.id))
                .map((c) => c.resource.name.toLowerCase())
                .join(', ')}
              . Call the facility to check.
            </Alert>
          )}
          <CapacityGrid capacity={ordered} highlight={highlight} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            {latest ? (
              <Freshness entry={latest} />
            ) : (
              <span className="text-xs text-muted">No capacity reported</span>
            )}
            {facility.phone && (
              <a
                href={`tel:${facility.phone}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-deep hover:underline"
              >
                <Phone aria-hidden className="size-4" />
                <span className="tabular">{facility.phone}</span>
              </a>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
