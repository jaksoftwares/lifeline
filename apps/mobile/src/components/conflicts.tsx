import { CREW_ACTION_LABELS } from '@lifeline/domain';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Conflict } from '../sync/queue';
import { queue } from '../sync/runtime';
import { colors } from '../theme';

/** Updates the server refused, e.g. the trip was reassigned while the phone was offline. */
export function Conflicts({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.title}>
        {conflicts.length === 1
          ? 'An update wasn’t recorded'
          : `${conflicts.length} updates weren’t recorded`}
      </Text>
      {conflicts.map((c) => (
        <View key={c.clientId} style={styles.item}>
          <Text style={styles.text}>
            “{CREW_ACTION_LABELS[c.status]}”: {c.message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void queue.dismissConflict(c.clientId)}
            style={styles.dismiss}
          >
            <Text style={styles.link}>OK</Text>
          </Pressable>
        </View>
      ))}
      <Text style={styles.hint}>Call your dispatcher if you’re unsure what to do.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    margin: 16,
    marginBottom: 0,
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: colors.surface,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, fontSize: 15, color: colors.ink },
  dismiss: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 16, fontWeight: '600', color: colors.tealDeep },
  hint: { fontSize: 13, color: colors.slate },
});
