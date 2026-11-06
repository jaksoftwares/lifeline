// Demo data for Afyaline: hospitals, ambulance providers, people, ambulances and a month of
// transfers, so every dashboard has something real to show.
//
// Safe to re-run: it first removes previous demo data (everything using @afyaline.example).
// Run with: pnpm db:seed   (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const DOMAIN = 'afyaline.example';
const PASSWORD = 'Afyaline#2026';

function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

// ---------------------------------------------------------------------------
// 1. Remove previous demo data
// ---------------------------------------------------------------------------
async function reset() {
  const orgs = check(
    await db.from('organizations').select('id').like('email', `%@${DOMAIN}`),
    'list demo organizations',
  );
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const list = `(${ids.join(',')})`;
    check(
      await db
        .from('transfers')
        .delete()
        .or(
          `sending_hospital_id.in.${list},receiving_hospital_id.in.${list},provider_id.in.${list}`,
        ),
      'delete demo transfers',
    );
    check(await db.from('organizations').delete().in('id', ids), 'delete demo organizations');
  }
  for (let page = 1; ; page++) {
    const { users } = check(await db.auth.admin.listUsers({ page, perPage: 1000 }), 'list users');
    for (const user of users) {
      if (user.email?.endsWith(`@${DOMAIN}`)) {
        check(await db.auth.admin.deleteUser(user.id), `delete ${user.email}`);
      }
    }
    if (users.length < 1000) break;
  }
}

// ---------------------------------------------------------------------------
// 2. Organizations (fictional names, real county locations)
// ---------------------------------------------------------------------------
const HOSPITALS = [
  {
    key: 'metro',
    name: 'Nairobi Metropolitan Referral Hospital',
    county: 'Nairobi',
    level: 6,
    lat: -1.3005,
    lng: 36.8069,
    address: 'Hospital Road, Upper Hill',
    beds: {
      emergency: 6,
      general: 24,
      icu: 3,
      hdu: 4,
      maternity: 10,
      nicu: 2,
      paediatrics: 8,
      theatre: 2,
      burns: 2,
      dialysis: 3,
    },
  },
  {
    key: 'kiambu',
    name: 'Kiambu Valley Hospital',
    county: 'Kiambu',
    level: 5,
    lat: -1.1714,
    lng: 36.8356,
    address: 'Kiambu Town',
    beds: {
      emergency: 3,
      general: 12,
      icu: 1,
      hdu: 2,
      maternity: 6,
      nicu: 1,
      paediatrics: 4,
      theatre: 1,
    },
  },
  {
    key: 'thika',
    name: 'Thika Junction Hospital',
    county: 'Kiambu',
    level: 5,
    lat: -1.0388,
    lng: 37.0834,
    address: 'General Kago Road, Thika',
    beds: {
      emergency: 4,
      general: 15,
      icu: 0,
      hdu: 1,
      maternity: 8,
      nicu: 0,
      paediatrics: 5,
      theatre: 1,
      dialysis: 2,
    },
  },
  {
    key: 'machakos',
    name: 'Machakos Hills Hospital',
    county: 'Machakos',
    level: 5,
    lat: -1.5177,
    lng: 37.2634,
    address: 'Machakos Town',
    beds: {
      emergency: 3,
      general: 10,
      icu: 1,
      hdu: 1,
      maternity: 5,
      nicu: 1,
      paediatrics: 3,
      theatre: 1,
    },
  },
  {
    key: 'ruiru',
    name: 'Ruiru Community Hospital',
    county: 'Kiambu',
    level: 4,
    lat: -1.146,
    lng: 36.9606,
    address: 'Ruiru Town',
    beds: { emergency: 2, general: 8, maternity: 4, paediatrics: 2 },
  },
  {
    key: 'kajiado',
    name: 'Kajiado Plains Hospital',
    county: 'Kajiado',
    level: 4,
    lat: -1.8524,
    lng: 36.7768,
    address: 'Kajiado Town',
    beds: { emergency: 2, general: 6, maternity: 3 },
  },
];

