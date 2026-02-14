import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/constants/theme';

const INTERVENTIONS = [
  {
    title: 'Working Out',
    time: '3:13 PM',
    color: '#C8DEBE',
    intervened: false,
  },
  {
    title: 'Unhealthy Eating',
    time: '3:13 PM',
    color: '#DEBEBE',
    intervened: true,
  },
  {
    title: 'Brain Rot',
    time: '2:50 PM',
    color: '#DEBEBE',
    intervened: true,
  },
];

export default function HomeScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Score Section */}
      <View style={styles.scoreSection}>
        {/* Progress pill + sync icon row */}
        <View style={styles.topRow}>
          <View style={styles.progressPill}>
            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
          </View>
          <Ionicons name="sync-outline" size={24} color="#2B2B2B" />
        </View>

        {/* Spacer for decorative area */}
        <View style={{ height: 140 }} />

        {/* Day's score label */}
        <Text style={styles.dayScoreLabel}>your day's score</Text>

        {/* Large score */}
        <Text style={styles.scoreText}>
          <Text style={styles.scoreValue}>95</Text>
          <Text style={styles.scoreDenom}>/100</Text>
        </Text>

        {/* Sub-scores */}
        <View style={styles.subScoresRow}>
          <View style={styles.subScore}>
            <Text style={styles.subScoreLabel}>Fitness</Text>
            <Text style={styles.subScoreValue}>
              <Text style={styles.subScoreNum}>100</Text>
              <Text style={styles.subScoreDenom}>/100</Text>
            </Text>
          </View>
          <View style={styles.subScore}>
            <Text style={styles.subScoreLabel}>Diet</Text>
            <Text style={styles.subScoreValue}>
              <Text style={styles.subScoreNum}>95</Text>
              <Text style={styles.subScoreDenom}>/100</Text>
            </Text>
          </View>
          <View style={styles.subScore}>
            <Text style={styles.subScoreLabel}>Screentime</Text>
            <Text style={styles.subScoreValue}>
              <Text style={styles.subScoreNum}>95</Text>
              <Text style={styles.subScoreDenom}>/100</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* Intervention History Section */}
      <View style={styles.historySection}>
        <Text style={styles.historyTitle}>Intervention History</Text>
        <Text style={styles.historySubtitle}>
          Interventions from 2:50 - 3:13 PM.
        </Text>

        {INTERVENTIONS.map((item, index) => (
          <View key={index} style={styles.card}>
            <View
              style={[styles.iconSquare, { backgroundColor: item.color }]}
            />
            <View style={styles.cardContent}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardTime}>{item.time}</Text>
            </View>
            {item.intervened && (
              <Text style={styles.intervenedText}>intervened</Text>
            )}
          </View>
        ))}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E7E5DB',
  },
  contentContainer: {
    paddingTop: 60,
    flexGrow: 1,
  },

  // --- Score section (cream top area) ---
  scoreSection: {
    paddingHorizontal: 40,
    paddingBottom: 30,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressPill: {
    width: 84,
    height: 34,
    backgroundColor: '#F2F1ED',
    borderRadius: 20,
    justifyContent: 'center',
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  progressTrack: {
    width: 40,
    height: 6,
    backgroundColor: '#F7F6F5',
    borderRadius: 20,
  },
  progressFill: {
    width: 26,
    height: 6,
    backgroundColor: '#8AA97C',
    borderRadius: 20,
  },
  dayScoreLabel: {
    fontSize: 16,
    fontFamily: Fonts.sans,
    color: '#000000',
    marginBottom: 2,
  },
  scoreText: {
    marginBottom: 44,
  },
  scoreValue: {
    fontSize: 60,
    fontFamily: Fonts.serifBold,
    color: '#8AA97C',
  },
  scoreDenom: {
    fontSize: 60,
    fontFamily: Fonts.serifBold,
    color: '#2B2B2B',
  },
  subScoresRow: {
    flexDirection: 'row',
  },
  subScore: {
    marginRight: 48,
  },
  subScoreLabel: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    color: '#000000',
    marginBottom: 2,
  },
  subScoreValue: {},
  subScoreNum: {
    fontSize: 14,
    fontFamily: Fonts.serifBold,
    color: '#8AA97C',
  },
  subScoreDenom: {
    fontSize: 14,
    fontFamily: Fonts.serifBold,
    color: '#2B2B2B',
  },

  // --- Intervention History section ---
  historySection: {
    flex: 1,
    backgroundColor: '#EDECE7',
    borderTopWidth: 1,
    borderTopColor: '#DEDEDD',
    paddingTop: 38,
    paddingHorizontal: 41,
    paddingBottom: 120,
  },
  historyTitle: {
    fontSize: 24,
    fontFamily: Fonts.serif,
    color: '#2B2B2B',
    marginLeft: 9,
    marginBottom: 8,
  },
  historySubtitle: {
    fontSize: 16,
    fontFamily: Fonts.sans,
    color: '#2B2B2B',
    marginLeft: 9,
    marginBottom: 32,
  },

  // --- Cards ---
  card: {
    backgroundColor: '#F2F1ED',
    borderWidth: 0.4,
    borderColor: '#D7D7D7',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    paddingHorizontal: 16,
    marginBottom: 13,
  },
  iconSquare: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 0.2,
    borderColor: '#C4C4C4',
    marginRight: 13,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 12,
    fontFamily: Fonts.sansMedium,
    color: '#2B2B2B',
  },
  cardTime: {
    fontSize: 12,
    fontFamily: Fonts.sans,
    color: '#2B2B2B',
  },
  intervenedText: {
    fontSize: 12,
    fontFamily: Fonts.sansMedium,
    color: '#8AA97C',
  },
});
