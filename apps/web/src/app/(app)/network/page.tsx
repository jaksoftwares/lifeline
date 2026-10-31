'use client';

import { cn } from '@lifeline/ui';
import { useState } from 'react';
import { PageHeader } from '@/components/app-shell';
import { Directory } from './directory';
import { FacilitySearch } from './facility-search';

const TABS = [
  { id: 'find', label: 'Find a facility' },
  { id: 'directory', label: 'Directory' },
] as const;

export default function NetworkPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('find');

  return (
    <>
      <PageHeader
        title="Facility network"
        description="Find a receiving facility by the services and capacity a patient needs, or browse every participating institution."
      />
      <div
        role="tablist"
        aria-label="Facility network views"
        className="mb-6 flex gap-1 border-b border-border"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.id
                ? 'border-teal-deep text-navy'
                : 'border-transparent text-slate hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'find' ? <FacilitySearch /> : <Directory />}
      </div>
    </>
  );
}