const PROVIDERS = [
  {
    key: 'rapid',
    name: 'Rapid Response Ambulance Services',
    county: 'Nairobi',
    lat: -1.2921,
    lng: 36.8219,
    fuel_price: 182,
  },
  {
    key: 'county',
    name: 'Kiambu County Emergency Fleet',
    county: 'Kiambu',
    lat: -1.1725,
    lng: 36.83,
    fuel_price: 180,
  },
];

const AMBULANCES = [
  {
    provider: 'rapid',
    plate: 'KDA 101A',
    type: 'critical_care',
    equipment: ['oxygen', 'monitor', 'defibrillator', 'ventilator', 'suction', 'stretcher'],
    fuel_use: 18,
  },
  {
    provider: 'rapid',
    plate: 'KDB 214C',
    type: 'advanced',
    equipment: ['oxygen', 'monitor', 'defibrillator', 'suction', 'stretcher'],
    fuel_use: 16,
  },
  {
    provider: 'rapid',
    plate: 'KDC 330K',
    type: 'advanced',
    equipment: ['oxygen', 'monitor', 'incubator', 'stretcher'],
    fuel_use: 16,
  },
  {
    provider: 'county',
    plate: 'GKB 412M',
    type: 'basic',
    equipment: ['oxygen', 'stretcher'],
    fuel_use: 14,
  },
  {
    provider: 'county',
    plate: 'GKB 518P',
    type: 'advanced',
    equipment: ['oxygen', 'monitor', 'defibrillator', 'stretcher'],
    fuel_use: 15,
  },
  {
    provider: 'county',
    plate: 'GKC 077T',
    type: 'basic',
    equipment: ['oxygen', 'stretcher'],
    fuel_use: 14,
    status: 'offline',
  },
];

// Login accounts. Everyone uses the same demo password.
const PEOPLE = [
  {
    email: `admin@${DOMAIN}`,
    full_name: 'Afyaline Operations',
    role: 'admin',
    org: null,
    platform: true,
  },
  {
    email: `metro@${DOMAIN}`,
    full_name: 'Dr. Achieng Otieno',
    role: 'admin',
    org: 'metro',
    phone: '+254 711 000 101',
  },
  {
    email: `kiambu@${DOMAIN}`,
    full_name: 'Dr. Peter Kamau',
    role: 'admin',
    org: 'kiambu',
    phone: '+254 711 000 102',
  },
  {
    email: `thika@${DOMAIN}`,
    full_name: 'Nurse Grace Wanjiru',
    role: 'admin',
    org: 'thika',
    phone: '+254 711 000 103',
  },
  {
    email: `machakos@${DOMAIN}`,
    full_name: 'Dr. Daniel Mutua',
    role: 'admin',
    org: 'machakos',
    phone: '+254 711 000 104',
  },
  {
    email: `ruiru@${DOMAIN}`,
    full_name: 'Clinical Officer Faith Njeri',
    role: 'admin',
    org: 'ruiru',
    phone: '+254 711 000 105',
  },
  {
    email: `kajiado@${DOMAIN}`,
    full_name: 'Nurse Sankale Ole Nkoitoi',
    role: 'admin',
    org: 'kajiado',
    phone: '+254 711 000 106',
  },
  {
    email: `rapid@${DOMAIN}`,
    full_name: 'Mary Wambui',
    role: 'admin',
    org: 'rapid',
    phone: '+254 722 000 201',
  },
  {
    email: `county@${DOMAIN}`,
    full_name: 'James Kariuki',
    role: 'admin',
    org: 'county',
    phone: '+254 722 000 202',
  },
  {
    email: `driver.otieno@${DOMAIN}`,
    full_name: 'Brian Otieno',
    role: 'driver',
    org: 'rapid',
    phone: '+254 733 000 301',
    license_number: 'DL-448210',
  },
  {
    email: `driver.mwangi@${DOMAIN}`,
    full_name: 'Samuel Mwangi',
    role: 'driver',
    org: 'rapid',
    phone: '+254 733 000 302',
    license_number: 'DL-551903',
  },
  {
    email: `driver.chebet@${DOMAIN}`,
    full_name: 'Joyce Chebet',
    role: 'driver',
    org: 'county',
    phone: '+254 733 000 303',
    license_number: 'DL-602117',
  },
  {
    email: `driver.kiprono@${DOMAIN}`,
    full_name: 'Kevin Kiprono',
    role: 'driver',
    org: 'county',
    phone: '+254 733 000 304',
    license_number: 'DL-617344',
  },
  // Standby drivers have no seeded trips, so each provider can dispatch during a live demo.
  {
    email: `driver.akinyi@${DOMAIN}`,
    full_name: 'Lilian Akinyi',
    role: 'driver',
    org: 'rapid',
    phone: '+254 733 000 305',
    license_number: 'DL-630452',
    standby: true,
  },
  {
    email: `driver.wekesa@${DOMAIN}`,
    full_name: 'Patrick Wekesa',
    role: 'driver',
    org: 'county',
    phone: '+254 733 000 306',
    license_number: 'DL-641870',
    standby: true,
  },
];

