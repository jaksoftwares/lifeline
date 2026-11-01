import AsyncStorage from '@react-native-async-storage/async-storage';
import { permissionSummary } from '@lifeline/domain';
import { type AuthStepResponse, type CurrentUser } from '@lifeline/schemas';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  api,
  ApiError,
  clearTokens,
  hasSavedSession,
  saveTokens,
  SESSION_ENDED,
} from '../api/client';
import { stopTracking } from '../location/tracking';
import { queue } from '../sync/runtime';

const USER_KEY = 'lifeline.user';

/** Where sign-in has got to. Two-step setup is done on the website, not the phone. */
export type SignInStep =
  | { step: 'CREDENTIALS' }
  | { step: 'NEW_PASSWORD'; challengeToken: string }
  | { step: 'CODE'; challengeToken: string };

interface SessionValue {
  status: 'loading' | 'signedOut' | 'signedIn';
  user: CurrentUser | null;
  /** Each call advances one sign-in step; returns the next step, or null once signed in. */
  submit: (
    step: SignInStep,
    values: { email?: string; password?: string; newPassword?: string; code?: string },
  ) => Promise<SignInStep | null>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function isCrew(user: CurrentUser): boolean {
  const grants = user.memberships.map((m) => ({
    role: m.role,
    networkId: m.network.id,
    institutionId: m.institution?.id ?? null,
  }));
  return permissionSummary(grants).includes('trip:update');
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue['status']>('loading');
  const [user, setUser] = useState<CurrentUser | null>(null);

  // Restore the saved session. With no signal the crew keeps working from the cached profile.
  useEffect(() => {
    void (async () => {
      if (!(await hasSavedSession())) return setStatus('signedOut');
      const cached = await AsyncStorage.getItem(USER_KEY);
      if (cached) {
        setUser(JSON.parse(cached) as CurrentUser);
        setStatus('signedIn');
      }
      try {
        const me = await api<CurrentUser>('/auth/me');
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(me));
        setUser(me);
        setStatus('signedIn');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearTokens();
          setUser(null);
          setStatus('signedOut');
        } else if (!cached) {
          setStatus('signedOut');
        }
      }
    })();
  }, []);

  const finish = useCallback(async (res: AuthStepResponse): Promise<SignInStep | null> => {
    if (res.step === 'PASSWORD_CHANGE_REQUIRED')
      return { step: 'NEW_PASSWORD', challengeToken: res.challengeToken };
    if (res.step === 'MFA_REQUIRED') return { step: 'CODE', challengeToken: res.challengeToken };
    if (res.step !== 'AUTHENTICATED') {
      throw new ApiError(
        'Set up two-step verification on the Lifeline website first, then sign in here.',
        403,
      );
    }
    if (!res.tokens) throw new ApiError('Sign-in failed. Try again.', 500);
    if (!isCrew(res.user)) {
      throw new ApiError(
        'This app is for ambulance crew. Use the Lifeline website for your role.',
        403,
      );
    }
    await saveTokens(res.tokens);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
    setUser(res.user);
    setStatus('signedIn');
    return null;
  }, []);

  const submit = useCallback<SessionValue['submit']>(
    async (step, values) => {
      if (step.step === 'CREDENTIALS') {
        return finish(
          await api<AuthStepResponse>('/auth/login', {
            method: 'POST',
            body: { email: values.email, password: values.password },
          }),
        );
      }
      if (step.step === 'NEW_PASSWORD') {
        return finish(
          await api<AuthStepResponse>('/auth/password/initial', {
            method: 'POST',
            body: { challengeToken: step.challengeToken, newPassword: values.newPassword },
          }),
        );
      }
      return finish(
        await api<AuthStepResponse>('/auth/mfa/verify', {
          method: 'POST',
          body: { challengeToken: step.challengeToken, code: values.code },
        }),
      );
    },
    [finish],
  );

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await stopTracking();
    await queue.clear();
    await clearTokens();
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(() => ({ status, user, submit, signOut }), [status, user, submit, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export { SESSION_ENDED };
