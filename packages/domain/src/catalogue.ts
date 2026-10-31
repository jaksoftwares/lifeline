import { type ResourceKind } from './capacity';

/**
 * Starting catalogue for a new network. Networks can adapt it; codes are stable identifiers.
 * Services describe what a facility offers; resources are what it reports availability for.
 */
export const DEFAULT_SERVICES: { code: string; name: string; category: string }[] = [
  { code: 'EMERGENCY', name: 'Emergency and casualty', category: 'Acute care' },
  { code: 'ICU', name: 'Intensive care (adult)', category: 'Critical care' },
  { code: 'HDU', name: 'High dependency care', category: 'Critical care' },
  { code: 'NICU', name: 'Neonatal intensive care', category: 'Critical care' },
  {
    code: 'CEMONC',
    name: 'Comprehensive emergency obstetric care',
    category: 'Maternal and newborn',
  },
  { code: 'PAEDS', name: 'Paediatric inpatient care', category: 'Maternal and newborn' },
  { code: 'SURGERY', name: 'General surgery', category: 'Surgical' },
  { code: 'ORTHO', name: 'Orthopaedic and trauma surgery', category: 'Surgical' },
  { code: 'NEURO', name: 'Neurosurgery', category: 'Surgical' },
  { code: 'BURNS', name: 'Burns care', category: 'Surgical' },
  { code: 'CARDIO', name: 'Cardiology', category: 'Medical' },
  { code: 'DIALYSIS', name: 'Renal dialysis', category: 'Medical' },
  { code: 'ONCOLOGY', name: 'Oncology', category: 'Medical' },
  { code: 'PSYCH', name: 'Inpatient mental health', category: 'Medical' },
  { code: 'CT', name: 'CT imaging', category: 'Diagnostics' },
  { code: 'MRI', name: 'MRI', category: 'Diagnostics' },
  { code: 'BLOOD', name: 'Blood transfusion', category: 'Diagnostics' },
];

export const DEFAULT_RESOURCES: { code: string; name: string; kind: ResourceKind }[] = [
  { code: 'BED_ICU', name: 'ICU bed', kind: 'BED' },
  { code: 'BED_HDU', name: 'HDU bed', kind: 'BED' },
  { code: 'BED_NICU', name: 'NICU cot', kind: 'BED' },
  { code: 'BED_MATERNITY', name: 'Maternity bed', kind: 'BED' },
  { code: 'BED_PAEDS', name: 'Paediatric bed', kind: 'BED' },
  { code: 'BED_GENERAL', name: 'General ward bed', kind: 'BED' },
  { code: 'BED_BURNS', name: 'Burns bed', kind: 'BED' },
  { code: 'BED_ISOLATION', name: 'Isolation bed', kind: 'BED' },
  { code: 'EQ_THEATRE', name: 'Operating theatre', kind: 'EQUIPMENT' },
  { code: 'EQ_CT', name: 'CT scanner', kind: 'EQUIPMENT' },
  { code: 'EQ_VENTILATOR', name: 'Ventilator', kind: 'EQUIPMENT' },
  { code: 'EQ_DIALYSIS', name: 'Dialysis machine', kind: 'EQUIPMENT' },
  { code: 'SP_OBSTETRICIAN', name: 'Obstetrician', kind: 'SPECIALIST' },
  { code: 'SP_PAEDIATRICIAN', name: 'Paediatrician', kind: 'SPECIALIST' },
  { code: 'SP_ANAESTHETIST', name: 'Anaesthetist', kind: 'SPECIALIST' },
  { code: 'SP_NEUROSURGEON', name: 'Neurosurgeon', kind: 'SPECIALIST' },
];

export const OWNERSHIP_TYPES = ['PUBLIC', 'PRIVATE', 'FAITH_BASED', 'NGO'] as const;
export type Ownership = (typeof OWNERSHIP_TYPES)[number];

export const OWNERSHIP_LABELS: Record<Ownership, string> = {
  PUBLIC: 'Public',
  PRIVATE: 'Private',
  FAITH_BASED: 'Faith-based',
  NGO: 'Non-governmental',
};

/** Kenya's 47 counties, for consistent facility records. */
export const KENYAN_COUNTIES = [
  'Baringo',
  'Bomet',
  'Bungoma',
  'Busia',
  'Elgeyo-Marakwet',
  'Embu',
  'Garissa',
  'Homa Bay',
  'Isiolo',
  'Kajiado',
  'Kakamega',
  'Kericho',
  'Kiambu',
  'Kilifi',
  'Kirinyaga',
  'Kisii',
  'Kisumu',
  'Kitui',
  'Kwale',
  'Laikipia',
  'Lamu',
  'Machakos',
  'Makueni',
  'Mandera',
  'Marsabit',
  'Meru',
  'Migori',
  'Mombasa',
  'Murang’a',
  'Nairobi',
  'Nakuru',
  'Nandi',
  'Narok',
  'Nyamira',
  'Nyandarua',
  'Nyeri',
  'Samburu',
  'Siaya',
  'Taita-Taveta',
  'Tana River',
  'Tharaka-Nithi',
  'Trans Nzoia',
  'Turkana',
  'Uasin Gishu',
  'Vihiga',
  'Wajir',
  'West Pokot',
] as const;
