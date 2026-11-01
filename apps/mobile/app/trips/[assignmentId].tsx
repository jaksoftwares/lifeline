import {
  CAPABILITY_LABELS,
  CREW_ACTION_LABELS,
  CREW_QUALIFICATION_LABELS,
  type CrewStatus,
  equipmentName,
  formatAge,
  nextCrewStatus,
  SEX_LABELS,
  TRANSFER_STATUS_LABELS,
} from '@lifeline/domain';
import { type CrewTrip } from '@lifeline/schemas';
import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../src/components/button';
import { Conflicts } from '../../src/components/conflicts';
import { formatTime } from '../../src/components/format';
import { StatusStrip } from '../../src/components/status-strip';
import { effectiveStatus } from '../../src/sync/queue';
import { recordStatus, useQueue } from '../../src/sync/runtime';
import { colors, text, TOUCH } from '../../src/theme';

export default function TripScreen() {
  // The screen stays on during a trip so the next action is always one tap away.
  useKeepAwake();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const snapshot = useQueue();
  const trip = snapshot.trips.find((t) => t.assignmentId === assignmentId);
  const conflicts = snapshot.conflicts.filter((c) => c.assignmentId === assignmentId);

  if (!trip) {
    return (
      <View style={{ flex: 1 }}>
        <StatusStrip />
        <Conflicts conflicts={conflicts} />
        <View style={styles.section}>
          <Text style={text.heading}>This trip is no longer assigned to you</Text>
          <Text style={text.small}>
            It may have been completed, reassigned or cancelled. Call your dispatcher if you’re
            unsure.
          </Text>
        </View>
      </View>
    );
  }

  const pending = snapshot.statuses.filter((s) => s.assignmentId === trip.assignmentId);
  const status = effectiveStatus(trip, pending);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: trip.reference }} />
      <StatusStrip />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Conflicts conflicts={conflicts} />
        <View style={styles.section}>
          <Text style={text.label}>Status</Text>
          <Text style={styles.status}>{TRANSFER_STATUS_LABELS[status]}</Text>
          {pending.length > 0 && (
            <Text style={text.small}>
              Saved on this phone at {formatTime(pending.at(-1)!.occurredAt)}. It will be sent with
              the time you pressed it.
            </Text>
          )}
          <Actions trip={trip} status={status} />
        </View>

        <Place
          label="Collect from"
          name={trip.pickup.name}
          detail={trip.pickup.address}
          phone={trip.pickup.phone}
          latitude={trip.pickup.latitude}
          longitude={trip.pickup.longitude}
        />
        <Place
          label="Take to"
          name={trip.destination.name}
          detail={trip.destination.department?.name ?? trip.destination.address}
          phone={trip.destination.department?.phone ?? trip.destination.phone}
          latitude={trip.destination.latitude}
          longitude={trip.destination.longitude}
        />

        <View style={styles.section}>
          <Text style={text.label}>Patient</Text>
          <Text style={text.heading}>{trip.patient.displayName}</Text>
          <Text style={text.body}>
            {SEX_LABELS[trip.patient.sex]}, {formatAge(trip.patient.ageYears)}
          </Text>
          <Text style={text.body}>
            {CAPABILITY_LABELS[trip.requiredCapability]}
            {trip.requiredEquipment.length > 0 &&
              ` · ${trip.requiredEquipment.map(equipmentName).join(', ')}`}
          </Text>
          {trip.notes && <Text style={[text.body, styles.notes]}>{trip.notes}</Text>}
          {trip.readyAt && <Text style={text.small}>Ready from {formatTime(trip.readyAt)}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={text.label}>Crew and vehicle</Text>
          {trip.vehicle && (
            <Text style={text.body}>
              {trip.vehicle.registration}
              {trip.vehicle.callSign ? ` (${trip.vehicle.callSign})` : ''}
            </Text>
          )}
          {trip.crew.map((c) => (
            <Text key={c.fullName} style={text.small}>
              {c.fullName}, {CREW_QUALIFICATION_LABELS[c.qualification]}
            </Text>
          ))}
          {trip.dispatcherPhone && (
            <Button
              label={`Call dispatch ${trip.dispatcherPhone}`}
              variant="secondary"
              onPress={() => void Linking.openURL(`tel:${trip.dispatcherPhone}`)}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** One large button for the next step, and a way to report a problem on the road. */
function Actions({ trip, status }: { trip: CrewTrip; status: CrewTrip['status'] }) {
  const next = nextCrewStatus(status);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const canReport = status === 'PATIENT_COLLECTED' || status === 'IN_TRANSIT';

  function confirm(target: CrewStatus) {
    // A confirmation step, because a mistaken tap is recorded and shared with both facilities.
    Alert.alert(CREW_ACTION_LABELS[target], `Record “${TRANSFER_STATUS_LABELS[target]}” now?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Record', onPress: () => void recordStatus(trip.assignmentId, target) },
    ]);
  }

  if (status === 'ARRIVED') {
    return (
      <Text style={text.body}>
        Hand the patient over to the receiving team. Handover is recorded by the receiving facility.
      </Text>
    );
  }

  return (
    <View style={{ gap: 12, marginTop: 8 }}>
      {next && (
        <Button
          large
          label={status === 'INTERRUPTED' ? 'Continue the journey' : CREW_ACTION_LABELS[next]}
          onPress={() => confirm(next)}
        />
      )}
      {canReport && !reporting && (
        <Button
          label={CREW_ACTION_LABELS.INTERRUPTED}
          variant="critical"
          onPress={() => setReporting(true)}
        />
      )}
      {reporting && (
        <View style={{ gap: 8 }}>
          <Text style={styles.fieldLabel}>What happened?</Text>
          <TextInput
            accessibilityLabel="What happened?"
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Flat tyre; patient stable"
            multiline
          />
          <Button
            label="Send report"
            variant="critical"
            disabled={note.trim().length < 3}
            onPress={() => {
              void recordStatus(trip.assignmentId, 'INTERRUPTED', { note: note.trim() });
              setReporting(false);
              setNote('');
            }}
          />
          <Button label="Cancel" variant="secondary" onPress={() => setReporting(false)} />
        </View>
      )}
    </View>
  );
}

function Place({
  label,
  name,
  detail,
  phone,
  latitude,
  longitude,
}: {
  label: string;
  name: string;
  detail: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  return (
    <View style={styles.section}>
      <Text style={text.label}>{label}</Text>
      <Text style={text.heading}>{name}</Text>
      {detail && <Text style={text.small}>{detail}</Text>}
      <View style={styles.buttons}>
        {phone && (
          <View style={{ flex: 1 }}>
            <Button
              label="Call"
              variant="secondary"
              onPress={() => void Linking.openURL(`tel:${phone}`)}
            />
          </View>
        )}
        {latitude != null && longitude != null && (
          <View style={{ flex: 1 }}>
            <Button
              label="Directions"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
                )
              }
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  status: { fontSize: 24, fontWeight: '700', color: colors.navy },
  notes: { backgroundColor: colors.surfaceBlue, padding: 10, borderRadius: 8 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 6 },
  fieldLabel: { fontSize: 15, fontWeight: '600', color: colors.ink },
  input: {
    minHeight: TOUCH * 1.5,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
    textAlignVertical: 'top',
    color: colors.ink,
  },
});
