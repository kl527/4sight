import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import {
  Lato_400Regular,
  Lato_700Bold,
  Lato_900Black,
} from '@expo-google-fonts/lato';
import {
  Merriweather_400Regular,
  Merriweather_500Medium,
  Merriweather_700Bold,
} from '@expo-google-fonts/merriweather';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { Colors } from '@/constants/theme';
import ExpoMetaGlasses from '@/modules/modules';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'pairing',
};

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.light.background,
    text: Colors.light.text,
    card: Colors.light.background,
    border: Colors.light.background,
  },
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Lato_400Regular,
    Lato_700Bold,
    Lato_900Black,
    Merriweather_400Regular,
    Merriweather_500Medium,
    Merriweather_700Bold,
  });

  useEffect(() => {
    const configurePromise = ExpoMetaGlasses.configure();
    configurePromise.catch(console.error);

    const handleIncomingUrl = (url: string) => {
      configurePromise
        .then(() => ExpoMetaGlasses.handleUrl(url))
        .catch(console.error);
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          handleIncomingUrl(url);
        }
      })
      .catch(console.error);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={AppTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="pairing" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="device" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
      <StatusBar style="dark" />
    </ThemeProvider>
  );
}
