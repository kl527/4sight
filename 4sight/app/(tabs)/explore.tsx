import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBluetooth } from '@/hooks/use-bluetooth';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  BluetoothManager,
  type BluetoothManagerEvent,
} from '@/features/bluetooth/bluetooth-manager';
import { extractWithSignals, type WindowExtractionResult } from '@/features/feature-extraction';
import { WindowResultView } from '@/components/window-result-view';

export default function DataScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const bt = useBluetooth();
  const downloadingRef = useRef(false);
  const [results, setResults] = useState<WindowExtractionResult[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  const isConnected = bt.connectionState === 'connected';
  const hasWindows = bt.uploadQueue.length > 0;

  const handleDownloadAll = useCallback(() => {
    if (!isConnected || bt.uploadQueue.length === 0 || downloadingRef.current) return;
    downloadingRef.current = true;
    setResults([]);
    setIsExtracting(true);

    const queue = [...bt.uploadQueue];
    let idx = 0;
    const collected: WindowExtractionResult[] = [];

    const downloadNext = () => {
      if (idx >= queue.length) {
        downloadingRef.current = false;
        setResults(collected);
        setIsExtracting(false);
        Alert.alert('Done', `Downloaded and analyzed ${queue.length} window(s).`);
        return;
      }

      const windowId = queue[idx];
      const unsub = BluetoothManager.addEventListener((event: BluetoothManagerEvent) => {
        if (event.type === 'downloadComplete' && event.result.windowId === windowId) {
          unsub();

          // Run feature extraction on the downloaded binary data
          const extraction = extractWithSignals(
            event.result.ppgData,
            event.result.accelData,
            windowId,
            parseInt(windowId, 10) || Date.now()
          );
          collected.push(extraction);

          BluetoothManager.confirmUpload(windowId);
          idx++;
          // Small delay to let firmware finish storage cleanup before next download
          setTimeout(downloadNext, 200);
          return;
        }
        if (event.type === 'downloadPartial' && event.result.windowId === windowId) {
          unsub();
          downloadingRef.current = false;
          setResults(collected);
          setIsExtracting(false);
          const pct = Math.round((event.result.bytesReceived / event.result.totalBytes) * 100);
          Alert.alert(
            'Partial Download',
            `Window ${windowId} stopped at ${pct}%. It was kept on watch for retry.`,
          );
          return;
        }
        if (event.type === 'error') {
          unsub();
          downloadingRef.current = false;
          setResults(collected);
          setIsExtracting(false);
          Alert.alert('Error', `Failed on window ${windowId}`);
        }
      });

      BluetoothManager.downloadWindow(windowId);
    };

    downloadNext();
  }, [isConnected, bt.uploadQueue]);

  const handleSharePPG = useCallback(() => {
    Alert.alert(
      'Share PPG Data',
      'This will send PPG data to your computer for analysis. (Coming soon — needs network transport.)',
    );
  }, []);

  const handleDeleteAll = useCallback(() => {
    Alert.alert('Delete All Windows', 'Remove all recorded data from the watch?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => bt.deleteAllWindows(),
      },
    ]);
  }, [bt]);

  const formatWindowId = (id: string) => {
    const ts = parseInt(id, 10);
    if (isNaN(ts)) return id;
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* ── Status Bar ── */}
      <View style={[styles.statusBar, { borderBottomColor: colors.icon + '30' }]}>
        <View style={styles.statusDot}>
          <View
            style={[styles.dot, { backgroundColor: isConnected ? '#28a745' : '#dc3545' }]}
          />
          <Text style={[styles.statusText, { color: colors.text }]}>
            {isConnected ? bt.connectedDeviceName : 'Not connected'}
          </Text>
        </View>
        {isConnected && bt.deviceStatus && (
          <Text style={[styles.statusMeta, { color: colors.icon }]}>
            {bt.deviceStatus.battery}% battery
          </Text>
        )}
      </View>

      {!isConnected && (
        <View style={styles.emptyState}>
          <Ionicons name="bluetooth-outline" size={48} color={colors.icon} />
          <Text style={[styles.emptyText, { color: colors.icon }]}>
            Connect to a device on the Device tab to manage data.
          </Text>
        </View>
      )}

      {isConnected && (
        <>
          {/* ── Upload Windows ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="cloud-upload" size={22} color={colors.tint} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Upload Windows</Text>
            </View>
            <Text style={[styles.sectionDesc, { color: colors.icon }]}>
              Download recorded sensor windows from the watch to your phone.
            </Text>

            {bt.isDownloading && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBarBg}>
                  <View
                    style={[styles.progressBarFill, { width: `${bt.downloadProgress}%` }]}
                  />
                </View>
                <Text style={[styles.progressText, { color: colors.text }]}>
                  {bt.downloadProgress}%
                </Text>
              </View>
            )}

            {hasWindows ? (
              <>
                <View style={styles.windowList}>
                  {bt.uploadQueue.map((windowId) => (
                    <View
                      key={windowId}
                      style={[styles.windowRow, { borderBottomColor: colors.icon + '20' }]}
                    >
                      <Ionicons name="document-outline" size={18} color={colors.icon} />
                      <Text style={[styles.windowId, { color: colors.text }]}>
                        {formatWindowId(windowId)}
                      </Text>
                      <Text style={[styles.windowRaw, { color: colors.icon }]}>
                        {windowId}
                      </Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.tint }]}
                  onPress={handleDownloadAll}
                  disabled={bt.isDownloading}
                >
                  <Ionicons name="download" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>
                    Download All ({bt.uploadQueue.length})
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: colors.icon }]}>
                  No windows queued for upload.
                </Text>
              </View>
            )}
          </View>

          {/* ── Extraction Results ── */}
          {isExtracting && (
            <View style={[styles.section, styles.extractingRow]}>
              <ActivityIndicator size="small" color={colors.tint} />
              <Text style={[styles.sectionDesc, { color: colors.icon, marginBottom: 0 }]}>
                Extracting features...
              </Text>
            </View>
          )}

          {results.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="analytics" size={22} color={colors.tint} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  Analysis Results
                </Text>
              </View>
              <Text style={[styles.sectionDesc, { color: colors.icon }]}>
                {results.length} window(s) analyzed
              </Text>

              {results.map((result) => (
                <WindowResultView
                  key={result.windowId}
                  result={result}
                  tintColor={colors.tint}
                  textColor={colors.text}
                  subtextColor={colors.icon}
                />
              ))}
            </View>
          )}

          {/* ── Share PPG Data ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="share-outline" size={22} color={colors.tint} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Share PPG Data</Text>
            </View>
            <Text style={[styles.sectionDesc, { color: colors.icon }]}>
              Send heart rate data to your computer for analysis and visualization.
            </Text>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: '#6f42c1' }]}
              onPress={handleSharePPG}
            >
              <Ionicons name="desktop-outline" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Share PPG to Computer</Text>
            </TouchableOpacity>
          </View>

          {/* ── Danger Zone ── */}
          <View style={styles.section}>
            <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAll}>
              <Ionicons name="trash-outline" size={18} color="#dc3545" />
              <Text style={styles.dangerButtonText}>Delete All Windows from Watch</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  // Status bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusDot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 15, fontWeight: '600' },
  statusMeta: { fontSize: 13 },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 16, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },

  // Sections
  section: { paddingHorizontal: 16, paddingTop: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionDesc: { fontSize: 13, marginBottom: 16, lineHeight: 18 },

  // Window list
  windowList: { marginBottom: 16 },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  windowId: { fontSize: 15, fontWeight: '500' },
  windowRaw: { fontSize: 11, marginLeft: 'auto' },

  // Progress
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: { height: 6, backgroundColor: '#0a7ea4', borderRadius: 3 },
  progressText: { fontSize: 13, fontWeight: '600', width: 40 },

  // Buttons
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: 8,
  },
  dangerButtonText: { color: '#dc3545', fontSize: 15, fontWeight: '600' },

  emptySection: { alignItems: 'center', paddingVertical: 16 },
  emptySectionText: { fontSize: 14 },

  extractingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
