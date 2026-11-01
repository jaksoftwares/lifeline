import { PASSWORD_MIN_LENGTH } from '@lifeline/domain';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { type SignInStep, useSession } from '../src/auth/session';
import { Button } from '../src/components/button';
import { colors, text, TOUCH } from '../src/theme';

export default function LoginScreen() {
  const { status, submit } = useSession();
  const [step, setStep] = useState<SignInStep>({ step: 'CREDENTIALS' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signedIn') return <Redirect href="/trips" />;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const next = await submit(step, { email: email.trim(), password, newPassword, code });
      if (next) setStep(next);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'No connection. Signing in needs signal; you can then work offline.'
          : e instanceof Error
            ? e.message
            : 'Sign-in failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={text.title}>Sign in</Text>
        <Text style={text.small}>
          {step.step === 'CREDENTIALS'
            ? 'Use the email and password your provider gave you.'
            : step.step === 'NEW_PASSWORD'
              ? `Choose a new password of at least ${PASSWORD_MIN_LENGTH} characters.`
              : 'Enter the 6-digit code from your authenticator app.'}
        </Text>
        {error && (
          <View style={styles.error} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {step.step === 'CREDENTIALS' && (
          <>
            <Field label="Email" value={email} onChange={setEmail} keyboardType="email-address" />
            <Field label="Password" value={password} onChange={setPassword} secure />
          </>
        )}
        {step.step === 'NEW_PASSWORD' && (
          <Field label="New password" value={newPassword} onChange={setNewPassword} secure />
        )}
        {step.step === 'CODE' && (
          <Field label="Code" value={code} onChange={setCode} keyboardType="number-pad" />
        )}
        <Button label="Continue" onPress={() => void go()} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboardType?: 'email-address' | 'number-pad';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={
          secure ? 'password' : keyboardType === 'email-address' ? 'email' : 'one-time-code'
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  label: { fontSize: 15, fontWeight: '600', color: colors.ink },
  input: {
    minHeight: TOUCH,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 17,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  error: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 2,
    borderColor: colors.critical,
  },
  errorText: { color: colors.ink, fontSize: 15 },
});
