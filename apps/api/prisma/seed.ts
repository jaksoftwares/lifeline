/**
 * Demo network for local development and end-to-end tests. Safe to run repeatedly.
 * Facility names are real Nairobi hospitals; contacts and operational data are illustrative.
 * Never run against production.
 */
import { existsSync } from 'node:fs';
import {
  calculateScore,
  DEFAULT_RESOURCES,
  DEFAULT_SERVICES,
  type EquipmentCode,
} from '@lifeline/domain';
import {
  type AvailabilityStatus,
  type CapabilityLevel,
  type CrewQualification,
  type InstitutionType,
  type Ownership,
  PrismaClient,
  type Role,
  type VehicleStatus,
} from '@prisma/client';
import { hashPassword } from '../src/auth/passwords';
import { createRoleNotifications } from '../src/notifications/notification-records';

export const DEMO_NETWORK = { code: 'DEMO', name: 'Lifeline Demo Network' };

interface DemoInstitution {
  code: string;
  name: string;
  type: InstitutionType;
  level: number | null;
  county: string;
  ownership: Ownership;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  services?: string[];
  /** Minutes before seeding that capacity was last reported. Over 240 shows as stale. */
  reportedMinutesAgo?: number;
  /** [resource code, status, free, total, note] */
  capacity?: [string, AvailabilityStatus, number | null, number | null, string?][];
  departments?: [string, string][];
}

