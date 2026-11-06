-- Afyaline: initial schema.
--
-- Six tables: organizations, profiles, hospital_capacity, ambulances, transfers, transfer_events.
--
-- Access model ("the browser reads, the server writes"):
--   * Signed-in users READ through Row Level Security policies below.
--   * All WRITES go through Next.js server actions that check the business rules and use the
--     service-role key. Users therefore get no insert/update/delete policies at all.

-- ---------------------------------------------------------------------------
-- Organizations: hospitals and ambulance providers
-- ---------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('hospital', 'ambulance_provider')),
  name          text not null check (length(trim(name)) > 1),
  county        text not null,
  address       text,
  phone         text not null,
  email         text,
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  -- Hospitals: Kenya facility level (2 = dispensary … 6 = national referral).
  level         smallint check (level between 2 and 6),
  -- Ambulance providers: fuel price used to cost every trip (KES per litre).
  fuel_price    numeric(8, 2) check (fuel_price >= 0),
  -- Demo mode verifies automatically. Set the default to false to require manual approval.
  verified      boolean not null default true,
  created_at    timestamptz not null default now()
);

create index organizations_type_idx on public.organizations (type);

-- ---------------------------------------------------------------------------
-- Profiles: one per Supabase Auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  organization_id    uuid references public.organizations (id) on delete cascade,
  full_name          text not null,
  phone              text,
  role               text not null default 'staff' check (role in ('admin', 'staff', 'driver')),
  license_number     text,
  is_platform_admin  boolean not null default false,
  created_at         timestamptz not null default now()
);

create index profiles_organization_idx on public.profiles (organization_id);

-- ---------------------------------------------------------------------------
-- Hospital capacity: beds available per service, updated by the hospital
-- ---------------------------------------------------------------------------
create table public.hospital_capacity (
  hospital_id     uuid not null references public.organizations (id) on delete cascade,
  service         text not null check (service in (
                    'emergency', 'general', 'icu', 'hdu', 'maternity', 'nicu',
                    'paediatrics', 'theatre', 'burns', 'dialysis')),
  beds_available  integer not null default 0 check (beds_available >= 0),
  updated_at      timestamptz not null default now(),
  primary key (hospital_id, service)
);

