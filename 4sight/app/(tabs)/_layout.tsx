import { Tabs, usePathname, useRouter } from 'expo-router';
import React from 'react';
import { View, TouchableOpacity, Text, Image, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

function HomeIcon({ active }: { active: boolean }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
      <Path
        d="M19.8621 9.59103L10.4552 0.176014C10.2207 -0.0586713 9.84828 -0.0586713 9.61379 0.176014L0.151724 9.38395C0.0551724 9.48059 0 9.60483 0 9.74288V19.3097C0 19.5997 0.17931 19.8343 0.427586 19.9448V20H19.3241C19.6966 20 20 19.6963 20 19.3236V9.96376C20 9.82571 19.9448 9.70147 19.8483 9.60483L19.8621 9.59103ZM10.0138 12.7524C11.931 12.7524 13.4759 14.2985 13.4759 16.2174V18.8818H6.55172V16.2174C6.55172 14.2985 8.09655 12.7524 10.0138 12.7524Z"
        fill={active ? '#1B1B1B' : '#979592'}
      />
    </Svg>
  );
}

function TrendsIcon({ active }: { active: boolean }) {
  return (
    <Svg width={19} height={20} viewBox="0 0 19 20" fill="none">
      <Path
        d="M2.27137 0C1.02212 0 0 1.05882 0 2.35294V17.6471C0 18.9412 1.02212 20 2.27137 20C3.52062 20 4.54274 18.9412 4.54274 17.6471V2.35294C4.54274 1.05882 3.52062 0 2.27137 0Z"
        fill={active ? '#1B1B1B' : '#979592'}
      />
      <Path
        d="M16.7286 10.5883C15.4794 10.5883 14.4573 11.6471 14.4573 12.9412V17.6471C14.4573 18.9412 15.4794 20 16.7286 20C17.9779 20 19 18.9412 19 17.6471V12.9412C19 11.6471 17.9779 10.5883 16.7286 10.5883Z"
        fill={active ? '#1B1B1B' : '#979592'}
      />
      <Path
        d="M9.4489 5.84703C8.22236 5.84703 7.22296 6.88232 7.22296 8.15291V17.6706C7.22296 18.9411 8.22236 19.9764 9.4489 19.9764H9.55111C10.7777 19.9764 11.7771 18.9411 11.7771 17.6706V8.14115C11.7771 6.87056 10.7777 5.83527 9.46026 5.83527L9.4489 5.84703Z"
        fill={active ? '#1B1B1B' : '#979592'}
      />
    </Svg>
  );
}

function FoursightIcon() {
  return (
    <Image
      source={require('@/assets/ai.png')}
      style={{ width: 20, height: 19, tintColor: '#FFFFFF' }}
      resizeMode="contain"
    />
  );
}

function CustomTabBar() {
  const pathname = usePathname();
  const router = useRouter();

  const isHome = pathname === '/' || pathname === '/index';
  const isTrends = pathname === '/trends';
  const isFoursight = pathname === '/foursight';

  return (
    <View style={styles.tabBarWrapper}>
      <View style={styles.tabBarContainer}>
        {/* Home button */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.navigate('/')}
          activeOpacity={0.7}
        >
          <HomeIcon active={isHome} />
        </TouchableOpacity>

        {/* Trends button */}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.navigate('/trends')}
          activeOpacity={0.7}
        >
          <TrendsIcon active={isTrends} />
        </TouchableOpacity>

        <View style={{ width: 12 }} />

        {/* 4sight button */}
        <TouchableOpacity
          style={[styles.foursightButton, isFoursight && styles.foursightButtonActive]}
          onPress={() => router.navigate('/foursight')}
          activeOpacity={0.7}
        >
          <FoursightIcon />
          <Text style={styles.foursightText}>4sight</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <View style={styles.root}>
      <Tabs
        tabBar={() => <CustomTabBar />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="trends" />
        <Tabs.Screen name="foursight" />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDECE7',
  },
  tabBarWrapper: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F1ED',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 7,
    height: 62,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    gap: 4,
  },
  iconButton: {
    width: 52,
    height: 41,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foursightButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B1B1B',
    borderRadius: 47,
    height: 41,
    paddingHorizontal: 23,
    gap: 13,
  },
  foursightButtonActive: {
    backgroundColor: '#333333',
  },
  foursightText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'System',
    fontWeight: '500',
  },
});