// Demo contacts use the unallocated +2547000001xx range.
export const DEMO_INSTITUTIONS: DemoInstitution[] = [
  {
    code: 'DNRH',
    name: 'Kenyatta National Hospital (KNH)',
    type: 'FACILITY',
    level: 6,
    county: 'Nairobi',
    ownership: 'PUBLIC',
    address: 'Hospital Road, Nairobi',
    phone: '+254700000101',
    latitude: -1.301,
    longitude: 36.807,
    services: DEFAULT_SERVICES.map((svc) => svc.code),
    reportedMinutesAgo: 25,
    capacity: [
      ['BED_ICU', 'LIMITED', 1, 30],
      ['BED_HDU', 'AVAILABLE', 4, 20],
      ['BED_NICU', 'UNAVAILABLE', 0, 40, 'All cots occupied'],
      ['BED_MATERNITY', 'AVAILABLE', 12, 120],
      ['BED_PAEDS', 'AVAILABLE', 8, 90],
      ['BED_GENERAL', 'LIMITED', 6, 600],
      ['BED_BURNS', 'AVAILABLE', 3, 24],
      ['EQ_THEATRE', 'AVAILABLE', null, null],
      ['EQ_CT', 'AVAILABLE', null, null],
      ['EQ_VENTILATOR', 'LIMITED', null, null],
      ['SP_NEUROSURGEON', 'AVAILABLE', null, null],
      ['SP_OBSTETRICIAN', 'AVAILABLE', null, null],
      ['SP_ANAESTHETIST', 'AVAILABLE', null, null],
    ],
    departments: [
      ['Accident and Emergency', '+254700000111'],
      ['Critical Care Unit', '+254700000112'],
      ['Maternity', '+254700000113'],
    ],
  },
  {
    code: 'DCRH-E',
    name: 'Mama Lucy Kibaki Hospital',
    type: 'FACILITY',
    level: 5,
    county: 'Nairobi',
    ownership: 'PUBLIC',
    address: 'Umoja, Nairobi',
    phone: '+254700000121',
    latitude: -1.2588,
    longitude: 36.8942,
    services: [
      'EMERGENCY',
      'ICU',
      'HDU',
      'NICU',
      'CEMONC',
      'PAEDS',
      'SURGERY',
      'ORTHO',
      'CT',
      'BLOOD',
      'DIALYSIS',
    ],
    reportedMinutesAgo: 70,
    capacity: [
      ['BED_ICU', 'AVAILABLE', 2, 8],
      ['BED_HDU', 'LIMITED', 1, 6],
      ['BED_NICU', 'AVAILABLE', 3, 12],
      ['BED_MATERNITY', 'AVAILABLE', 9, 60],
      ['EQ_THEATRE', 'AVAILABLE', null, null],
      ['EQ_CT', 'UNAVAILABLE', null, null, 'Scanner under repair'],
      ['SP_OBSTETRICIAN', 'AVAILABLE', null, null],
      ['SP_ANAESTHETIST', 'LIMITED', null, null],
    ],
    departments: [
      ['Casualty', '+254700000131'],
      ['Maternity', '+254700000132'],
    ],
  },
  {
    code: 'DCRH-W',
    name: 'Mbagathi County Hospital',
    type: 'FACILITY',
    level: 5,
    county: 'Nairobi',
    ownership: 'PUBLIC',
    address: 'Mbagathi Way, Nairobi',
    phone: '+254700000141',
    latitude: -1.3037,
    longitude: 36.8033,
    services: ['EMERGENCY', 'ICU', 'HDU', 'CEMONC', 'PAEDS', 'SURGERY', 'ORTHO', 'CT', 'BLOOD'],
    reportedMinutesAgo: 9 * 60,
    capacity: [
      ['BED_ICU', 'AVAILABLE', 1, 6],
      ['BED_HDU', 'AVAILABLE', 2, 6],
      ['BED_MATERNITY', 'LIMITED', 2, 50],
      ['EQ_THEATRE', 'AVAILABLE', null, null],
      ['EQ_CT', 'AVAILABLE', null, null],
      ['SP_OBSTETRICIAN', 'AVAILABLE', null, null],
    ],
    departments: [['Casualty', '+254700000151']],
  },
  {
    code: 'DSCH-N',
    name: 'Pumwani Maternity Hospital',
    type: 'FACILITY',
    level: 4,
    county: 'Nairobi',
    ownership: 'PUBLIC',
    address: 'Pumwani, Nairobi',
    phone: '+254700000161',
    latitude: -1.2794,
    longitude: 36.8393,
    services: ['EMERGENCY', 'CEMONC', 'PAEDS', 'SURGERY', 'BLOOD'],
    reportedMinutesAgo: 40,
    capacity: [
      ['BED_MATERNITY', 'AVAILABLE', 5, 24],
      ['BED_GENERAL', 'AVAILABLE', 10, 80],
      ['EQ_THEATRE', 'LIMITED', null, null],
      ['SP_OBSTETRICIAN', 'UNAVAILABLE', null, null, 'On leave until Monday'],
    ],
    departments: [
      ['Casualty', '+254700000171'],
      ['Maternity', '+254700000172'],
    ],
  },
  {
    code: 'DSCH-S',
    name: 'The Nairobi Hospital',
    type: 'FACILITY',
    level: 4,
    county: 'Nairobi',
    ownership: 'PRIVATE',
    address: 'Argwings Kodhek Road, Nairobi',
    phone: '+254700000181',
    latitude: -1.3006,
    longitude: 36.8072,
    services: ['EMERGENCY', 'CEMONC', 'PAEDS', 'SURGERY', 'BLOOD'],
    reportedMinutesAgo: 120,
    capacity: [
      ['BED_MATERNITY', 'AVAILABLE', 6, 20],
      ['BED_GENERAL', 'LIMITED', 3, 60],
      ['EQ_THEATRE', 'AVAILABLE', null, null],
      ['SP_OBSTETRICIAN', 'AVAILABLE', null, null],
    ],
    departments: [['Casualty', '+254700000191']],
  },
  {
    code: 'DAS',
    name: 'Demo Ambulance Services',
    type: 'AMBULANCE_PROVIDER',
    level: null,
    county: 'Nairobi',
    ownership: 'PRIVATE',
    address: 'Demo Industrial Area, Nairobi',
    phone: '+254700000199',
    latitude: -1.286,
    longitude: 36.817,
  },
  {
    code: 'DCAS',
    name: 'Demo County Ambulance Service',
    type: 'AMBULANCE_PROVIDER',
    level: null,
    county: 'Kiambu',
    ownership: 'PUBLIC',
    address: 'Demo County Garage, Kiambu',
    phone: '+254700000198',
    latitude: -1.168,
    longitude: 36.829,
  },
];

