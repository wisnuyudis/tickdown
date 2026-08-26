/**
 * Tickdown — SLA timers that only count down during working hours.
 *
 * @format
 */

import React from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSecurityAlert } from './src/state/useSecurityAlert';
import { HomeScreen } from './src/ui/HomeScreen';
import { SecuritySheet } from './src/ui/SecuritySheet';
import { dark, light } from './src/ui/theme';

function App() {
  const scheme = useColorScheme();
  const { alert, dismiss } = useSecurityAlert();

  return (
    <SafeAreaProvider>
      <HomeScreen />
      <SecuritySheet alert={alert} palette={scheme === 'dark' ? dark : light} onDismiss={dismiss} />
    </SafeAreaProvider>
  );
}

export default App;
