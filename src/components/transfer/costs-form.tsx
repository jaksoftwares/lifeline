import { saveTripCosts } from '@/app/(app)/transfers/actions';
import { ActionForm } from '../form';
import { Field, Input } from '../ui';

/** Consumables and other trip costs, entered by the driver or the provider. Fuel is automatic. */
export function CostsForm({
  transferId,
  consumables,
  other,
}: {
  transferId: string;
  consumables: number | null;
  other: number | null;
}) {
  return (
    <ActionForm
      action={saveTripCosts.bind(null, transferId)}
      submit="Save costs"
      variant="secondary"
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Consumables (KES)" hint="Oxygen, drugs">
          <Input
            name="consumables_cost"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={consumables ?? ''}
          />
        </Field>
        <Field label="Other costs (KES)" hint="Tolls, other">
          <Input
            name="other_cost"
            type="number"
            inputMode="numeric"
            min={0}
            defaultValue={other ?? ''}
          />
        </Field>
      </div>
    </ActionForm>
  );
}
