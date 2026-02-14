import { NativeTabs, Icon, Label } from 'expo-router/unstable-native-tabs';
import { useRouter, usePathname } from 'expo-router';
import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const isAI = pathname === '/ai';

  return (
    <View style={styles.root}>
      <NativeTabs
        backgroundColor="#EDECE7"
        disableTransparentOnScrollEdge
        shadowColor="transparent"
      >
        <NativeTabs.Trigger name="index">
          <Icon src={require('@/assets/home.png')} />
          <Label hidden>Home</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="explore">
          <Icon src={require('@/assets/trends.png')} />
          <Label hidden>Data</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="ai" hidden>
          <Label>AI</Label>
        </NativeTabs.Trigger>
      </NativeTabs>

      <TouchableOpacity
        style={[styles.aiButton, isAI && styles.aiButtonActive]}
        onPress={() => router.navigate('/ai')}
        activeOpacity={0.7}
      >
        <Image
          source={require('@/assets/ai.png')}
          style={styles.aiIcon}
          resizeMode="contain"
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDECE7',
  },
  aiButton: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -28,
    backgroundColor: '#B7D7A8',
    borderRadius: 28,
    height: 56,
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  aiButtonActive: {
    opacity: 0.85,
  },
  aiIcon: {
    width: 24,
    height: 24,
    tintColor: '#1B1B1B',
  },
});
