import { z } from 'zod';

export const reportQuerySchema = z
  .object({
    networkId: z.string().min(1),
    from: z.iso.date(),
    to: z.iso.date(),
    institutionId: z.string().min(1).optional(),
  })
  .refine(({ from, to }) => from <= to, {
    message: 'The start date must be on or before the end date.',
    path: ['from'],
  })
  .refine(
    ({ from, to }) => {
      const first = Date.parse(`${from}T00:00:00Z`);
      const last = Date.parse(`${to}T00:00:00Z`);
      return last - first <= 366 * 24 * 60 * 60 * 1000;
    },
    {
      message: 'Reports can cover up to 367 calendar days.',
      path: ['to'],
    },
  );

export const updateNetworkSettingsSchema = z.object({
  networkId: z.string().min(1),
  capacityStaleAfterMinutes: z.coerce.number().int().min(1).max(10_080),
  vehicleStatusStaleAfterMinutes: z.coerce.number().int().min(1).max(10_080),
  earlyWarningScore: z.enum(['NONE', 'MEWS', 'NEWS2']),
});

export interface ReportMetric {
  value: number | null;
  unit: 'minutes' | 'percent' | 'count' | 'currency';
  numerator: number;
  denominator: number;
}

export interface SuccessMetricsReport {
  networkId: string;
  networkName: string;
  from: string;
  to: string;
  institutionId: string | null;
  institutionName: string | null;
  generatedAt: string;
  metrics: {
    referralInitiationMinutes: ReportMetric;
    facilityAcceptanceMinutes: ReportMetric;
    referralRejectionRate: ReportMetric;
    ambulanceAssignmentMinutes: ReportMetric;
    ambulanceResponseMinutes: ReportMetric;
    patientCollectionMinutes: ReportMetric;
    transferDurationMinutes: ReportMetric;
    handoverCompletionRate: ReportMetric;
    referralCompletionRate: ReportMetric;
    ambulanceUtilisation: ReportMetric;
    transferCostTotal: ReportMetric;
    transferCostAverage: ReportMetric;
    activeInstitutions: ReportMetric;
    activeUsers: ReportMetric;
  };
}

export interface NetworkSettings {
  networkId: string;
  capacityStaleAfterMinutes: number;
  vehicleStatusStaleAfterMinutes: number;
  earlyWarningScore: 'NONE' | 'MEWS' | 'NEWS2';
}
