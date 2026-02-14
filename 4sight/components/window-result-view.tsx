import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WindowExtractionResult } from '@/features/feature-extraction/types';
import { LineChart, MultiLineChart, MetricCard } from '@/components/charts';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 32;

interface WindowResultViewProps {
  result: WindowExtractionResult;
  tintColor: string;
  textColor: string;
  subtextColor: string;
}

function qualityColor(score: number): string {
  if (score >= 0.6) return '#28a745';
  if (score >= 0.3) return '#ffc107';
  return '#dc3545';
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function WindowResultView({ result, tintColor, textColor, subtextColor }: WindowResultViewProps) {
  const { features } = result;
  const qScore = features?.qualityScore ?? 0;

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="time-outline" size={16} color={subtextColor} />
          <Text style={[styles.headerText, { color: textColor }]}>
            {formatTimestamp(result.timestamp)}
          </Text>
        </View>
        <View style={[styles.qualityBadge, { backgroundColor: qualityColor(qScore) + '20' }]}>
          <View style={[styles.qualityDot, { backgroundColor: qualityColor(qScore) }]} />
          <Text style={[styles.qualityText, { color: qualityColor(qScore) }]}>
            {(qScore * 100).toFixed(0)}%
          </Text>
        </View>
      </View>

      {/* PPG Waveform */}
      {result.preprocessedPPG.length > 0 && (
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Ionicons name="pulse" size={16} color="#e74c3c" />
            <Text style={[styles.chartTitle, { color: textColor }]}>PPG Waveform</Text>
          </View>
          <LineChart
            data={result.preprocessedPPG}
            width={CHART_WIDTH}
            height={150}
            color="#e74c3c"
          />
        </View>
      )}

      {/* Heart Rate */}
      {result.heartRates.length > 0 && (
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Ionicons name="heart" size={16} color="#e91e63" />
            <Text style={[styles.chartTitle, { color: textColor }]}>Heart Rate</Text>
          </View>
          <LineChart
            data={result.heartRates}
            width={CHART_WIDTH}
            height={120}
            color="#e91e63"
            label="BPM"
          />
          <LineChart
            data={result.rrIntervals}
            width={CHART_WIDTH}
            height={100}
            color="#9c27b0"
            label="RR Intervals (ms)"
          />
        </View>
      )}

      {/* Accelerometer */}
      {result.accelX.length > 0 && (
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Ionicons name="fitness" size={16} color="#2196f3" />
            <Text style={[styles.chartTitle, { color: textColor }]}>Accelerometer</Text>
          </View>
          <MultiLineChart
            series={[
              { data: result.accelX, color: '#2196f3', label: 'X' },
              { data: result.accelY, color: '#4caf50', label: 'Y' },
              { data: result.accelZ, color: '#ff9800', label: 'Z' },
            ]}
            width={CHART_WIDTH}
            height={140}
            showLegend
          />
        </View>
      )}

      {/* HRV Metrics */}
      {features && features.hrMean !== null && (
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Ionicons name="analytics" size={16} color={tintColor} />
            <Text style={[styles.chartTitle, { color: textColor }]}>HRV Metrics</Text>
          </View>
          <View style={styles.metricsGrid}>
            <MetricCard label="Heart Rate" value={features.hrMean} unit="bpm" color="#e91e63" />
            <MetricCard label="SDNN" value={features.sdnn!} unit="ms" color="#9c27b0" />
            <MetricCard label="RMSSD" value={features.rmssd!} unit="ms" color="#673ab7" />
            <MetricCard label="pNN50" value={features.pnn50!} unit="%" color="#3f51b5" />
            {features.sd1 !== null && features.sd2 !== null && (
              <>
                <MetricCard label="SD1" value={features.sd1} unit="ms" color="#00bcd4" />
                <MetricCard label="SD2" value={features.sd2} unit="ms" color="#009688" />
              </>
            )}
            <MetricCard
              label="Quality"
              value={(features.qualityScore * 100).toFixed(0)}
              unit="%"
              color={qualityColor(features.qualityScore)}
            />
            {features.movementIntensity !== null && (
              <MetricCard label="Movement" value={features.movementIntensity} unit="g²" color="#ff9800" />
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 24,
    borderRadius: 12,
    backgroundColor: '#EDECE7',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerText: { fontSize: 14, fontWeight: '600' },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  qualityDot: { width: 6, height: 6, borderRadius: 3 },
  qualityText: { fontSize: 11, fontWeight: '700' },
  chartSection: { paddingHorizontal: 4, paddingVertical: 8 },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  chartTitle: { fontSize: 13, fontWeight: '600' },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
});
