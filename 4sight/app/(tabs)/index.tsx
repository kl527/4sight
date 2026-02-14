import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBluetooth } from '@/hooks/use-bluetooth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { BleDevice } from '@/features/bluetooth/bluetooth-manager';

export default function DeviceScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const bt = useBluetooth();

  const isConnected = bt.connectionState === 'connected';
  const isConnecting = bt.connectionState === 'connecting';
  const isScanning = bt.isScanning;
  const bluetoothOff = bt.bluetoothState !== 'poweredOn';

  const handleDevicePress = (device: BleDevice) => {
    bt.connect(device.id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Bluetooth state banner */}
      {bluetoothOff && (
        <View style={styles.banner}>
          <Ionicons name="bluetooth-outline" size={18} color="#fff" />
          <Text style={styles.bannerText}>
            Bluetooth is {bt.bluetoothState === 'unknown' ? 'initializing...' : bt.bluetoothState}
          </Text>
        </View>
      )}

      {/* Error banner */}
      {bt.lastError && (
        <View style={[styles.banner, { backgroundColor: '#dc3545' }]}>
          <Text style={styles.bannerText}>{bt.lastError.message}</Text>
        </View>
      )}

      {isConnected ? (
        /* ── Connected State ── */
        <View style={styles.connectedContainer}>
          <Ionicons name="checkmark-circle" size={64} color="#28a745" />
          <Text style={[styles.deviceName, { color: colors.text }]}>
            {bt.connectedDeviceName}
          </Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>Connected</Text>

          {bt.deviceStatus && (
            <View style={styles.statusGrid}>
              <StatusItem
                icon="battery-half"
                label="Battery"
                value={`${bt.deviceStatus.battery}%`}
                color={colors.text}
              />
              <StatusItem
                icon="radio-button-on"
                label="Recording"
                value={bt.deviceStatus.recordingMode ? 'Active' : 'Off'}
                color={colors.text}
              />
              <StatusItem
                icon="cloud-upload"
                label="Queued"
                value={`${bt.deviceStatus.queueLen} windows`}
                color={colors.text}
              />
            </View>
          )}

          <View style={styles.actionRow}>
            {bt.deviceStatus?.recordingMode ? (
              <ActionButton
                label="Stop Recording"
                icon="stop-circle"
                onPress={bt.stopRecording}
                color="#dc3545"
                disabled={bt.isDownloading}
              />
            ) : (
              <ActionButton
                label="Start Recording"
                icon="play-circle"
                onPress={bt.startRecording}
                color="#28a745"
                disabled={bt.isDownloading}
              />
            )}
          </View>

          <TouchableOpacity style={styles.disconnectButton} onPress={bt.disconnect}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── Disconnected / Scanning State ── */
        <View style={styles.scanContainer}>
          <Ionicons
            name="bluetooth"
            size={64}
            color={colors.tint}
            style={{ marginBottom: 16 }}
          />
          <Text style={[styles.title, { color: colors.text }]}>4sight Device</Text>
          <Text style={[styles.subtitle, { color: colors.icon }]}>
            Scan for your Bangle.js watch
          </Text>

          <TouchableOpacity
            style={[
              styles.scanButton,
              { backgroundColor: colors.tint },
              (isScanning || isConnecting || bluetoothOff) && styles.buttonDisabled,
            ]}
            onPress={isScanning ? bt.stopScanning : bt.startScanning}
            disabled={isConnecting || bluetoothOff}
          >
            {isScanning ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.scanButtonText}>Stop Scanning</Text>
              </>
            ) : isConnecting ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.scanButtonText}>Connecting...</Text>
              </>
            ) : (
              <>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.scanButtonText}>Scan for Devices</Text>
              </>
            )}
          </TouchableOpacity>

          <FlatList
            data={bt.discoveredDevices}
            keyExtractor={(item) => item.id}
            style={styles.deviceList}
            contentContainerStyle={bt.discoveredDevices.length === 0 ? styles.emptyList : undefined}
            ListEmptyComponent={
              isScanning ? (
                <Text style={[styles.emptyText, { color: colors.icon }]}>Searching...</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.deviceRow, { borderBottomColor: colors.icon + '30' }]}
                onPress={() => handleDevicePress(item)}
                disabled={isConnecting}
              >
                <Ionicons name="watch-outline" size={24} color={colors.tint} />
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceRowName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.deviceRowId, { color: colors.icon }]}>
                    Signal: {item.rssi} dBm
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.icon} />
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

function StatusItem({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.statusItem}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.statusLabel, { color }]}>{label}</Text>
      <Text style={[styles.statusValue, { color }]}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  color,
  disabled,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, { backgroundColor: color }, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={styles.actionButtonText}>{label}</Text>
    </TouchableOpacity>
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

  // Scan state
  scanContainer: { flex: 1, alignItems: 'center', paddingTop: 48 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 24 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  scanButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  deviceList: { width: '100%', paddingHorizontal: 16 },
  emptyList: { alignItems: 'center', paddingTop: 32 },
  emptyText: { fontSize: 14 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deviceInfo: { flex: 1 },
  deviceRowName: { fontSize: 16, fontWeight: '600' },
  deviceRowId: { fontSize: 12, marginTop: 2 },

  // Connected state
  connectedContainer: { flex: 1, alignItems: 'center', paddingTop: 48 },
  deviceName: { fontSize: 22, fontWeight: '700', marginTop: 12 },
  statusGrid: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 32,
    paddingHorizontal: 16,
  },
  statusItem: { alignItems: 'center', gap: 4 },
  statusLabel: { fontSize: 12 },
  statusValue: { fontSize: 16, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 32 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  disconnectButton: { marginTop: 32, padding: 12 },
  disconnectText: { color: '#dc3545', fontSize: 15, fontWeight: '600' },
});
