// Registers the background location task when the bundle loads, before any screen renders.
import '../src/location/tracking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../src/auth/session';
import { reconcileTracking } from '../src/location/tracking';
import { effectiveStatus } from '../src/sync/queue';
import { useAutoSync, useQueue } from '../src/sync/runtime';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Background />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.navy },
            headerTintColor: colors.surface,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: colors.surfaceSubtle },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: 'Lifeline Crew' }} />
          <Stack.Screen name="trips/index" options={{ title: 'My trips' }} />
          <Stack.Screen name="trips/[assignmentId]" options={{ title: 'Trip' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Syncing and location sharing run whatever screen is open. */
function Background() {
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  useAutoSync(signedIn);
  const queue = useQueue();
  const key = queue.trips
    .map((t) => `${t.assignmentId}:${effectiveStatus(t, queue.statuses)}`)
    .join('|');

  useEffect(() => {
    if (!signedIn) return;
    void reconcileTracking(
      queue.trips.map((t) => ({
        assignmentId: t.assignmentId,
        status: effectiveStatus(t, queue.statuses),
      })),
    );
    // Re-run only when a trip or its status changes, not on every sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, key]);
  return null;
}
