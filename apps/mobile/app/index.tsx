import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '../src/auth/session';
import { colors } from '../src/theme';

export default function Index() {
  const { status } = useSession();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.navy }}>
        <ActivityIndicator color={colors.surface} accessibilityLabel="Loading" />
      </View>
    );
  }
  return <Redirect href={status === 'signedIn' ? '/trips' : '/login'} />;
}
