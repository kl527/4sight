import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Fonts } from '@/constants/theme';
import { BluetoothManager } from '@/features/bluetooth/bluetooth-manager';
import type { RiskPrediction } from '@/features/risk-prediction';
import { TimeRuler } from '@/components/TimeRuler';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 48 - CARD_GAP) / 2;

const ALL_QUICK_FIXES = [
  { label: 'Go for a walk', detail: '10 min' },
  { label: 'Drink water', detail: '1 glass' },
  { label: 'Stretch', detail: '5 min' },
  { label: 'Deep breaths', detail: '2 min' },
  { label: 'Step outside', detail: '5 min fresh air' },
  { label: 'Eat a fruit', detail: '1 serving' },
  { label: 'Cold water on face', detail: '30 sec' },
  { label: 'Listen to music', detail: '1 song' },
  { label: 'Stand up', detail: '2 min' },
  { label: 'Journal a thought', detail: '3 min' },
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export default function HomeScreen() {
  const [prediction, setPrediction] = useState<RiskPrediction | null>(null);
  const [quickFixes] = useState(() => pickRandom(ALL_QUICK_FIXES, 4));
  // Periodic re-render so elapsed-time adjustments stay fresh
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = BluetoothManager.addEventListener((event) => {
      if (event.type === 'riskPrediction') {
        setPrediction(event.result.cumulative);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Adjust risk window for time elapsed since the prediction was made
  const rawRange = prediction?.timeToRiskRange;
  const elapsed = prediction ? (Date.now() - prediction.timestamp) / 60000 : 0;
  const lower = rawRange ? rawRange.lower - elapsed : 3;
  const upper = rawRange ? rawRange.upper - elapsed : 8;
  const dangerDuration = rawRange
    ? Math.round(rawRange.upper - rawRange.lower)
    : 5;
  const isInDangerNow = prediction !== null && lower <= 0 && upper > 0;

  const alertColor = (level: string) => {
    if (level.startsWith('CRITICAL') || level.startsWith('HIGH')) return '#D84315';
    if (level.startsWith('MODERATE')) return '#E07B39';
    return '#8AA97C';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {isInDangerNow ? (
        <>
          <Text style={styles.title}>Danger zone</Text>
          <Text style={styles.subtitle}>
            Based on your biometric data, you're more likely to need
            decision-making support within the next {dangerDuration} minutes
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>Your timeline</Text>
          <Text style={styles.subtitle}>
            {prediction
              ? `Risk window approaching in ~${Math.round(lower)} minutes`
              : 'Monitoring your biometric data'}
          </Text>
        </>
      )}

      <TimeRuler
        riskStartMinutes={Math.round(lower)}
        riskEndMinutes={Math.round(upper)}
      />

      {prediction ? (
        <>
          <View style={styles.alertRow}>
            <View
              style={[
                styles.alertBadge,
                { backgroundColor: alertColor(prediction.alertLevel) + '18' },
              ]}
            >
              <Text
                style={[
                  styles.alertText,
                  { color: alertColor(prediction.alertLevel) },
                ]}
              >
                {prediction.alertLevel.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.susceptibilityValue}>
              {(prediction.overallSusceptibility * 100).toFixed(0)}%
            </Text>
          </View>

          <View style={styles.quickFixesContainer}>
            <Text style={styles.quickFixesTitle}>Quick fixes</Text>
            <View style={styles.quickFixesGrid}>
              {quickFixes.map((fix) => (
                <View
                  key={fix.label}
                  style={[styles.quickFixCard, { width: CARD_WIDTH }]}
                >
                  <Text style={styles.quickFixLabel}>{fix.label}</Text>
                  <Text style={styles.quickFixDetail}>{fix.detail}</Text>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : (
        <View style={styles.waitingContainer}>
          <Text style={styles.waitingTitle}>Waiting for biometric data...</Text>
          <Text style={styles.waitingSubtext}>
            Connect your Bangle.js watch and start recording to see live risk
            predictions.
          </Text>
        </View>
      )}
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
    paddingBottom: 140,
  },
  title: {
    fontSize: 24,
    fontFamily: Fonts.serif,
    color: '#2B2B2B',
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    color: '#979592',
    paddingHorizontal: 24,
    marginBottom: 12,
    lineHeight: 20,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 32,
    gap: 12,
  },
  alertBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '700',
  },
  susceptibilityValue: {
    fontSize: 28,
    fontFamily: Fonts.serifBold,
    color: '#2B2B2B',
  },
  quickFixesContainer: {
    paddingHorizontal: 24,
    marginTop: 40,
  },
  quickFixesTitle: {
    fontSize: 18,
    fontFamily: Fonts.serifMedium,
    color: '#2B2B2B',
    marginBottom: 12,
  },
  quickFixesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  quickFixCard: {
    backgroundColor: '#F2F1ED',
    borderRadius: 12,
    borderWidth: 0.4,
    borderColor: '#D7D7D7',
    padding: 16,
  },
  quickFixLabel: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    color: '#2B2B2B',
    marginBottom: 4,
  },
  quickFixDetail: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    color: '#979592',
  },
  waitingContainer: {
    marginTop: 56,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  waitingTitle: {
    fontSize: 18,
    fontFamily: Fonts.serifMedium,
    color: '#2B2B2B',
    marginBottom: 8,
  },
  waitingSubtext: {
    fontSize: 14,
    fontFamily: Fonts.sans,
    color: '#979592',
    textAlign: 'center',
    lineHeight: 20,
  },
});
