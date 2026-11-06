import type {
  AmbulanceType,
  HandoverCondition,
  Service,
  TransferEventType,
  TransferStatus,
  Urgency,
} from './types';

export const SERVICES: Record<Service, string> = {
  emergency: 'Emergency',
  general: 'General ward',
  icu: 'ICU',
  hdu: 'HDU',
  maternity: 'Maternity',
  nicu: 'NICU',
  paediatrics: 'Paediatrics',
  theatre: 'Theatre',
  burns: 'Burns unit',
  dialysis: 'Dialysis',
};

export const URGENCY: Record<Urgency, string> = {
  critical: 'Critical',
  urgent: 'Urgent',
  stable: 'Stable',
};

export const AMBULANCE_TYPES: Record<AmbulanceType, string> = {
  basic: 'Basic life support',
  advanced: 'Advanced life support',
  critical_care: 'Critical care',
};

export const EQUIPMENT = [
  'oxygen',
  'monitor',
  'defibrillator',
  'ventilator',
  'incubator',
  'suction',
  'stretcher',
] as const;

export const STATUS: Record<TransferStatus, string> = {
  requested: 'Awaiting response',
  declined: 'Declined',
  accepted: 'Accepted',
  ambulance_assigned: 'Ambulance assigned',
  en_route_to_pickup: 'En route to pickup',
  patient_onboard: 'Patient onboard',
  arrived: 'Arrived',
  handed_over: 'Handed over',
  cancelled: 'Cancelled',
};

/** Badge colour per status. */
export const STATUS_TONE: Record<
  TransferStatus,
  'neutral' | 'brand' | 'red' | 'amber' | 'green' | 'blue'
> = {
  requested: 'amber',
  declined: 'red',
  accepted: 'brand',
  ambulance_assigned: 'blue',
  en_route_to_pickup: 'blue',
  patient_onboard: 'blue',
  arrived: 'brand',
  handed_over: 'green',
  cancelled: 'neutral',
};

export const URGENCY_TONE: Record<Urgency, 'red' | 'amber' | 'green'> = {
  critical: 'red',
  urgent: 'amber',
  stable: 'green',
};

/** Statuses where the transfer is still in progress. */
export const ACTIVE_STATUSES: TransferStatus[] = [
  'requested',
  'declined',
  'accepted',
  'ambulance_assigned',
  'en_route_to_pickup',
  'patient_onboard',
  'arrived',
];

/** Timeline wording. */
export const EVENT_LABEL: Record<TransferEventType, string> = {
  requested: 'Transfer requested',
  redirected: 'Sent to another hospital',
  declined: 'Declined by receiving hospital',
  accepted: 'Accepted by receiving hospital',
  ambulance_requested: 'Ambulance requested',
  ambulance_declined: 'Ambulance request declined',
  ambulance_assigned: 'Ambulance and driver assigned',
  en_route_to_pickup: 'Ambulance on the way to pickup',
  patient_onboard: 'Patient onboard',
  arrived: 'Arrived at receiving hospital',
  handed_over: 'Patient handed over',
  cancelled: 'Transfer cancelled',
};

export const CONDITION_LABEL: Record<HandoverCondition, string> = {
  improved: 'Improved',
  stable: 'Stable',
  deteriorated: 'Deteriorated',
  deceased: 'Deceased',
};

export const COUNTIES = [
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
  "Murang'a",
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
