import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ImageSourcePropType, Animated, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Fonts } from '@/constants/theme';
import { useBluetooth } from '@/hooks/use-bluetooth';
import { CircularScoreRing } from '@/components/ui/circular-score-ring';

const INTERVENTIONS: {
  title: string;
  time: string;
  color: string;
  icon: ImageSourcePropType;
  intervened: boolean;
}[] = [
  {
    title: 'Working Out',
    time: '3:13 PM',
    color: '#C8DEBE',
    icon: require('@/assets/workout.png'),
    intervened: false,
  },
  {
    title: 'Unhealthy Eating',
    time: '3:13 PM',
    color: '#DEBEBE',
    icon: require('@/assets/food.png'),
    intervened: true,
  },
  {
    title: 'Brain Rot',
    time: '2:50 PM',
    color: '#DEBEBE',
    icon: require('@/assets/brainrot.png'),
    intervened: true,
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { isAutoSyncing, isDownloading, downloadProgress, connectionState, requestQueue, setAutoSync, deviceStatus } = useBluetooth();
  const isSyncing = isAutoSyncing || isDownloading;
  const progress = downloadProgress ?? 0;

  const opacity = React.useRef(new Animated.Value(0)).current;

  // Auto-start syncing data from the watch on mount
  React.useEffect(() => {
    if (connectionState === 'connected') {
      setAutoSync(true);
      requestQueue();
    }
  }, [connectionState]);

  React.useEffect(() => {
    Animated.timing(opacity, {
      toValue: isSyncing ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isSyncing]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Score Section */}
      <View style={styles.scoreSection}>
        {/* Top row */}
        <View style={styles.topRow}>
          <Animated.View style={[styles.progressPill, { opacity }]} pointerEvents={isSyncing ? 'auto' : 'none'}>
            <Ionicons name="watch-outline" size={14} color="#2B2B2B" style={{ marginRight: 8 }} />
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          </Animated.View>
          <TouchableOpacity onPress={() => router.push('/device')} activeOpacity={0.7}>
            <CircularScoreRing percentage={deviceStatus?.battery ?? 0} />
          </TouchableOpacity>
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
              style={[styles.iconCircle, { backgroundColor: item.color }]}
            >
              <Image source={item.icon} style={styles.iconImage} />
            </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    backgroundColor: '#F2F1ED',
    borderRadius: 15,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    borderColor: '#D7D7D7',
  },
  progressTrack: {
    width: 44,
    height: 5,
    backgroundColor: '#DDD9D0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 5,
    backgroundColor: '#8AA97C',
    borderRadius: 3,
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
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0.2,
    borderColor: '#C4C4C4',
    marginRight: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 16,
    height: 16,
    tintColor: '#2B2B2B',
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
