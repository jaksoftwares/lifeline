import { useNetworkState } from 'expo-network';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocationAccess } from '../location/tracking';
import { useQueue } from '../sync/runtime';
import { colors } from '../theme';
import { formatAgo } from './format';

/**
 * Always on screen: whether the phone is online, how many updates are waiting to be sent, when the
 * last sync happened, and whether Lifeline may use location. Each is in words, not only colour.
 */
export function StatusStrip() {
  const network = useNetworkState();
  const queue = useQueue();
  const location = useLocationAccess();
  const online = network.isConnected !== false && network.isInternetReachable !== false;
  const waiting = queue.statuses.length;

  return (
    <View style={styles.strip} accessibilityRole="summary">
      <View style={styles.row}>
        <Dot color={online ? colors.success : colors.warning} />
        <Text style={styles.text}>
          {online ? 'Online' : 'No connection'}
          {waiting > 0
            ? ` · ${waiting} ${waiting === 1 ? 'update' : 'updates'} saved on this phone`
            : queue.syncing
              ? ' · sending…'
              : queue.lastSyncAt
                ? ` · synced ${formatAgo(queue.lastSyncAt)}`
                : ''}
        </Text>
      </View>
      {!online && waiting > 0 && (
        <Text style={styles.hint}>They’ll be sent automatically when you have signal.</Text>
      )}
      {(location.access !== 'ALWAYS' || !location.servicesOn) && location.access !== 'UNKNOWN' && (
        <Pressable
          onPress={() => void location.request()}
          style={styles.row}
          accessibilityRole="button"
          accessibilityHint="Opens the location permission request"
        >
          <Dot
            color={
              location.access === 'OFF' || !location.servicesOn ? colors.critical : colors.warning
            }
          />
          <Text style={[styles.text, styles.link]}>
            {!location.servicesOn
              ? 'Location is switched off on this phone'
              : location.access === 'OFF'
                ? 'Location not allowed. Tap to allow'
                : 'Location only while the app is open. Tap to allow always'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function Dot({ color }: { color: string }) {
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: colors.surfaceBlue,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { fontSize: 14, color: colors.ink, flexShrink: 1 },
  hint: { fontSize: 13, color: colors.slate, marginLeft: 18 },
  link: { textDecorationLine: 'underline' },
});
