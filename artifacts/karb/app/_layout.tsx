import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useFonts } from 'expo-font';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { setBaseUrl } from '@workspace/api-client-react';
import { StoreProvider } from '@/lib/store';
import colors from '@/constants/colors';
import { F } from '@/constants/type';

// Expo preview uses a separate origin; the published web app shares its origin with /api.
setBaseUrl(Platform.OS === 'web' && !__DEV__
  ? ''
  : `https://${process.env.EXPO_PUBLIC_DOMAIN}`);
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();
const c = colors.light;

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Tilbake',
        headerTintColor: c.primary,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { fontFamily: F.display, fontSize: 18, color: c.foreground },
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ title: 'Måltid' }} />
      <Stack.Screen name="entry" options={{ title: 'Legg inn data' }} />
      <Stack.Screen name="history" options={{ headerShown: false }} />
      <Stack.Screen name="meal/[id]" options={{ title: '' }} />
      <Stack.Screen name="log" options={{ title: 'Logg' }} />
      <Stack.Screen name="settings" options={{ title: 'Innstillinger' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular, Geist_500Medium, Geist_600SemiBold,
  });

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const settled = fontsLoaded || !!fontError || timedOut;

  useEffect(() => {
    if (settled) SplashScreen.hideAsync().catch(() => {});
  }, [settled]);

  if (!settled) {
    if (Platform.OS !== 'web') return null;
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Image source={require('../assets/images/icon.png')} style={{ width: 96, height: 96, borderRadius: 20 }} contentFit="contain" accessibilityLabel="Balanse-logo" />
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <StoreProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <StatusBar style="dark" />
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </StoreProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