/** institution: null means a network-wide role. */
export const DEMO_USERS: {
  email: string;
  fullName: string;
  role: Role;
  institution: string | null;
}[] = [
  {
    email: 'clinician.north@demo.lifeline.test',
    fullName: 'Grace Wanjiru',
    role: 'REFERRING_CLINICIAN',
    institution: 'DSCH-N',
  },
  {
    email: 'coordinator.north@demo.lifeline.test',
    fullName: 'Peter Kamau',
    role: 'REFERRAL_COORDINATOR',
    institution: 'DSCH-N',
  },
  {
    email: 'admin.north@demo.lifeline.test',
    fullName: 'Faith Njeri',
    role: 'FACILITY_ADMIN',
    institution: 'DSCH-N',
  },
  {
    email: 'receiving.national@demo.lifeline.test',
    fullName: 'Dr. Samuel Otieno',
    role: 'RECEIVING_DECISION_MAKER',
    institution: 'DNRH',
  },
  {
    email: 'admin.national@demo.lifeline.test',
    fullName: 'Mercy Achieng',
    role: 'FACILITY_ADMIN',
    institution: 'DNRH',
  },
  {
    email: 'dispatcher@demo.lifeline.test',
    fullName: 'Brian Mutua',
    role: 'DISPATCHER',
    institution: 'DAS',
  },
  {
    email: 'crew@demo.lifeline.test',
    fullName: 'Kevin Ochieng',
    role: 'AMBULANCE_CREW',
    institution: 'DAS',
  },
  {
    email: 'admin.ambulance@demo.lifeline.test',
    fullName: 'Lucy Wambui',
    role: 'PROVIDER_ADMIN',
    institution: 'DAS',
  },
  {
    email: 'operations@demo.lifeline.test',
    fullName: 'Daniel Kiprop',
    role: 'NETWORK_OPERATIONS',
    institution: null,
  },
  {
    email: 'network.admin@demo.lifeline.test',
    fullName: 'Esther Muthoni',
    role: 'NETWORK_ADMIN',
    institution: null,
  },
  {
    email: 'auditor@demo.lifeline.test',
    fullName: 'Joseph Kiplagat',
    role: 'AUDITOR',
    institution: null,
  },
  {
    email: 'receiving.east@demo.lifeline.test',
    fullName: 'Dr. Ann Mwikali',
    role: 'RECEIVING_DECISION_MAKER',
    institution: 'DCRH-E',
  },
  {
    email: 'receiving.west@demo.lifeline.test',
    fullName: 'Dr. Paul Njoroge',
    role: 'RECEIVING_DECISION_MAKER',
    institution: 'DCRH-W',
  },
  {
    email: 'dispatcher.county@demo.lifeline.test',
    fullName: 'Rose Chebet',
    role: 'DISPATCHER',
    institution: 'DCAS',
  },
];

const ALS_KIT: EquipmentCode[] = [
  'OXYGEN',
  'SUCTION',
  'CARDIAC_MONITOR',
  'DEFIBRILLATOR',
  'INFUSION_PUMP',
  'SPINAL_IMMOBILISATION',
];

/**
 * Vehicles in different states so the matching rules can be seen: available, out of service, off
 * duty, and one whose availability is out of date. Minutes are before seeding; null means never set.
 */
export const DEMO_VEHICLES: {
  provider: string;
  registration: string;
  callSign: string;
  capability: CapabilityLevel;
  equipment: EquipmentCode[];
  status: VehicleStatus;
  statusMinutesAgo: number | null;
  statusNote?: string;
  base?: [string, number, number];
}[] = [
  {
    provider: 'DAS',
    registration: 'KDA 101A',
    callSign: 'DAS-1',
    capability: 'ALS',
    equipment: ALS_KIT,
    status: 'AVAILABLE',
    statusMinutesAgo: 40,
    base: ['Thika Road station', -1.105, 36.905],
  },
  {
    provider: 'DAS',
    registration: 'KDA 102B',
    callSign: 'DAS-2',
    capability: 'CRITICAL_CARE',
    equipment: [...ALS_KIT, 'VENTILATOR', 'INCUBATOR'],
    status: 'AVAILABLE',
    statusMinutesAgo: 120,
  },
  {
    provider: 'DAS',
    registration: 'KDA 103C',
    callSign: 'DAS-3',
    capability: 'BLS',
    equipment: ['OXYGEN', 'SUCTION', 'SPINAL_IMMOBILISATION'],
    status: 'OUT_OF_SERVICE',
    statusMinutesAgo: 180,
    statusNote: 'Gearbox repair, back tomorrow',
  },
  {
    provider: 'DAS',
    registration: 'KDA 104D',
    callSign: 'DAS-4',
    capability: 'ALS',
    equipment: ALS_KIT,
    status: 'AVAILABLE',
    statusMinutesAgo: 16 * 60,
  },
  {
    provider: 'DCAS',
    registration: 'GKB 201A',
    callSign: 'KIAMBU-1',
    capability: 'BLS',
    equipment: ['OXYGEN', 'SUCTION', 'SPINAL_IMMOBILISATION'],
    status: 'AVAILABLE',
    statusMinutesAgo: 20,
    base: ['Gatundu sub-county garage', -1.01, 36.91],
  },
  {
    provider: 'DCAS',
    registration: 'GKB 202B',
    callSign: 'KIAMBU-2',
    capability: 'PATIENT_TRANSPORT',
    equipment: [],
    status: 'AVAILABLE',
    statusMinutesAgo: 60,
  },
  {
    provider: 'DCAS',
    registration: 'GKB 203C',
    callSign: 'KIAMBU-3',
    capability: 'BLS',
    equipment: ['OXYGEN', 'SUCTION'],
    status: 'OFF_DUTY',
    statusMinutesAgo: 300,
  },
];

