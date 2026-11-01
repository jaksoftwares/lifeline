import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, TOUCH } from '../theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  large,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'critical';
  disabled?: boolean;
  busy?: boolean;
  large?: boolean;
}) {
  const palette = {
    primary: { bg: colors.tealDeep, fg: colors.surface, border: colors.tealDeep },
    secondary: { bg: colors.surface, fg: colors.ink, border: colors.borderStrong },
    critical: { bg: colors.surface, fg: colors.critical, border: colors.critical },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (disabled || pressed) && { opacity: disabled ? 0.5 : 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.label, large && styles.largeLabel, { color: palette.fg }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  large: { minHeight: 88 },
  label: { fontSize: 17, fontWeight: '600' },
  largeLabel: { fontSize: 22, fontWeight: '700' },
});
