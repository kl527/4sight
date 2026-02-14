import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/constants/theme';
import { useBluetooth } from '@/hooks/use-bluetooth';
import { CircularScoreRing } from '@/components/ui/circular-score-ring';

export default function DeviceScreen() {
  const router = useRouter();
  const {
    deviceStatus,
    connectionState,
    connectedDeviceName,
    startRecording,
    stopRecording,
  } = useBluetooth();

  const isConnected = connectionState === 'connected';
  const isRecording = deviceStatus?.recording ?? false;

  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#2B2B2B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Device</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Device info card */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Ionicons name="watch-outline" size={22} color="#2B2B2B" />
          <View style={styles.cardInfo}>
            <Text style={styles.deviceName}>
              {connectedDeviceName ?? 'Bangle.js 2'}
            </Text>
            <Text style={[styles.statusText, { color: isConnected ? '#8AA97C' : '#C47A7A' }]}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Text>
          </View>
          <CircularScoreRing percentage={deviceStatus?.battery ?? 0} />
        </View>
      </View>

      {/* Recording section */}
      <Text style={styles.sectionTitle}>Recording</Text>

      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.statusDot, { backgroundColor: isRecording ? '#C47A7A' : '#B0AEA6' }]} />
          <View style={styles.cardInfo}>
            <Text style={styles.recordingLabel}>
              {isRecording ? 'Recording active' : 'Recording stopped'}
            </Text>
            <Text style={styles.recordingDetail}>
              {isRecording
                ? 'PPG + Accelerometer sensors are sampling'
                : 'Sensors are idle'}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.toggleButton,
          isRecording ? styles.stopButton : styles.startButton,
          !isConnected && styles.disabledButton,
        ]}
        onPress={handleToggleRecording}
        disabled={!isConnected}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isRecording ? 'stop-circle-outline' : 'play-circle-outline'}
          size={20}
          color={isRecording ? '#FFFFFF' : '#FFFFFF'}
          style={{ marginRight: 8 }}
        />
        <Text style={styles.toggleButtonText}>
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </Text>
      </TouchableOpacity>

      {!isConnected && (
        <Text style={styles.hint}>Connect to your watch to control recording.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E7E5DB',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.serifBold,
    color: '#2B2B2B',
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: Fonts.sansMedium,
    color: '#6B6965',
    marginBottom: 10,
    marginLeft: 4,
    marginTop: 28,
  },
  card: {
    backgroundColor: '#F2F1ED',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: '#D7D7D7',
    padding: 16,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  deviceName: {
    fontSize: 15,
    fontFamily: Fonts.sansMedium,
    color: '#2B2B2B',
  },
  statusText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordingLabel: {
    fontSize: 15,
    fontFamily: Fonts.sansMedium,
    color: '#2B2B2B',
  },
  recordingDetail: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    color: '#6B6965',
    marginTop: 2,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 24,
    marginTop: 20,
  },
  startButton: {
    backgroundColor: '#8AA97C',
  },
  stopButton: {
    backgroundColor: '#C47A7A',
  },
  disabledButton: {
    opacity: 0.4,
  },
  toggleButtonText: {
    fontSize: 15,
    fontFamily: Fonts.sansMedium,
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    color: '#6B6965',
    textAlign: 'center',
    marginTop: 12,
  },
});