/** [provider, name, qualification, linked account email] */
const DEMO_CREW: [string, string, CrewQualification, string?][] = [
  ['DAS', 'Kevin Ochieng', 'PARAMEDIC', 'crew@demo.lifeline.test'],
  ['DAS', 'Mary Atieno', 'NURSE'],
  ['DAS', 'James Kibet', 'EMT'],
  ['DAS', 'Ali Hassan', 'DRIVER'],
  ['DAS', 'John Mutiso', 'DRIVER'],
  ['DCAS', 'Agnes Moraa', 'EMT'],
  ['DCAS', 'Tom Wekesa', 'DRIVER'],
];

export async function seed(prisma: PrismaClient, demoPassword: string): Promise<void> {
  // The demo network shows NEWS2 so the feature can be seen. Real networks start with no score
  // until their clinical governance group approves one.
  const network = await prisma.network.upsert({
    where: { code: DEMO_NETWORK.code },
    update: { name: DEMO_NETWORK.name, earlyWarningScore: 'NEWS2' },
    create: { ...DEMO_NETWORK, earlyWarningScore: 'NEWS2' },
  });

  const serviceIds = new Map<string, string>();
  for (const [sortOrder, svc] of DEFAULT_SERVICES.entries()) {
    const row = await prisma.service.upsert({
      where: { networkId_code: { networkId: network.id, code: svc.code } },
      update: { name: svc.name, category: svc.category, sortOrder },
      create: { ...svc, sortOrder, networkId: network.id },
    });
    serviceIds.set(svc.code, row.id);
  }
  const resourceIds = new Map<string, string>();
  for (const [sortOrder, res] of DEFAULT_RESOURCES.entries()) {
    const row = await prisma.capacityResource.upsert({
      where: { networkId_code: { networkId: network.id, code: res.code } },
      update: { name: res.name, kind: res.kind, sortOrder },
      create: { ...res, sortOrder, networkId: network.id },
    });
    resourceIds.set(res.code, row.id);
  }

  const institutionIds = new Map<string, string>();
  for (const inst of DEMO_INSTITUTIONS) {
    const { services: _s, capacity: _c, departments: _d, reportedMinutesAgo: _r, ...fields } = inst;
    const row = await prisma.institution.upsert({
      where: { networkId_code: { networkId: network.id, code: inst.code } },
      update: fields,
      create: { ...fields, networkId: network.id },
    });
    institutionIds.set(inst.code, row.id);
  }

  const passwordHash = await hashPassword(demoPassword);
  for (const demo of DEMO_USERS) {
    // Existing users keep their password and MFA enrolment between seeds.
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { fullName: demo.fullName },
      create: {
        email: demo.email,
        fullName: demo.fullName,
        passwordHash,
        mustChangePassword: false,
      },
    });
    const institutionId = demo.institution ? institutionIds.get(demo.institution)! : null;
    const existing = await prisma.membership.findFirst({
      where: { userId: user.id, networkId: network.id, institutionId, role: demo.role },
    });
    if (!existing) {
      await prisma.membership.create({
        data: { userId: user.id, networkId: network.id, institutionId, role: demo.role },
      });
    }
  }

  await seedFacilityDetails(prisma, institutionIds, serviceIds, resourceIds);
  await seedDemoReferral(prisma, network.id, institutionIds, serviceIds);
  await seedFleet(prisma, network.id, institutionIds);
  await seedAcceptedReferral(prisma, network.id, institutionIds, serviceIds);
}

