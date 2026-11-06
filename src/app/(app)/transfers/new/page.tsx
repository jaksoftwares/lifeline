import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { requireMemberPage } from '@/lib/actions';
import { getHospitalOptions } from '@/lib/queries';
import { NewTransferForm } from './new-transfer-form';

export const metadata: Metadata = { title: 'New transfer' };

export default async function NewTransferPage() {
  const { organization } = await requireMemberPage('hospital');
  const hospitals = await getHospitalOptions(organization);
  return (
    <>
      <PageHeader
        title="New transfer"
        description="The receiving hospital is alerted immediately."
      />
      <NewTransferForm hospitals={hospitals} />
    </>
  );
}
