import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Fonts } from '@/constants/theme';
import { BluetoothManager } from '@/features/bluetooth/bluetooth-manager';
import type { RiskPrediction } from '@/features/risk-prediction';
import { RadarChart } from '@/components/RadarChart';
import { TrendGraph } from '@/components/TrendGraph';

type AssessmentKey =
  | 'stress'
  | 'health'
  | 'sleepFatigue'
  | 'cognitiveFatigue'
  | 'physicalExertion';

const CATEGORIES: { key: AssessmentKey; label: string }[] = [
  { key: 'stress', label: 'Stress' },
  { key: 'health', label: 'Health' },
  { key: 'sleepFatigue', label: 'Sleep' },
  { key: 'cognitiveFatigue', label: 'Cognitive' },
  { key: 'physicalExertion', label: 'Exertion' },
];

const MAX_HISTORY = 10;
const MODEL_MAX_LEVEL = 3;
const RADAR_MAX = 5;

export default function TrendsScreen() {
  const [predictions, setPredictions] = useState<RiskPrediction[]>(() => {
    // Seed with existing prediction history so data is available immediately
    const history = BluetoothManager.getPredictionHistory?.() ?? [];
    return history.slice(-MAX_HISTORY).map((r) => r.cumulative);
  });
  const [categoryIndex, setCategoryIndex] = useState(0);

  useEffect(() => {
    const unsubscribe = BluetoothManager.addEventListener((event) => {
      if (event.type === 'riskPrediction') {
        setPredictions((prev) => [
          ...prev.slice(-(MAX_HISTORY - 1)),
          event.result.cumulative,
        ]);
      }
    });
    return unsubscribe;
  }, []);

  const latest =
    predictions.length > 0 ? predictions[predictions.length - 1] : null;

  // Compute probability-weighted expected value (continuous 0–3) then scale to 0–5
  const expectedLevel = (probs: number[]) => {
    let ev = 0;
    for (let i = 0; i < probs.length; i++) ev += probs[i] * i;
    return Math.round((ev / MODEL_MAX_LEVEL) * RADAR_MAX * 10) / 10;
  };

  const radarScores = {
    stress: expectedLevel(latest?.riskAssessment.stress.probabilities ?? [1]),
    health: expectedLevel(latest?.riskAssessment.health.probabilities ?? [1]),
    sleepFatigue: expectedLevel(latest?.riskAssessment.sleepFatigue.probabilities ?? [1]),
    cognitiveFatigue: expectedLevel(latest?.riskAssessment.cognitiveFatigue.probabilities ?? [1]),
    physicalExertion: expectedLevel(latest?.riskAssessment.physicalExertion.probabilities ?? [1]),
  };

  const category = CATEGORIES[categoryIndex];

  const trendData = predictions.map((pred) => ({
    timestamp: pred.timestamp,
    level: expectedLevel(pred.riskAssessment[category.key].probabilities),
  }));

  const goLeft = () =>
    setCategoryIndex(
      (i) => (i - 1 + CATEGORIES.length) % CATEGORIES.length,
    );
  const goRight = () =>
    setCategoryIndex((i) => (i + 1) % CATEGORIES.length);

  return (
    <View style={styles.screen}>
      {/* Top half — Radar Chart */}
      <View style={styles.radarSection}>
        <Text style={styles.radarTitle}>Risk Assessment</Text>
        <RadarChart scores={radarScores} />
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Bottom half — Navigable Trend Graph */}
      <View style={styles.trendSection}>
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={goLeft}
            style={styles.chevronBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.chevron}>{'\u2039'}</Text>
          </TouchableOpacity>

          <Text style={styles.navTitle}>{category.label} Trends</Text>

          <TouchableOpacity
            onPress={goRight}
            style={styles.chevronBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.chevron}>{'\u203A'}</Text>
          </TouchableOpacity>
        </View>

        <TrendGraph data={trendData} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#EDECE7',
    paddingTop: 60,
  },
  radarSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarTitle: {
    fontSize: 20,
    fontFamily: Fonts.serifMedium,
    color: '#2B2B2B',
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#DEDEDD',
  },
  trendSection: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  navTitle: {
    fontSize: 16,
    fontFamily: Fonts.serifMedium,
    color: '#2B2B2B',
  },
  chevronBtn: {
    padding: 4,
  },
  chevron: {
    fontSize: 28,
    color: '#2B2B2B',
    fontWeight: '600',
  },
});