/** Vehicles and crew for both demo providers. Each vehicle and each provider's crew is added once. */
async function seedFleet(
  prisma: PrismaClient,
  networkId: string,
  institutionIds: Map<string, string>,
): Promise<void> {
  const dispatchers = new Map<string, string>();
  for (const demo of DEMO_USERS.filter((u) => u.role === 'DISPATCHER' && u.institution)) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: demo.email } });
    dispatchers.set(demo.institution!, user.id);
  }

  for (const v of DEMO_VEHICLES) {
    const exists = await prisma.vehicle.findUnique({
      where: { networkId_registration: { networkId, registration: v.registration } },
    });
    if (exists) continue;
    const vehicle = await prisma.vehicle.create({
      data: {
        networkId,
        institutionId: institutionIds.get(v.provider)!,
        registration: v.registration,
        callSign: v.callSign,
        capability: v.capability,
        equipment: v.equipment,
        status: v.status,
        statusNote: v.statusNote ?? null,
        statusUpdatedAt:
          v.statusMinutesAgo === null ? null : new Date(Date.now() - v.statusMinutesAgo * 60_000),
        statusUpdatedById: v.statusMinutesAgo === null ? null : dispatchers.get(v.provider),
        baseName: v.base?.[0] ?? null,
        baseLatitude: v.base?.[1] ?? null,
        baseLongitude: v.base?.[2] ?? null,
      },
    });
    await prisma.vehicleStatusEvent.create({
      data: {
        vehicleId: vehicle.id,
        status: vehicle.status,
        recordStatus: vehicle.recordStatus,
        recordedAt: vehicle.statusUpdatedAt ?? vehicle.createdAt,
      },
    });
  }

  for (const provider of new Set(DEMO_CREW.map(([p]) => p))) {
    const institutionId = institutionIds.get(provider)!;
    if ((await prisma.crewMember.count({ where: { institutionId } })) > 0) continue;
    for (const [, fullName, qualification, email] of DEMO_CREW.filter(([p]) => p === provider)) {
      const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
      await prisma.crewMember.create({
        data: { institutionId, fullName, qualification, userId: user?.id ?? null },
      });
    }
  }
}

const ACCEPTED_PATIENT = 'Wanjiku Njoki Kamau';

/**
 * A referral already accepted by the East hospital, so transport can be arranged straight away in a
 * fresh demo. Added once.
 */
async function seedAcceptedReferral(
  prisma: PrismaClient,
  networkId: string,
  institutionIds: Map<string, string>,
  serviceIds: Map<string, string>,
): Promise<void> {
  if (await prisma.patient.findFirst({ where: { networkId, fullName: ACCEPTED_PATIENT } })) return;
  const clinician = await prisma.user.findUniqueOrThrow({
    where: { email: 'clinician.north@demo.lifeline.test' },
  });
  const decider = await prisma.user.findUniqueOrThrow({
    where: { email: 'receiving.east@demo.lifeline.test' },
  });
  const north = institutionIds.get('DSCH-N')!;
  const east = institutionIds.get('DCRH-E')!;
  const sentAt = new Date(Date.now() - 45 * 60_000);
  const acceptedAt = new Date(Date.now() - 15 * 60_000);
  const maternity = await prisma.department.findFirst({
    where: { institutionId: east, name: 'Maternity' },
  });

  await prisma.$transaction(async (tx) => {
    const seq = await tx.network.update({
      where: { id: networkId },
      data: { referralSequence: { increment: 1 } },
    });
    const patient = await tx.patient.create({
      data: {
        networkId,
        fullName: ACCEPTED_PATIENT,
        sex: 'FEMALE',
        estimatedAge: 27,
        estimatedAgeUnit: 'YEARS',
      },
    });
    const referral = await tx.referral.create({
      data: {
        networkId,
        reference: `${seq.code}-${String(sentAt.getUTCFullYear()).slice(-2)}-${String(seq.referralSequence).padStart(5, '0')}`,
        status: 'ACCEPTED',
        urgency: 'URGENT',
        referringInstitutionId: north,
        createdById: clinician.id,
        patientId: patient.id,
        pregnancyStatus: 'PREGNANT',
        gestationWeeks: 39,
        reason: 'Obstructed labour; needs caesarean section. Our obstetrician is on leave.',
        clinicalSummary:
          'Primigravida in labour for 16 hours, cervix 7 cm for 5 hours despite good contractions. Fetal heart 150 and regular. Vital signs stable.',
        provisionalDiagnosis: 'Obstructed labour, cephalopelvic disproportion',
        treatmentGiven: 'IV Ringer’s lactate, urinary catheter, ceftriaxone 1 g IV.',
        allergies: 'None known',
        submittedAt: sentAt,
        acceptedAt,
        createdAt: new Date(sentAt.getTime() - 10 * 60_000),
        requiredServices: { create: [{ serviceId: serviceIds.get('CEMONC')! }] },
        requests: {
          create: {
            institutionId: east,
            sentById: clinician.id,
            sentAt,
            status: 'ACCEPTED',
            respondedAt: acceptedAt,
            respondedById: decider.id,
            responseNote: 'Theatre is ready. Please call the maternity unit on departure.',
            receivingDepartmentId: maternity?.id ?? null,
          },
        },
      },
      include: { requests: true },
    });
    const requestId = referral.requests[0]!.id;
    await tx.referral.update({
      where: { id: referral.id },
      data: { acceptedRequestId: requestId },
    });
    const events = [
      { type: 'CREATED' as const, institutionId: north, occurredAt: referral.createdAt },
      { type: 'SUBMITTED' as const, institutionId: north, occurredAt: sentAt },
      { type: 'REQUEST_SENT' as const, institutionId: east, requestId, occurredAt: sentAt },
      {
        type: 'ACCEPTED' as const,
        institutionId: east,
        requestId,
        occurredAt: acceptedAt,
        actorId: decider.id,
      },
    ];
    for (const event of events) {
      await tx.referralEvent.create({
        data: { referralId: referral.id, actorId: clinician.id, ...event },
      });
    }
  });
}