// ---------------------------------------------------------------------------
// 3. Transfer history helpers
// ---------------------------------------------------------------------------
const FAMILY = [
  'Wanjiku',
  'Akinyi',
  'Mwangi',
  'Otieno',
  'Chebet',
  'Kiprotich',
  'Nyambura',
  'Omondi',
  'Wairimu',
  'Mutua',
  'Atieno',
  'Kamau',
  'Njoroge',
  'Auma',
  'Kipchumba',
  'Muthoni',
  'Ochieng',
  'Jeptoo',
  'Karanja',
  'Nduta',
];
const GIVEN = [
  'Mary',
  'John',
  'Grace',
  'Peter',
  'Faith',
  'David',
  'Esther',
  'Joseph',
  'Mercy',
  'Daniel',
  'Ruth',
  'Samuel',
  'Agnes',
  'Paul',
  'Lucy',
  'Moses',
  'Ann',
  'Brian',
  'Joy',
  'Kevin',
];
const CASES = [
  {
    service: 'icu',
    urgency: 'critical',
    summary: 'Severe head injury after road traffic accident, GCS 8',
    vitals: 'BP 90/60, HR 128, SpO2 88% on O2',
  },
  {
    service: 'maternity',
    urgency: 'critical',
    summary: 'Eclampsia at 34 weeks, seizures controlled with MgSO4',
    vitals: 'BP 170/115, HR 110',
  },
  {
    service: 'nicu',
    urgency: 'critical',
    summary: 'Preterm neonate 30 weeks, respiratory distress',
    vitals: 'SpO2 85%, RR 72',
  },
  {
    service: 'theatre',
    urgency: 'urgent',
    summary: 'Acute abdomen, suspected perforated appendix',
    vitals: 'BP 110/70, HR 112, T 38.9',
  },
  {
    service: 'dialysis',
    urgency: 'urgent',
    summary: 'Acute kidney injury, potassium 6.8',
    vitals: 'BP 150/95, HR 96',
  },
  {
    service: 'hdu',
    urgency: 'urgent',
    summary: 'Diabetic ketoacidosis, needs close monitoring',
    vitals: 'BP 100/65, HR 118, RBS 28',
  },
  {
    service: 'burns',
    urgency: 'urgent',
    summary: '30% partial-thickness burns, domestic fire',
    vitals: 'BP 105/70, HR 120',
  },
  {
    service: 'paediatrics',
    urgency: 'stable',
    summary: 'Severe malaria, needs specialist paediatric review',
    vitals: 'T 39.2, HR 140',
  },
  {
    service: 'general',
    urgency: 'stable',
    summary: 'Fractured femur, splinted, for orthopaedic review',
    vitals: 'BP 125/80, HR 92',
  },
  {
    service: 'icu',
    urgency: 'critical',
    summary: 'Septic shock, not responding to fluids',
    vitals: 'BP 80/45, HR 135',
  },
];
const CONSUMABLES = { critical: 3500, urgent: 1800, stable: 800 };
const DECLINE_REASONS = ['No ICU bed available', 'Specialist not on duty', 'Theatre fully booked'];