-- ---------------------------------------------------------------------------
-- Ambulances
-- ---------------------------------------------------------------------------
create table public.ambulances (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.organizations (id) on delete cascade,
  plate         text not null unique,
  type          text not null check (type in ('basic', 'advanced', 'critical_care')),
  -- e.g. {oxygen, monitor, defibrillator, ventilator, incubator, suction, stretcher}
  equipment     text[] not null default '{}',
  fuel_use      numeric(5, 2) not null default 15 check (fuel_use > 0), -- litres per 100 km
  status        text not null default 'available' check (status in ('available', 'on_trip', 'offline')),
  lat           double precision,
  lng           double precision,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index ambulances_provider_idx on public.ambulances (provider_id);

-- ---------------------------------------------------------------------------
-- Transfers: one row per patient move. The heart of Afyaline.
-- ---------------------------------------------------------------------------
create sequence public.transfer_code_seq;

create table public.transfers (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null unique
                           default 'AFY-' || lpad(nextval('public.transfer_code_seq')::text, 5, '0'),

  sending_hospital_id    uuid not null references public.organizations (id),
  receiving_hospital_id  uuid not null references public.organizations (id),
  created_by             uuid references public.profiles (id) on delete set null,

  -- Patient brief
  patient_name           text not null,
  patient_age            smallint check (patient_age between 0 and 130), -- years; 0 = under one year
  patient_sex            text check (patient_sex in ('female', 'male')),
  condition_summary      text not null,
  history                text,
  vitals                 text,
  urgency                text not null check (urgency in ('critical', 'urgent', 'stable')),
  service_needed         text not null check (service_needed in (
                           'emergency', 'general', 'icu', 'hdu', 'maternity', 'nicu',
                           'paediatrics', 'theatre', 'burns', 'dialysis')),

  status                 text not null default 'requested' check (status in (
                           'requested', 'declined', 'accepted', 'ambulance_assigned',
                           'en_route_to_pickup', 'patient_onboard', 'arrived',
                           'handed_over', 'cancelled')),
  decline_reason         text,
  cancel_reason          text,

  -- Transport. provider_id is set when the sending hospital requests an ambulance; the
  -- provider then confirms by assigning a driver (status -> ambulance_assigned).
  provider_id            uuid references public.organizations (id),
  ambulance_id           uuid references public.ambulances (id),
  driver_id              uuid references public.profiles (id) on delete set null,

  -- Route (OSRM estimate at assignment) and costs (KES)
  route_distance_km      numeric(8, 2),
  route_duration_min     numeric(8, 1),
  fuel_cost              numeric(10, 2),
  consumables_cost       numeric(10, 2),
  other_cost             numeric(10, 2),
  total_cost             numeric(10, 2) generated always as
                           (coalesce(fuel_cost, 0) + coalesce(consumables_cost, 0) + coalesce(other_cost, 0)) stored,

  -- Handover (confirmed by the receiving hospital)
  handover_received_by   text,
  handover_condition     text check (handover_condition in ('improved', 'stable', 'deteriorated', 'deceased')),
  handover_notes         text,

  -- One timestamp per step. Every duration in the reports comes from these.
  requested_at           timestamptz not null default now(),
  responded_at           timestamptz, -- accepted or declined
  ambulance_requested_at timestamptz,
  assigned_at            timestamptz,
  departed_at            timestamptz, -- en route to pickup
  picked_up_at           timestamptz, -- patient onboard
  arrived_at             timestamptz,
  handed_over_at         timestamptz,
  cancelled_at           timestamptz,
  updated_at             timestamptz not null default now(),

  check (sending_hospital_id <> receiving_hospital_id)
);

create index transfers_sending_idx   on public.transfers (sending_hospital_id, requested_at desc);
create index transfers_receiving_idx on public.transfers (receiving_hospital_id, requested_at desc);
create index transfers_provider_idx  on public.transfers (provider_id, requested_at desc);
create index transfers_driver_idx    on public.transfers (driver_id);
create index transfers_status_idx    on public.transfers (status);

-- ---------------------------------------------------------------------------
-- Transfer events: the timeline and audit trail
-- ---------------------------------------------------------------------------
create table public.transfer_events (
  id               bigint generated always as identity primary key,
  transfer_id      uuid not null references public.transfers (id) on delete cascade,
  status           text not null,
  actor_id         uuid references public.profiles (id) on delete set null,
  organization_id  uuid references public.organizations (id) on delete set null,
  note             text,
  created_at       timestamptz not null default now()
);

create index transfer_events_transfer_idx on public.transfer_events (transfer_id, created_at);

-- ---------------------------------------------------------------------------
-- Keep transfers.updated_at current
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger transfers_touch before update on public.transfers
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (read access only; see the header comment)
-- ---------------------------------------------------------------------------
-- Helpers run as the table owner so policies can look up the caller without recursion.
create function public.my_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.organizations     enable row level security;
alter table public.profiles          enable row level security;
alter table public.hospital_capacity enable row level security;
alter table public.ambulances        enable row level security;
alter table public.transfers         enable row level security;
alter table public.transfer_events   enable row level security;

-- The network directory, bed availability and ambulance availability are visible to every
-- signed-in user: they are needed to choose a hospital or an ambulance.
create policy "signed-in users read organizations" on public.organizations
  for select to authenticated using (true);

create policy "signed-in users read capacity" on public.hospital_capacity
  for select to authenticated using (true);

create policy "signed-in users read ambulances" on public.ambulances
  for select to authenticated using (true);

-- A transfer is visible only to the hospitals and the provider involved.
create policy "parties read their transfers" on public.transfers
  for select to authenticated using (
    public.is_platform_admin()
    or public.my_org_id() in (sending_hospital_id, receiving_hospital_id, provider_id)
  );

create policy "parties read their transfer events" on public.transfer_events
  for select to authenticated using (
    exists (select 1 from public.transfers t where t.id = transfer_id)
  );

-- People: yourself, your colleagues, and the people on transfers you are part of
-- (so both hospitals can see who the driver is and how to call them).
create policy "read colleagues and transfer contacts" on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or organization_id = public.my_org_id()
    or public.is_platform_admin()
    or exists (
      select 1 from public.transfers t
      where t.driver_id = profiles.id or t.created_by = profiles.id
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime: live status, timeline and ambulance positions
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.transfers, public.transfer_events, public.ambulances;
