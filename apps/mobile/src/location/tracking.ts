import AsyncStorage from '@react-native-async-storage/async-storage';
import { type TransferStatus } from '@lifeline/domain';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { recordLocations } from '../sync/runtime';

const LOCATION_TASK = 'lifeline-trip-location';
const ACTIVE_TRIP_KEY = 'lifeline.activeAssignmentId';

/** Positions are shared only while the ambulance is on its way or carrying the patient. */
const TRACKED: readonly TransferStatus[] = [
  'DISPATCHED',
  'AT_PICKUP',
  'PATIENT_COLLECTED',
  'IN_TRANSIT',
  'INTERRUPTED',
];

export function shouldTrack(status: TransferStatus): boolean {
  return TRACKED.includes(status);
}

// Must be defined when the JavaScript bundle loads, so the OS can wake the app with new fixes.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data) return;
    const assignmentId = await AsyncStorage.getItem(ACTIVE_TRIP_KEY);
    if (!assignmentId) return;
    await recordLocations(
      data.locations.map((l) => ({
        assignmentId,
        recordedAt: new Date(l.timestamp).toISOString(),
        latitude: l.coords.latitude,
        longitude: l.coords.longitude,
        accuracy: l.coords.accuracy ?? null,
        speed: l.coords.speed != null && l.coords.speed >= 0 ? l.coords.speed : null,
        heading: l.coords.heading != null && l.coords.heading >= 0 ? l.coords.heading : null,
      })),
    );
  },
);

/** Starts sharing positions for a trip. Returns false when permission is missing. */
export async function startTracking(assignmentId: string): Promise<boolean> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return false;
  await AsyncStorage.setItem(ACTIVE_TRIP_KEY, assignmentId);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 30_000,
    distanceInterval: 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    activityType: Location.ActivityType.AutomotiveNavigation,
    // Android keeps the app alive with a visible notification while positions are shared.
    foregroundService: {
      notificationTitle: 'Lifeline is sharing your location',
      notificationBody: 'Only during this transfer. It stops when you arrive.',
    },
  });
  return true;
}

export async function stopTracking(): Promise<void> {
  await AsyncStorage.removeItem(ACTIVE_TRIP_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}

export type LocationAccess = 'ALWAYS' | 'WHILE_OPEN' | 'OFF' | 'UNKNOWN';

/** What the phone lets Lifeline do with location, re-checked whenever the app comes back. */
export function useLocationAccess() {
  const [access, setAccess] = useState<LocationAccess>('UNKNOWN');
  const [servicesOn, setServicesOn] = useState(true);

  const check = useCallback(async () => {
    const [fg, bg, enabled] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
      Location.hasServicesEnabledAsync(),
    ]);
    setServicesOn(enabled);
    setAccess(bg.granted ? 'ALWAYS' : fg.granted ? 'WHILE_OPEN' : 'OFF');
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
  }, [check]);

  /** Asks for "while using", then "always", as both platforms require. */
  const request = useCallback(async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.granted) await Location.requestBackgroundPermissionsAsync();
    await check();
  }, [check]);

  return { access, servicesOn, request };
}

/** Starts or stops sharing to match the trips' current state. */
export async function reconcileTracking(
  trips: { assignmentId: string; status: TransferStatus }[],
): Promise<void> {
  const active = trips.find((t) => shouldTrack(t.status));
  if (active) await startTracking(active.assignmentId);
  else await stopTracking();
}
