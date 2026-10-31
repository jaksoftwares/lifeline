/**
 * Demo network for local development and end-to-end tests. Safe to run repeatedly.
 * All names are fictional. Never run against production.
 */
import { existsSync } from 'node:fs';
import { DEFAULT_RESOURCES, DEFAULT_SERVICES } from '@lifeline/domain';
import {
  type AvailabilityStatus,
  type InstitutionType,
  type Ownership,
  PrismaClient,
  type Role,
} from '@prisma/client';
import { hashPassword } from '../src/auth/passwords';

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

// Coordinates place each fictional facility near a real town so distances are realistic.
// Phone numbers use the unallocated +2547000001xx range.
export const DEMO_INSTITUTIONS: DemoInstitution[] = [
  {
    code: 'DNRH',
    name: 'Demo National Referral Hospital',
    type: 'FACILITY',
    level: 6,
    county: 'Nairobi',
    ownership: 'PUBLIC',
    address: 'Demo Hospital Road, Nairobi',
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
    name: 'Demo County Referral Hospital East',
    type: 'FACILITY',
    level: 5,
    county: 'Machakos',
    ownership: 'PUBLIC',
    address: 'Demo Avenue, Machakos',
    phone: '+254700000121',
    latitude: -1.518,
    longitude: 37.264,
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
    name: 'Demo County Referral Hospital West',
    type: 'FACILITY',
    level: 5,
    county: 'Kiambu',
    ownership: 'PUBLIC',
    address: 'Demo Street, Kiambu',
    phone: '+254700000141',
    latitude: -1.172,
    longitude: 36.835,
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
    name: 'Demo Sub-County Hospital North',
    type: 'FACILITY',
    level: 4,
    county: 'Kiambu',
    ownership: 'PUBLIC',
    address: 'Demo Lane, Gatundu',
    phone: '+254700000161',
    latitude: -1.005,
    longitude: 36.903,
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
    name: 'Demo Sub-County Hospital South',
    type: 'FACILITY',
    level: 4,
    county: 'Kajiado',
    ownership: 'FAITH_BASED',
    address: 'Demo Close, Kajiado',
    phone: '+254700000181',
    latitude: -1.852,
    longitude: 36.777,
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
];

export async function seed(prisma: PrismaClient, demoPassword: string): Promise<void> {
  const network = await prisma.network.upsert({
    where: { code: DEMO_NETWORK.code },
    update: { name: DEMO_NETWORK.name },
    create: DEMO_NETWORK,
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