/** One referral waiting at the national hospital, so the inboxes aren't empty in a fresh demo. Added once. */
async function seedDemoReferral(
  prisma: PrismaClient,
  networkId: string,
  institutionIds: Map<string, string>,
  serviceIds: Map<string, string>,
): Promise<void> {
  if ((await prisma.referral.count({ where: { networkId } })) > 0) return;
  const clinician = await prisma.user.findUniqueOrThrow({
    where: { email: 'clinician.north@demo.lifeline.test' },
  });
  const north = institutionIds.get('DSCH-N')!;
  const national = institutionIds.get('DNRH')!;
  const sentAt = new Date(Date.now() - 20 * 60_000);
  const vitals = {
    respiratoryRate: 22,
    oxygenSaturation: 95,
    onSupplementalOxygen: true,
    systolicBp: 104,
    diastolicBp: 66,
    heartRate: 112,
    temperature: 37.2,
    consciousness: 'VOICE' as const,
  };
  const score = calculateScore('NEWS2', vitals);

  await prisma.$transaction(async (tx) => {
    const seq = await tx.network.update({
      where: { id: networkId },
      data: { referralSequence: { increment: 1 } },
    });
    const patient = await tx.patient.create({
      data: {
        networkId,
        fullName: 'John Mwangi Kariuki',
        sex: 'MALE',
        estimatedAge: 42,
        estimatedAgeUnit: 'YEARS',
      },
    });
    const referral = await tx.referral.create({
      data: {
        networkId,
        reference: `${seq.code}-${String(sentAt.getUTCFullYear()).slice(-2)}-${String(seq.referralSequence).padStart(5, '0')}`,
        status: 'SUBMITTED',
        urgency: 'EMERGENCY',
        referringInstitutionId: north,
        createdById: clinician.id,
        patientId: patient.id,
        pregnancyStatus: 'NOT_APPLICABLE',
        reason:
          'Suspected extradural haematoma after a road traffic collision; needs CT and neurosurgical review.',
        clinicalSummary:
          'Motorcycle rider, helmet not worn. Brief loss of consciousness at scene, now drowsy and responds to voice. Left temporal swelling. Right pupil sluggish.',
        provisionalDiagnosis: 'Traumatic brain injury, suspected extradural haematoma',
        treatmentGiven:
          'Oxygen 4 L/min by nasal prongs, IV normal saline, cervical collar, tetanus toxoid.',
        allergies: 'None known',
        submittedAt: sentAt,
        createdAt: new Date(sentAt.getTime() - 10 * 60_000),
        requiredServices: {
          create: ['NEURO', 'CT'].map((code) => ({ serviceId: serviceIds.get(code)! })),
        },
        assessments: {
          create: {
            recordedById: clinician.id,
            observedAt: new Date(sentAt.getTime() - 5 * 60_000),
            ...vitals,
            scoreType: 'NEWS2',
            scoreTotal: score.total,
            scoreBand: score.band,
          },
        },
        requests: {
          create: {
            institutionId: national,
            sentById: clinician.id,
            sentAt,
            escalationDueAt: new Date(sentAt.getTime() + seq.referralEscalationMinutes * 60_000),
          },
        },
      },
      include: { requests: true },
    });
    const events = [
      { type: 'CREATED' as const, institutionId: north, occurredAt: referral.createdAt },
      {
        type: 'ASSESSMENT_RECORDED' as const,
        institutionId: north,
        occurredAt: new Date(sentAt.getTime() - 5 * 60_000),
      },
      { type: 'SUBMITTED' as const, institutionId: north, occurredAt: sentAt },
      {
        type: 'REQUEST_SENT' as const,
        institutionId: national,
        requestId: referral.requests[0]!.id,
        occurredAt: sentAt,
      },
    ];
    for (const event of events) {
      await tx.referralEvent.create({
        data: { referralId: referral.id, actorId: clinician.id, ...event },
      });
    }
    await createRoleNotifications(tx, {
      networkId,
      institutionId: national,
      roles: ['RECEIVING_DECISION_MAKER', 'REFERRAL_COORDINATOR'],
      eventType: 'REFERRAL_SUBMITTED',
      eventKey: `referral-request:${referral.requests[0]!.id}:submitted`,
      title: 'New referral received',
      message: `Referral ${referral.reference} is waiting for your facility’s response.`,
      entityType: 'referral',
      entityId: referral.id,
    });
  });
}

