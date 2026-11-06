import type { Metadata } from 'next';
import { ActionForm } from '@/components/form';
import { PasswordInput } from '@/components/password-input';
import { Card, Field, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { updatePassword } from '../../reset-password/actions';

export const metadata: Metadata = { title: 'Change password' };

/** Everyone, drivers included, can replace the temporary password their admin gave them. */
export default async function AccountPage() {
  const { profile, organization } = await requireUser();
  return (
    <>
      <PageHeader
        title="Change password"
        description={`${profile.full_name}${organization ? ` · ${organization.name}` : ''}`}
      />
      <Card className="max-w-md p-5 sm:p-6">
        <ActionForm action={updatePassword} submit="Change password" resetOnSuccess>
          <input type="hidden" name="from" value="account" />
          <Field label="New password" hint="At least 8 characters">
            <PasswordInput name="password" autoComplete="new-password" />
          </Field>
          <Field label="Type it again">
            <PasswordInput name="confirm" autoComplete="new-password" />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}
