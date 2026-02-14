import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useBluetooth } from '@/hooks/use-bluetooth';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const bt = useBluetooth();
  const isConnected = bt.connectionState === 'connected';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: true,
        tabBarStyle: { backgroundColor: Colors[colorScheme ?? 'light'].background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Device',
          headerShown: isConnected,
          tabBarStyle: isConnected ? { backgroundColor: Colors[colorScheme ?? 'light'].background } : { display: 'none' },
          tabBarIcon: ({ color, size }) => <Ionicons name="bluetooth" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Data',
          tabBarIcon: ({ color, size }) => <Ionicons name="pulse" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