/** Services, tracked resources, departments and a first round of capacity reports. Added once. */
async function seedFacilityDetails(
  prisma: PrismaClient,
  institutionIds: Map<string, string>,
  serviceIds: Map<string, string>,
  resourceIds: Map<string, string>,
): Promise<void> {
  const reporters = new Map<string, string>();
  for (const demo of DEMO_USERS.filter((u) => u.role === 'FACILITY_ADMIN' && u.institution)) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: demo.email } });
    reporters.set(demo.institution!, user.id);
  }

  for (const inst of DEMO_INSTITUTIONS) {
    const institutionId = institutionIds.get(inst.code)!;
    await prisma.facilityService.createMany({
      data: (inst.services ?? []).map((code) => ({
        institutionId,
        serviceId: serviceIds.get(code)!,
      })),
      skipDuplicates: true,
    });
    await prisma.facilityResource.createMany({
      data: (inst.capacity ?? []).map(([code]) => ({
        institutionId,
        resourceId: resourceIds.get(code)!,
      })),
      skipDuplicates: true,
    });

    if (inst.departments && (await prisma.department.count({ where: { institutionId } })) === 0) {
      await prisma.department.createMany({
        data: inst.departments.map(([name, phone]) => ({ institutionId, name, phone })),
      });
    }

    if (!inst.capacity || (await prisma.capacityUpdate.count({ where: { institutionId } })) > 0)
      continue;
    const recordedAt = new Date(Date.now() - (inst.reportedMinutesAgo ?? 0) * 60_000);
    const recordedById = reporters.get(inst.code) ?? null;
    for (const [code, status, available, total, note] of inst.capacity) {
      const values = { status, available, total, note: note ?? null, source: 'MANUAL' as const };
      const resourceId = resourceIds.get(code)!;
      await prisma.capacityUpdate.create({
        data: { ...values, institutionId, resourceId, recordedById, recordedAt },
      });
      await prisma.facilityResource.update({
        where: { institutionId_resourceId: { institutionId, resourceId } },
        data: { ...values, updatedAt: recordedAt, updatedById: recordedById },
      });
    }
  }
}

async function main() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed demo data in production.');
  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('Set SEED_DEMO_PASSWORD (at least 12 characters).');

  const prisma = new PrismaClient();
  try {
    await seed(prisma, password);
    console.log(
      `Seeded ${DEMO_NETWORK.name}: ${DEMO_INSTITUTIONS.length} institutions, ${DEMO_USERS.length} users.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only when run as a script (`prisma db seed`), not when imported by the test setup.
if (typeof require !== 'undefined' && require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