let seed = 42;
function rand() {
  // Deterministic, so every run produces the same demo story.
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (items) => items[Math.floor(rand() * items.length)];
const between = (min, max) => min + rand() * (max - min);

function roadKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.35; // straight line → typical road distance
}

const minutes = (date, m) => new Date(date.getTime() + m * 60_000);

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log('Removing previous demo data…');
await reset();

console.log('Creating organizations…');
const orgIds = {};
const orgByKey = {};
for (const h of HOSPITALS) {
  const row = check(
    await db
      .from('organizations')
      .insert({
        type: 'hospital',
        name: h.name,
        county: h.county,
        level: h.level,
        lat: h.lat,
        lng: h.lng,
        address: h.address,
        phone: `+254 20 ${Math.floor(between(2000000, 2999999))}`,
        email: `${h.key}@${DOMAIN}`,
      })
      .select('id')
      .single(),
    h.name,
  );
  orgIds[h.key] = row.id;
  orgByKey[h.key] = { ...h, id: row.id };
  check(
    await db.from('hospital_capacity').insert(
      Object.entries(h.beds).map(([service, beds_available]) => ({
        hospital_id: row.id,
        service,
        beds_available,
      })),
    ),
    `${h.name} capacity`,
  );
}
for (const p of PROVIDERS) {
  const row = check(
    await db
      .from('organizations')
      .insert({
        type: 'ambulance_provider',
        name: p.name,
        county: p.county,
        lat: p.lat,
        lng: p.lng,
        fuel_price: p.fuel_price,
        phone: `+254 20 ${Math.floor(between(3000000, 3999999))}`,
        email: `${p.key}@${DOMAIN}`,
      })
      .select('id')
      .single(),
    p.name,
  );
  orgIds[p.key] = row.id;
  orgByKey[p.key] = { ...p, id: row.id };
}

console.log('Creating ambulances…');
const ambulances = [];
for (const a of AMBULANCES) {
  const base = orgByKey[a.provider];
  const row = check(
    await db
      .from('ambulances')
      .insert({
        provider_id: base.id,
        plate: a.plate,
        type: a.type,
        equipment: a.equipment,
        fuel_use: a.fuel_use,
        status: a.status ?? 'available',
        lat: base.lat + between(-0.02, 0.02),
        lng: base.lng + between(-0.02, 0.02),
        last_seen_at: new Date().toISOString(),
      })
      .select('id')
      .single(),
    a.plate,
  );
  ambulances.push({ ...a, id: row.id });
}

console.log('Creating people…');
const people = {};
for (const p of PEOPLE) {
  const { user } = check(
    await db.auth.admin.createUser({
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
    }),
    p.email,
  );
  check(
    await db.from('profiles').insert({
      id: user.id,
      organization_id: p.org ? orgIds[p.org] : null,
      full_name: p.full_name,
      phone: p.phone ?? null,
      role: p.role,
      license_number: p.license_number ?? null,
      is_platform_admin: !!p.platform,
    }),
    `${p.email} profile`,
  );
  people[p.email] = { ...p, id: user.id };
}
const staffOf = (key) => Object.values(people).find((p) => p.org === key && p.role !== 'driver');
const driversOf = (key) =>
  Object.values(people).filter((p) => p.org === key && p.role === 'driver' && !p.standby);

console.log('Creating transfer history…');
const senders = ['kiambu', 'thika', 'machakos', 'ruiru', 'kajiado'];
const transfers = [];
const events = [];
const now = new Date();

