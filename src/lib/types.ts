// Row types for the six Afyaline tables (see supabase/migrations).

export type OrgType = 'hospital' | 'ambulance_provider';
export type Role = 'admin' | 'staff' | 'driver';
export type Service =
  | 'emergency'
  | 'general'
  | 'icu'
  | 'hdu'
  | 'maternity'
  | 'nicu'
  | 'paediatrics'
  | 'theatre'
  | 'burns'
  | 'dialysis';
export type Urgency = 'critical' | 'urgent' | 'stable';
export type AmbulanceType = 'basic' | 'advanced' | 'critical_care';
export type AmbulanceStatus = 'available' | 'on_trip' | 'offline';
export type TransferStatus =
  | 'requested'
  | 'declined'
  | 'accepted'
  | 'ambulance_assigned'
  | 'en_route_to_pickup'
  | 'patient_onboard'
  | 'arrived'
  | 'handed_over'
  | 'cancelled';
export type HandoverCondition = 'improved' | 'stable' | 'deteriorated' | 'deceased';

export interface Organization {
  id: string;
  type: OrgType;
  name: string;
  county: string;
  address: string | null;
  phone: string;
  email: string | null;
  lat: number | null;
  lng: number | null;
  level: number | null;
  fuel_price: number | null;
  verified: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  organization_id: string | null;
  full_name: string;
  phone: string | null;
  role: Role;
  license_number: string | null;
  is_platform_admin: boolean;
  created_at: string;
}

export interface HospitalCapacity {
  hospital_id: string;
  service: Service;
  beds_available: number;
  updated_at: string;
}

export interface Ambulance {
  id: string;
  provider_id: string;
  plate: string;
  type: AmbulanceType;
  equipment: string[];
  fuel_use: number;
  status: AmbulanceStatus;
  lat: number | null;
  lng: number | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Transfer {
  id: string;
  code: string;
  sending_hospital_id: string;
  receiving_hospital_id: string;
  created_by: string | null;
  patient_name: string;
  patient_age: number | null;
  patient_sex: 'female' | 'male' | null;
  condition_summary: string;
  history: string | null;
  vitals: string | null;
  urgency: Urgency;
  service_needed: Service;
  status: TransferStatus;
  decline_reason: string | null;
  cancel_reason: string | null;
  provider_id: string | null;
  ambulance_id: string | null;
  driver_id: string | null;
  route_distance_km: number | null;
  route_duration_min: number | null;
  fuel_cost: number | null;
  consumables_cost: number | null;
  other_cost: number | null;
  total_cost: number;
  handover_received_by: string | null;
  handover_condition: HandoverCondition | null;
  handover_notes: string | null;
  requested_at: string;
  responded_at: string | null;
  ambulance_requested_at: string | null;
  assigned_at: string | null;
  departed_at: string | null;
  picked_up_at: string | null;
  arrived_at: string | null;
  handed_over_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
}

/** Timeline entries: every status change, plus a few extra events. */
export type TransferEventType =
  TransferStatus | 'redirected' | 'ambulance_requested' | 'ambulance_declined';

export interface TransferEvent {
  id: number;
  transfer_id: string;
  status: TransferEventType;
  actor_id: string | null;
  actor_name: string | null;
  organization_id: string | null;
  note: string | null;
  created_at: string;
}
