import { colors } from '@lifeline/tokens';
import { StyleSheet } from 'react-native';

export { colors };

/** Large targets: crews use the app in moving vehicles, often with gloves on. */
export const TOUCH = 56;

export const text = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '700', color: colors.navy },
  heading: { fontSize: 17, fontWeight: '600', color: colors.ink },
  body: { fontSize: 16, color: colors.ink, lineHeight: 22 },
  small: { fontSize: 14, color: colors.slate, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate, textTransform: 'uppercase' },
});
