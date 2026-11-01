import { TRANSFER_STATUS_LABELS, URGENCY_LABELS } from '@lifeline/domain';
import { type CrewStatusUpdate, type CrewTrip } from '@lifeline/schemas';
import { Link } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../src/auth/session';
import { Conflicts } from '../../src/components/conflicts';
import { StatusStrip } from '../../src/components/status-strip';
import { effectiveStatus } from '../../src/sync/queue';
import { queue, useQueue } from '../../src/sync/runtime';
import { colors, text } from '../../src/theme';

export default function TripsScreen() {
  const { user, signOut } = useSession();
  const snapshot = useQueue();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await queue.flush();
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusStrip />
      <Conflicts conflicts={snapshot.conflicts} />
      <FlatList
        data={snapshot.trips}
        keyExtractor={(t) => t.assignmentId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        renderItem={({ item }) => <TripCard trip={item} pending={snapshot.statuses} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={text.heading}>No trips assigned to you</Text>
            <Text style={text.small}>
              {snapshot.lastSyncAt
                ? 'Your dispatcher confirms trips on Lifeline. Pull down to check again.'
                : 'Connect to the internet to load your trips.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={text.small}>Signed in as {user?.fullName}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              disabled={snapshot.statuses.length > 0}
              style={styles.signOut}
            >
              <Text style={[styles.link, snapshot.statuses.length > 0 && { color: colors.muted }]}>
                {snapshot.statuses.length > 0 ? 'Sign out after your updates are sent' : 'Sign out'}
              </Text>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

function TripCard({ trip, pending }: { trip: CrewTrip; pending: CrewStatusUpdate[] }) {
  const status = effectiveStatus(trip, pending);
  const unsent = pending.some((p) => p.assignmentId === trip.assignmentId);
  return (
    <Link
      href={{ pathname: '/trips/[assignmentId]', params: { assignmentId: trip.assignmentId } }}
      asChild
    >
      <Pressable accessibilityRole="button" style={styles.card}>
        <View style={styles.cardTop}>
          <Text
            style={[styles.urgency, trip.urgency === 'EMERGENCY' && { color: colors.critical }]}
          >
            {trip.urgency ? URGENCY_LABELS[trip.urgency] : 'Urgency not set'}
          </Text>
          <Text style={text.small}>{trip.reference}</Text>
        </View>
        <Text style={text.heading}>{trip.patient.displayName}</Text>
        <Text style={text.body}>
          {trip.pickup.name} → {trip.destination.name}
        </Text>
        <Text style={styles.status}>
          {TRANSFER_STATUS_LABELS[status]}
          {unsent ? ' · saved on this phone' : ''}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  urgency: { fontSize: 14, fontWeight: '700', color: colors.warning, textTransform: 'uppercase' },
  status: { fontSize: 15, fontWeight: '600', color: colors.tealDeep },
  empty: { padding: 24, gap: 8, alignItems: 'center' },
  footer: { paddingVertical: 24, alignItems: 'center', gap: 8 },
  signOut: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 16, color: colors.tealDeep, fontWeight: '600' },
});
