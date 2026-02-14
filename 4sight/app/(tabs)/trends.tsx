import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Fonts } from '@/constants/theme';
import { useBluetooth } from '@/hooks/use-bluetooth';
import * as LocalStore from '@/features/storage/local-store';
import type { WindowRecord } from '@/features/storage/local-store';
import type { BiosignalFeatures } from '@/features/feature-extraction/types';
import { decodePPGAsDouble } from '@/features/feature-extraction/binary-decoder';
import { LineChart } from '@/components/charts/line-chart';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_PADDING = 16;
const CHART_WIDTH = SCREEN_WIDTH - 24 * 2 - CARD_PADDING * 2;

interface WindowCardData {
  record: WindowRecord;
  features: BiosignalFeatures | null;
  ppgSamples: number[];
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function qualityColor(score: number): string {
  if (score >= 0.6) return '#8AA97C';
  if (score >= 0.3) return '#D4A843';
  return '#C97070';
}

function WindowCard({ data }: { data: WindowCardData }) {
  const { record, features, ppgSamples } = data;
  const timestamp = record.downloadedAt || parseInt(record.windowId, 10) || 0;
  const hr = features?.hrMean;
  const quality = features?.qualityScore ?? 0;

  return (
    <View style={cardStyles.card}>
      {/* Header row */}
      <View style={cardStyles.headerRow}>
        <View style={cardStyles.hrContainer}>
          {hr != null ? (
            <>
              <Text style={cardStyles.hrValue}>{Math.round(hr)}</Text>
              <Text style={cardStyles.hrUnit}> bpm</Text>
            </>
          ) : (
            <Text style={cardStyles.hrUnit}>No HR data</Text>
          )}
        </View>
        <View style={cardStyles.timeContainer}>
          <Text style={cardStyles.timeText}>{formatTime(timestamp)}</Text>
          <Text style={cardStyles.dateText}>{formatDate(timestamp)}</Text>
        </View>
      </View>

      {/* PPG Chart */}
      {ppgSamples.length > 0 && (
        <View style={cardStyles.chartContainer}>
          <LineChart
            data={ppgSamples}
            width={CHART_WIDTH}
            height={80}
            color="#C97070"
            strokeWidth={1}
            showGrid={false}
          />
        </View>
      )}

      {/* Footer row */}
      <View style={cardStyles.footerRow}>
        <View style={[cardStyles.qualityBadge, { backgroundColor: qualityColor(quality) + '20' }]}>
          <Text style={[cardStyles.qualityText, { color: qualityColor(quality) }]}>
            {Math.round(quality * 100)}% quality
          </Text>
        </View>
        <Text style={cardStyles.windowId}>
          {features?.durationMs ? `${Math.round(features.durationMs / 1000)}s window` : `#${record.windowId.slice(-6)}`}
        </Text>
      </View>
    </View>
  );
}

export default function TrendsScreen() {
  const { isAutoSyncing } = useBluetooth();
  const [cards, setCards] = useState<WindowCardData[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadWindows = useCallback(() => {
    try {
      const manifest = LocalStore.getManifest();
      const sorted = [...manifest].sort((a, b) => b.downloadedAt - a.downloadedAt);

      const loaded: WindowCardData[] = sorted.map((record) => {
        const features = record.hasFeatures
          ? LocalStore.getWindowFeatures(record.windowId)
          : null;

        let ppgSamples: number[] = [];
        try {
          const ppgBin = LocalStore.getWindowPPGBinary(record.windowId);
          if (ppgBin && ppgBin.length > 0) {
            const decoded = decodePPGAsDouble(ppgBin);
            ppgSamples = decoded.samples;
          }
        } catch {
          // Failed to decode PPG, leave empty
        }

        return { record, features, ppgSamples };
      });

      setCards(loaded);
    } catch {
      // Storage not initialized yet
    }
  }, []);

  // Load on mount and when auto-sync completes
  useEffect(() => {
    loadWindows();
  }, [loadWindows, refreshKey]);

  // Refresh when auto-sync state changes (from syncing -> not syncing = sync completed)
  const prevSyncing = React.useRef(isAutoSyncing);
  useEffect(() => {
    if (prevSyncing.current && !isAutoSyncing) {
      setRefreshKey((k) => k + 1);
    }
    prevSyncing.current = isAutoSyncing;
  }, [isAutoSyncing]);

  const groupedCards = useMemo(() => {
    const groups: { label: string; cards: WindowCardData[] }[] = [];
    let currentLabel = '';
    for (const card of cards) {
      const ts = card.record.downloadedAt || parseInt(card.record.windowId, 10) || 0;
      const label = formatDate(ts);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, cards: [card] });
      } else {
        groups[groups.length - 1].cards.push(card);
      }
    }
    return groups;
  }, [cards]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Trends</Text>
      {isAutoSyncing && (
        <Text style={styles.syncingText}>Syncing new windows...</Text>
      )}

      {cards.length === 0 && !isAutoSyncing && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptySubtitle}>
            Connect your Bangle.js and start recording to see PPG trends here.
          </Text>
        </View>
      )}

      {groupedCards.map((group) => (
        <View key={group.label}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          {group.cards.map((card) => (
            <WindowCard key={card.record.windowId} data={card} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDECE7',
  },
  contentContainer: {
    paddingTop: 80,
    paddingHorizontal: 24,
    paddingBottom: 140,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.serif,
    color: '#2B2B2B',
    marginBottom: 8,
  },
  syncingText: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    color: '#8AA97C',
    marginBottom: 16,
  },
  groupLabel: {
    fontSize: 14,
    fontFamily: Fonts.sansMedium,
    color: '#979592',
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 4,
  },
  emptyState: {
    marginTop: 60,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: Fonts.serifMedium,
    color: '#2B2B2B',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    color: '#979592',
    textAlign: 'center',
    lineHeight: 20,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#F2F1ED',
    borderRadius: 12,
    borderWidth: 0.4,
    borderColor: '#D7D7D7',
    padding: CARD_PADDING,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  hrContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  hrValue: {
    fontSize: 28,
    fontFamily: Fonts.serifBold,
    color: '#2B2B2B',
  },
  hrUnit: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    color: '#979592',
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 14,
    fontFamily: Fonts.sansMedium,
    color: '#2B2B2B',
  },
  dateText: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    color: '#979592',
  },
  chartContainer: {
    marginVertical: 4,
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  qualityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  qualityText: {
    fontSize: 11,
    fontFamily: Fonts.sansMedium,
  },
  windowId: {
    fontSize: 11,
    fontFamily: Fonts.sans,
    color: '#979592',
  },
});
