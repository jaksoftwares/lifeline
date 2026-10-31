/**
 * Demo network for local development and end-to-end tests. Safe to run repeatedly.
 * All names are fictional. Never run against production.
 */
import { existsSync } from 'node:fs';
import { type InstitutionType, PrismaClient, type Role } from '@prisma/client';
import { hashPassword } from '../src/auth/passwords';

export const DEMO_NETWORK = { code: 'DEMO', name: 'Lifeline Demo Network' };

export const DEMO_INSTITUTIONS: {
  code: string;
  name: string;
  type: InstitutionType;
  level: number | null;
  county: string;
}[] = [
  {
    code: 'DNRH',
    name: 'Demo National Referral Hospital',
    type: 'FACILITY',
    level: 6,
    county: 'Nairobi',
  },
  {
    code: 'DCRH-E',
    name: 'Demo County Referral Hospital East',
    type: 'FACILITY',
    level: 5,
    county: 'Machakos',
  },
  {
    code: 'DCRH-W',
    name: 'Demo County Referral Hospital West',
    type: 'FACILITY',
    level: 5,
    county: 'Kiambu',
  },
  {
    code: 'DSCH-N',
    name: 'Demo Sub-County Hospital North',
    type: 'FACILITY',
    level: 4,
    county: 'Kiambu',
  },
  {
    code: 'DSCH-S',
    name: 'Demo Sub-County Hospital South',
    type: 'FACILITY',
    level: 4,
    county: 'Kajiado',
  },
  {
    code: 'DAS',
    name: 'Demo Ambulance Services',
    type: 'AMBULANCE_PROVIDER',
    level: null,
    county: 'Nairobi',
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

  const institutionIds = new Map<string, string>();
  for (const inst of DEMO_INSTITUTIONS) {
    const row = await prisma.institution.upsert({
      where: { networkId_code: { networkId: network.id, code: inst.code } },
      update: { name: inst.name, level: inst.level, county: inst.county },
      create: { ...inst, networkId: network.id },
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