for (let i = 0; i < 64; i++) {
  const c = pick(CASES);
  const senderKey = pick(senders);
  // Most transfers go to the national referral hospital; some go between county hospitals.
  let receiverKey =
    rand() < 0.7 ? 'metro' : pick(['kiambu', 'thika', 'machakos'].filter((k) => k !== senderKey));
  const sender = orgByKey[senderKey];
  let receiver = orgByKey[receiverKey];
  const providerKey =
    senderKey === 'machakos' || senderKey === 'kajiado' || rand() < 0.5 ? 'rapid' : 'county';
  const provider = orgByKey[providerKey];
  const fleet = ambulances.filter((a) => a.provider === providerKey && a.status !== 'offline');
  const suits = (a) => c.urgency !== 'critical' || a.type !== 'basic';
  let ambulance = c.urgency === 'critical' ? (fleet.find(suits) ?? fleet[0]) : pick(fleet);
  let driver = pick(driversOf(providerKey));
  if (i >= 60) {
    // In-progress trips each need their own ambulance and driver, and every provider keeps
    // at least one ambulance free so a live demo can always dispatch.
    const spare = fleet.filter((a) => !a.busy).length > 1;
    ambulance = spare ? fleet.find((a) => !a.busy && suits(a)) : undefined;
    driver = driversOf(providerKey).find((d) => !d.busy);
  }

  // Spread over the last 30 days; the last few are still in progress.
  const active = i >= 60;
  const requestedAt = active
    ? minutes(now, -between(10, 90))
    : minutes(now, -between(60 * 6, 60 * 24 * 30));

  // Providers dispatch from the station nearest the sending hospital.
  const toPickupKm = between(3, 15);
  // km/h: slower in town, faster on the highway between counties.
  const speedFor = (km) => (km > 30 ? between(50, 62) : between(28, 42));
  let responded = minutes(requestedAt, between(3, 12));
  const declined = !active && rand() < 0.1;

  const t = {
    id: crypto.randomUUID(),
    sending_hospital_id: sender.id,
    receiving_hospital_id: receiver.id,
    created_by: staffOf(senderKey).id,
    patient_name: `${pick(GIVEN)} ${pick(FAMILY)}`,
    patient_age:
      c.service === 'nicu'
        ? 0
        : c.service === 'paediatrics'
          ? Math.floor(between(1, 12))
          : Math.floor(between(18, 75)),
    patient_sex: c.service === 'maternity' ? 'female' : pick(['female', 'male']),
    condition_summary: c.summary,
    history: 'Referred after initial stabilisation. Allergies: none known.',
    vitals: c.vitals,
    urgency: c.urgency,
    service_needed: c.service,
    requested_at: requestedAt.toISOString(),
    responded_at: responded.toISOString(),
    status: 'requested',
  };
  // actorKey is an organization key, or 'driver' for steps the driver records from the ambulance.
  const log = (status, at, actorKey, note) => {
    const actor = actorKey === 'driver' ? driver : staffOf(actorKey);
    events.push({
      transfer_id: t.id,
      status,
      actor_id: actor.id,
      actor_name: actor.full_name,
      organization_id: orgIds[actorKey === 'driver' ? providerKey : actorKey],
      note: note ?? null,
      created_at: at.toISOString(),
    });
  };

  log('requested', requestedAt, senderKey);

  // A declined request is sent on to another hospital, which accepts (as staff would in the app).
  if (declined) {
    log('declined', responded, receiverKey, pick(DECLINE_REASONS));
    receiverKey = pick(
      ['metro', 'kiambu', 'thika', 'machakos'].filter((k) => k !== senderKey && k !== receiverKey),
    );
    receiver = orgByKey[receiverKey];
    const redirectedAt = minutes(responded, between(2, 6));
    log('redirected', redirectedAt, senderKey, `Sent to ${receiver.name}`);
    responded = minutes(redirectedAt, between(3, 10));
    Object.assign(t, { receiving_hospital_id: receiver.id, responded_at: responded.toISOString() });
  }
  const tripKm = roadKm(sender, receiver);

  const ambulanceRequested = minutes(responded, between(1, 4));
  const assigned = minutes(ambulanceRequested, between(2, 8));
  const departed = minutes(assigned, between(1, 4));
  const pickedUp = minutes(departed, (toPickupKm / speedFor(toPickupKm)) * 60 + between(5, 15));
  const arrived = minutes(pickedUp, (tripKm / speedFor(tripKm)) * 60);
  const handedOver = minutes(arrived, between(5, 15));
  const steps = [
    ['accepted', responded, receiverKey],
    ['ambulance_assigned', assigned, providerKey],
    ['en_route_to_pickup', departed, 'driver'],
    ['patient_onboard', pickedUp, 'driver'],
    ['arrived', arrived, 'driver'],
    ['handed_over', handedOver, receiverKey],
  ];
  // Active transfers stop part-way through, at a point already in the past.
  // Without a free ambulance and driver, an in-progress transfer stops at "accepted".
  const canDispatch = !active || (ambulance && driver);
  const reached = active
    ? steps
        .filter(([s, at]) => at <= now && (canDispatch || s === 'accepted'))
        .slice(0, 2 + (i % 3))
    : steps;

  t.status = reached.at(-1)[0];
  if (ambulanceRequested > now) {
    log('accepted', responded, receiverKey); // ambulance not requested yet
    transfers.push(t);
    continue;
  }
  Object.assign(t, {
    provider_id: provider.id,
    ambulance_requested_at: ambulanceRequested.toISOString(),
    route_distance_km: +(toPickupKm + tripKm).toFixed(1),
    route_duration_min: +(((toPickupKm + tripKm) / 40) * 60).toFixed(0),
  });
  const at = Object.fromEntries(reached.map(([s, d]) => [s, d.toISOString()]));
  if (at.ambulance_assigned)
    Object.assign(t, {
      ambulance_id: ambulance.id,
      driver_id: driver.id,
      assigned_at: at.ambulance_assigned,
    });
  if (at.en_route_to_pickup) t.departed_at = at.en_route_to_pickup;
  if (at.patient_onboard) t.picked_up_at = at.patient_onboard;
  if (at.arrived) t.arrived_at = at.arrived;
  if (at.handed_over) {
    const km = toPickupKm + tripKm; // same rule as the app: fuel on the planned route
    Object.assign(t, {
      handed_over_at: at.handed_over,
      fuel_cost: +(((km * ambulance.fuel_use) / 100) * provider.fuel_price).toFixed(2),
      consumables_cost: CONSUMABLES[c.urgency] + Math.round(between(0, 800)),
      other_cost: 0,
      handover_received_by: staffOf(receiverKey).full_name,
      handover_condition: pick(['stable', 'stable', 'stable', 'improved', 'deteriorated']),
      handover_notes: 'Patient received in good order. Referral notes handed over.',
    });
  }
  for (const [status, d, actor] of reached) log(status, d, actor);
  if (active && t.ambulance_id && t.status !== 'handed_over') {
    ambulance.busy = true;
    driver.busy = true;
  }
  transfers.push(t);
}

transfers.sort((a, b) => a.requested_at.localeCompare(b.requested_at)); // codes follow time order
for (const t of transfers)
  check(await db.from('transfers').insert(t), `transfer for ${t.patient_name}`);
check(await db.from('transfer_events').insert(events), 'transfer events');

for (const a of ambulances.filter((x) => x.busy)) {
  check(
    await db.from('ambulances').update({ status: 'on_trip' }).eq('id', a.id),
    `${a.plate} status`,
  );
}

console.log(`
Demo data ready: ${HOSPITALS.length} hospitals, ${PROVIDERS.length} providers, ${ambulances.length} ambulances, ${transfers.length} transfers.

Sign in with any of these (password: ${PASSWORD})
${PEOPLE.map((p) => `  ${p.email.padEnd(32)} ${p.full_name} (${p.platform ? 'platform admin' : p.role})`).join('\n')}
`);
