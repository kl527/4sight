import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useBluetooth } from '@/hooks/use-bluetooth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const CONNECT_GREEN = '#B7D7A8';
const CONNECT_GREEN_DARK = '#8EC278';

function WatchIcon({ size = 48, color = '#1B1B1B' }: { size?: number; color?: string }) {
  const scale = size / 45;
  return (
    <Svg width={30 * scale} height={45 * scale} viewBox="0 0 30 45" fill="none">
      <Path
        d="M7.84591 0C6.65684 0 5.51648 0.472354 4.67568 1.31315C3.83489 2.15395 3.36253 3.29431 3.36253 4.48338V7.37516C4.40043 6.9582 5.53697 6.72507 6.72506 6.72507H20.1752C21.3274 6.72371 22.4691 6.94443 23.5377 7.37516V4.48338C23.5377 3.29431 23.0654 2.15395 22.2246 1.31315C21.3838 0.472354 20.2434 0 19.0544 0H7.84591ZM6.72506 8.96675C4.94147 8.96675 3.23092 9.67529 1.96973 10.9365C0.708532 12.1977 0 13.9082 0 15.6918V29.142C0 30.9255 0.708532 32.6361 1.96973 33.8973C3.23092 35.1585 4.94147 35.867 6.72506 35.867H20.1752C21.9588 35.867 23.6693 35.1585 24.9305 33.8973C26.1917 32.6361 26.9003 30.9255 26.9003 29.142V24.6586C27.4948 24.6586 28.065 24.4224 28.4854 24.002C28.9058 23.5816 29.1419 23.0114 29.1419 22.4169V20.1752C29.1419 19.5807 28.9058 19.0105 28.4854 18.5901C28.065 18.1697 27.4948 17.9335 26.9003 17.9335V15.6918C26.9003 13.9082 26.1917 12.1977 24.9305 10.9365C23.6693 9.67529 21.9588 8.96675 20.1752 8.96675H6.72506ZM6.72506 38.1087C5.57286 38.1101 4.4312 37.8893 3.36253 37.4586V40.3504C3.36253 41.5395 3.83489 42.6798 4.67568 43.5206C5.51648 44.3614 6.65684 44.8338 7.84591 44.8338H19.0544C20.2434 44.8338 21.3838 44.3614 22.2246 43.5206C23.0654 42.6798 23.5377 41.5395 23.5377 40.3504V37.4586C22.4691 37.8893 21.3274 38.1101 20.1752 38.1087H6.72506Z"
        fill={color}
      />
    </Svg>
  );
}

export default function PairingScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const bt = useBluetooth();
  const router = useRouter();

  const isConnected = bt.connectionState === 'connected';
  const isConnecting = bt.connectionState === 'connecting';
  const isScanning = bt.isScanning;
  const bluetoothOff = bt.bluetoothState !== 'poweredOn';
  const hasDevices = bt.discoveredDevices.length > 0;

  const cardBgAnim = useRef(new Animated.Value(0)).current;

  // Auto-connect to first discovered device
  useEffect(() => {
    if (isScanning && hasDevices && !isConnecting && !isConnected) {
      bt.stopScanning();
      bt.connect(bt.discoveredDevices[0].id);
    }
  }, [hasDevices, isScanning, isConnecting, isConnected]);

  // Navigate to tabs when connected
  useEffect(() => {
    if (isConnected) {
      router.replace('/');
    }
  }, [isConnected]);

  // Animate card background
  useEffect(() => {
    const target = isConnecting ? 2 : isScanning ? 1 : 0;
    Animated.timing(cardBgAnim, {
      toValue: target,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isScanning, isConnecting]);

  const cardBg = cardBgAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['#F2F1ED', CONNECT_GREEN, CONNECT_GREEN_DARK],
  });

  const handlePress = () => {
    if (bluetoothOff) return;
    if (isScanning) {
      bt.stopScanning();
    } else {
      bt.startScanning();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {bluetoothOff && (
        <View style={styles.banner}>
          <Ionicons name="bluetooth-outline" size={18} color="#fff" />
          <Text style={styles.bannerText}>
            Bluetooth is {bt.bluetoothState === 'unknown' ? 'initializing...' : bt.bluetoothState}
          </Text>
        </View>
      )}

      {bt.lastError && (
        <View style={[styles.banner, { backgroundColor: '#dc3545' }]}>
          <Text style={styles.bannerText}>{bt.lastError.message}</Text>
        </View>
      )}

      <View style={styles.scanContainer}>
        <TouchableOpacity
          onPress={handlePress}
          disabled={isConnecting || bluetoothOff}
          activeOpacity={0.8}
        >
          <Animated.View
            style={[
              styles.connectCard,
              { backgroundColor: cardBg },
              (isConnecting || bluetoothOff) && styles.buttonDisabled,
            ]}
          >
            {isScanning || isConnecting ? (
              <ActivityIndicator
                color="#1B1B1B"
                size="large"
                style={{ marginBottom: 16 }}
              />
            ) : (
              <View style={{ marginBottom: 16 }}>
                <WatchIcon size={48} color="#1B1B1B" />
              </View>
            )}
            <Text style={styles.connectCardText}>
              {isConnecting
                ? 'Connecting...'
                : isScanning
                  ? 'Searching...'
                  : 'Connect Device'}
            </Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    backgroundColor: '#f0ad4e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  scanContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  connectCard: {
    width: 311,
    height: 186,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  connectCardText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1B1B1B',
  },
  buttonDisabled: { opacity: 0.5 },
});
