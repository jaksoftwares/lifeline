import { type InstitutionType } from '@lifeline/domain';

export interface InstitutionSummary {
  id: string;
  networkId: string;
  type: InstitutionType;
  name: string;
  code: string;
  level: number | null;
  county: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  latitude: number | null;
  longitude: number | null;
}
