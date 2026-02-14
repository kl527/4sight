import React from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { Fonts } from '@/constants/theme';
import { useBluetooth } from '@/hooks/use-bluetooth';
import { CircularScoreRing } from '@/components/ui/circular-score-ring';

function WorkoutIcon() {
  return (
    <Svg width={16} height={12} viewBox="0 0 19 12" fill="none">
      <Path d="M3.07699 1.71093C3.08994 1.17624 3.39271 0.697814 3.92375 0.635885C4.07675 0.618481 4.25242 0.607147 4.45237 0.607147C4.65232 0.607147 4.82799 0.61848 4.98099 0.63629C5.51244 0.697814 5.8148 1.17624 5.82775 1.71093C5.84678 2.49779 5.86904 3.85212 5.86904 5.86905C5.86904 7.88598 5.84678 9.24031 5.82775 10.0272C5.8148 10.5619 5.51204 11.0403 4.98099 11.1022C4.82799 11.1196 4.65232 11.131 4.45237 11.131C4.25242 11.131 4.07675 11.1196 3.92375 11.1022C3.3923 11.0403 3.08994 10.5619 3.07699 10.0272C3.05797 9.24031 3.03571 7.88598 3.03571 5.86905C3.03571 3.85212 3.05797 2.49779 3.07699 1.71093ZM15.1373 1.71093C15.1243 1.17624 14.8216 0.697814 14.2905 0.635885C14.1375 0.618481 13.9618 0.607147 13.7619 0.607147C13.5619 0.607147 13.3863 0.61848 13.2333 0.63629C12.7018 0.697814 12.3995 1.17624 12.3865 1.71093C12.3675 2.49779 12.3452 3.85212 12.3452 5.86905C12.3452 7.88598 12.3675 9.24031 12.3865 10.0272C12.3995 10.5619 12.7022 11.0403 13.2333 11.1022C13.3863 11.1196 13.5619 11.131 13.7619 11.131C13.9618 11.131 14.1375 11.1196 14.2905 11.1022C14.822 11.0403 15.1243 10.5619 15.1373 10.0272C15.1563 9.24031 15.1786 7.88598 15.1786 5.86905C15.1786 3.85212 15.1563 2.49779 15.1373 1.71093Z" stroke="#2B2B2B" strokeWidth={1.21429} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5.86622 7.07605C8.02683 7.08768 10.1875 7.08593 12.3481 7.07079M12.3477 4.66691C11.3706 4.66003 10.162 4.65477 8.70198 4.65477C7.62208 4.65477 6.67898 4.6576 5.86581 4.66205M0.629409 3.76551C0.643981 3.16241 1.02769 2.65322 1.63079 2.63379C1.75785 2.6298 1.88501 2.6298 2.01208 2.63379C2.61517 2.65322 2.99889 3.16201 3.01346 3.76551C3.0256 4.26053 3.03572 4.95389 3.03572 5.86905C3.03572 6.78422 3.02519 7.47758 3.01346 7.9726C2.99889 8.5757 2.61517 9.08489 2.01208 9.10432C1.88501 9.10831 1.75785 9.10831 1.63079 9.10432C1.02769 9.08489 0.643981 8.5761 0.629409 7.9726C0.617266 7.47758 0.607147 6.78422 0.607147 5.86905C0.607147 4.95389 0.617671 4.26053 0.629409 3.76551ZM17.5849 3.76551C17.5703 3.16241 17.1866 2.65322 16.5835 2.63379C16.4564 2.6298 16.3293 2.6298 16.2022 2.63379C15.5991 2.65322 15.2154 3.16201 15.2008 3.76551C15.1887 4.26053 15.1786 4.95389 15.1786 5.86905C15.1786 6.78422 15.1891 7.47758 15.2008 7.9726C15.2154 8.5757 15.5991 9.08489 16.2022 9.10432C16.3293 9.10831 16.4564 9.10831 16.5835 9.10432C17.1866 9.08489 17.5703 8.5761 17.5849 7.9726C17.597 7.47758 17.6071 6.78422 17.6071 5.86905C17.6071 4.95389 17.5966 4.26053 17.5849 3.76551Z" stroke="#2B2B2B" strokeWidth={1.21429} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function FoodIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 17 17" fill="none">
      <Path d="M5.22073 8.40724C5.06212 8.40724 4.90708 8.45427 4.77521 8.54239C4.64333 8.6305 4.54055 8.75575 4.47985 8.90228C4.41916 9.04881 4.40328 9.21005 4.43422 9.3656C4.46516 9.52116 4.54154 9.66405 4.65369 9.77619C4.76584 9.88834 4.90872 9.96472 5.06428 9.99566C5.21984 10.0266 5.38107 10.0107 5.5276 9.95003C5.67413 9.88933 5.79938 9.78655 5.88749 9.65468C5.97561 9.5228 6.02264 9.36776 6.02264 9.20916C6.02264 8.99648 5.93815 8.79251 5.78776 8.64212C5.63738 8.49173 5.43341 8.40724 5.22073 8.40724ZM5.22073 4.81467C5.06212 4.81467 4.90708 4.8617 4.77521 4.94982C4.64333 5.03793 4.54055 5.16317 4.47985 5.3097C4.41916 5.45623 4.40328 5.61747 4.43422 5.77303C4.46516 5.92858 4.54154 6.07147 4.65369 6.18362C4.76584 6.29577 4.90872 6.37215 5.06428 6.40309C5.21984 6.43403 5.38107 6.41815 5.5276 6.35745C5.67413 6.29676 5.79938 6.19398 5.88749 6.0621C5.97561 5.93023 6.02264 5.77519 6.02264 5.61658C6.02264 5.4039 5.93815 5.19993 5.78776 5.04954C5.63738 4.89916 5.43341 4.81467 5.22073 4.81467ZM8.0194 6.4185C7.80672 6.4185 7.60275 6.50298 7.45237 6.65337C7.30198 6.80376 7.21749 7.00773 7.21749 7.22041V8.02232C7.21749 8.235 7.30198 8.43897 7.45237 8.58936C7.60275 8.73975 7.80672 8.82424 8.0194 8.82424C8.23208 8.82424 8.43605 8.73975 8.58644 8.58936C8.73683 8.43897 8.82132 8.235 8.82132 8.02232V7.22041C8.82132 7.00773 8.73683 6.80376 8.58644 6.65337C8.43605 6.50298 8.23208 6.4185 8.0194 6.4185ZM14.8357 5.27176C14.559 5.11259 14.2535 5.01006 13.9368 4.97013C13.6202 4.93021 13.2988 4.95369 12.9913 5.0392C12.6712 5.12492 12.3732 5.27803 12.1172 5.48828L2.81498 0.107436C2.69308 0.0370535 2.55479 0 2.41403 0C2.27326 0 2.13498 0.0370535 2.01307 0.107436C1.8892 0.177063 1.78606 0.278353 1.7142 0.400939C1.64234 0.523526 1.60434 0.663005 1.60409 0.805101V11.3663C1.13085 11.5259 0.720522 11.8317 0.432276 12.2396C0.14403 12.6475 -0.00724364 13.1363 0.000266715 13.6357C4.37144e-05 14.2628 0.24468 14.8652 0.682061 15.3145C1.11944 15.7639 1.715 16.0247 2.34185 16.0415H2.80696C5.43462 16.0353 8.01387 15.3339 10.2828 14.0086C12.5518 12.6833 14.4297 10.7812 15.7258 8.49545C16.0251 7.94855 16.1005 7.30679 15.9359 6.70542C15.7714 6.10405 15.3798 5.59006 14.8437 5.27176H14.8357ZM3.20792 2.19241L11.1388 6.77134C10.259 8.08424 9.08273 9.17185 7.70504 9.94636C6.32736 10.7209 4.78686 11.1606 3.20792 11.23V2.19241ZM14.3305 7.70958C13.14 9.80712 11.4014 11.5413 9.30084 12.7265C7.2003 13.9117 4.81694 14.5032 2.40601 14.4376C2.19333 14.4376 1.98936 14.3531 1.83897 14.2028C1.68858 14.0524 1.60409 13.8484 1.60409 13.6357C1.60347 13.5283 1.62444 13.4218 1.66577 13.3226C1.70709 13.2234 1.76793 13.1336 1.84467 13.0583C1.99532 12.9131 2.19677 12.8325 2.40601 12.8338H2.81498C4.87407 12.833 6.89601 12.2854 8.67409 11.247C10.4522 10.2086 11.9226 8.71665 12.9351 6.9237C12.9838 6.83574 13.0503 6.75891 13.1304 6.69815C13.2105 6.63739 13.3024 6.59404 13.4002 6.57086C13.6024 6.51536 13.8183 6.54127 14.0017 6.64303C14.1857 6.74193 14.3238 6.90871 14.3867 7.1079C14.4496 7.30708 14.4323 7.52295 14.3385 7.70958H14.3305Z" fill="#2B2B2B" />
    </Svg>
  );
}

function BrainRotIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 17 17" fill="none">
      <Path d="M8.24985 12.7501V3.0001M8.24985 3.0001C8.24983 2.65497 8.32921 2.31446 8.48185 2.00492C8.63449 1.69537 8.85629 1.42509 9.1301 1.21498C9.4039 1.00487 9.72238 0.860571 10.0609 0.793237C10.3994 0.725902 10.7488 0.737341 11.0822 0.826669C11.4156 0.915997 11.7239 1.08082 11.9834 1.30838C12.2429 1.53595 12.4465 1.82016 12.5786 2.13902C12.7107 2.45788 12.7676 2.80285 12.745 3.14724C12.7224 3.49164 12.6209 3.82622 12.4483 4.1251M8.24985 3.0001C8.24986 2.65497 8.17048 2.31446 8.01784 2.00492C7.86521 1.69537 7.6434 1.42509 7.3696 1.21498C7.09579 1.00487 6.77732 0.860571 6.43882 0.793237C6.10032 0.725902 5.75087 0.737341 5.4175 0.826669C5.08413 0.915997 4.77577 1.08082 4.51629 1.30838C4.25681 1.53595 4.05316 1.82016 3.9211 2.13902C3.78903 2.45788 3.73208 2.80285 3.75467 3.14724C3.77726 3.49164 3.87877 3.82622 4.05135 4.1251M10.4998 9.0001C9.85095 8.81041 9.28098 8.41557 8.87535 7.87472C8.46971 7.33388 8.25025 6.67616 8.24985 6.0001C8.24944 6.67616 8.02998 7.33388 7.62435 7.87472C7.21871 8.41557 6.64875 8.81041 5.99985 9.0001" stroke="#2B2B2B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12.7476 3.09384C13.1885 3.20719 13.5977 3.41938 13.9444 3.71433C14.2912 4.00927 14.5662 4.37925 14.7487 4.79623C14.9313 5.21321 15.0166 5.66626 14.9981 6.12108C14.9796 6.57589 14.8579 7.02054 14.6421 7.42134" stroke="#2B2B2B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12.7498 12.7501C13.4102 12.7501 14.0521 12.5321 14.576 12.1301C15.1 11.7281 15.4766 11.1644 15.6475 10.5266C15.8184 9.88869 15.7741 9.21224 15.5214 8.60212C15.2687 7.99201 14.8217 7.48232 14.2498 7.1521" stroke="#2B2B2B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14.2251 12.3624C14.2777 12.769 14.2463 13.1822 14.1329 13.5762C14.0196 13.9703 13.8266 14.337 13.566 14.6536C13.3054 14.9702 12.9826 15.23 12.6177 15.4169C12.2527 15.6039 11.8533 15.714 11.4441 15.7406C11.0349 15.7672 10.6246 15.7095 10.2386 15.5713C9.8525 15.4331 9.49887 15.2172 9.19953 14.9369C8.90018 14.6567 8.66146 14.318 8.49812 13.9419C8.33478 13.5658 8.25028 13.1602 8.24985 12.7501C8.24941 13.1602 8.16491 13.5658 8.00157 13.9419C7.83823 14.318 7.59951 14.6567 7.30017 14.9369C7.00082 15.2172 6.6472 15.4331 6.26114 15.5713C5.87508 15.7095 5.46478 15.7672 5.05558 15.7406C4.64638 15.714 4.24697 15.6039 3.88201 15.4169C3.51705 15.23 3.1943 14.9702 2.93368 14.6536C2.67307 14.337 2.48012 13.9703 2.36676 13.5762C2.2534 13.1822 2.22203 12.769 2.2746 12.3624" stroke="#2B2B2B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.74987 12.7501C3.08949 12.7501 2.44757 12.5321 1.92367 12.1301C1.39976 11.7281 1.02315 11.1644 0.852226 10.5266C0.681306 9.88869 0.725632 9.21224 0.978331 8.60212C1.23103 7.99201 1.67798 7.48232 2.24987 7.1521" stroke="#2B2B2B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.75211 3.09384C3.31126 3.20719 2.90198 3.41938 2.55528 3.71433C2.20858 4.00927 1.93354 4.37925 1.75099 4.79623C1.56844 5.21321 1.48318 5.66626 1.50165 6.12108C1.52012 6.57589 1.64185 7.02054 1.85761 7.42134" stroke="#2B2B2B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const INTERVENTIONS: {
  title: string;
  time: string;
  color: string;
  icon: () => React.JSX.Element;
  intervened: boolean;
}[] = [
  {
    title: 'Working Out',
    time: '3:13 PM',
    color: '#C8DEBE',
    icon: WorkoutIcon,
    intervened: false,
  },
  {
    title: 'Unhealthy Eating',
    time: '3:13 PM',
    color: '#DEBEBE',
    icon: FoodIcon,
    intervened: true,
  },
  {
    title: 'Brain Rot',
    time: '2:50 PM',
    color: '#DEBEBE',
    icon: BrainRotIcon,
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
              <item.icon />
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
