import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TICK_SPACING = 42;

interface TimeRulerProps {
  riskStartMinutes: number;
  riskEndMinutes: number;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const hours = d.getHours() % 12 || 12;
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

export const TimeRuler: React.FC<TimeRulerProps> = ({
  riskStartMinutes,
  riskEndMinutes,
}) => {
  // Lock risk window to absolute timestamps so it drifts left naturally
  const riskWindowRef = useRef({ start: 0, end: 0 });
  useEffect(() => {
    const now = Date.now();
    riskWindowRef.current = {
      start: now + riskStartMinutes * 60000,
      end: now + riskEndMinutes * 60000,
    };
  }, [riskStartMinutes, riskEndMinutes]);

  // Floor of current time to minute boundary
  const [baseMinuteMs, setBaseMinuteMs] = useState(() => {
    const now = Date.now();
    return now - (now % 60000);
  });

  const [nowTimeStr, setNowTimeStr] = useState(() => formatTime(Date.now()));

  const scrollAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const startCycle = () => {
      const currentMs = Date.now();
      const msIntoMinute = currentMs % 60000;
      const msRemaining = 60000 - msIntoMinute;
      const fraction = msIntoMinute / 60000;

      setBaseMinuteMs(currentMs - msIntoMinute);
      setNowTimeStr(formatTime(currentMs));

      scrollAnim.setValue(fraction * TICK_SPACING);

      animRef.current = Animated.timing(scrollAnim, {
        toValue: TICK_SPACING,
        duration: msRemaining,
        useNativeDriver: true,
        easing: Easing.linear,
      });

      animRef.current.start(({ finished }) => {
        if (finished) {
          scrollAnim.setValue(0);
          startCycle();
        }
      });
    };

    startCycle();
    return () => animRef.current?.stop();
  }, [scrollAnim]);

  // Generate enough ticks to fill the screen plus buffer
  const halfCount = Math.ceil(SCREEN_WIDTH / (2 * TICK_SPACING)) + 3;

  const ticks: { offset: number; label: string; isInDanger: boolean }[] = [];
  for (let i = -halfCount; i <= halfCount; i++) {
    const tickMs = baseMinuteMs + i * 60000;
    const isInDanger =
      tickMs < riskWindowRef.current.end &&
      tickMs + 60000 > riskWindowRef.current.start;
    ticks.push({ offset: i, label: formatTime(tickMs), isInDanger });
  }

  // Exact danger overlay pixel position
  let dangerLeftPx: number | null = null;
  let dangerWidthPx: number | null = null;
  if (riskWindowRef.current.end > riskWindowRef.current.start) {
    const startOff = (riskWindowRef.current.start - baseMinuteMs) / 60000;
    const endOff = (riskWindowRef.current.end - baseMinuteMs) / 60000;
    dangerLeftPx = (startOff + halfCount) * TICK_SPACING;
    dangerWidthPx = (endOff - startOff) * TICK_SPACING;
  }

  // Position ruler so tick at offset=0 center aligns with screen center
  const rulerOrigin =
    SCREEN_WIDTH / 2 - halfCount * TICK_SPACING - TICK_SPACING / 2;

  // Danger window info
  const dangerDuration = Math.max(0, riskEndMinutes - riskStartMinutes);
  const minutesUntilEnd = Math.round(
    (riskWindowRef.current.end - Date.now()) / 60000,
  );
  const hasDanger = dangerDuration > 0 && minutesUntilEnd > 0;

  return (
    <View style={styles.container}>
      {/* Scrolling ruler underneath */}
      <Animated.View
        style={[
          styles.ruler,
          {
            left: rulerOrigin,
            transform: [
              {
                translateX: scrollAnim.interpolate({
                  inputRange: [0, TICK_SPACING],
                  outputRange: [0, -TICK_SPACING],
                }),
              },
            ],
          },
        ]}
      >
        {dangerLeftPx != null && dangerWidthPx != null && dangerWidthPx > 0 && (
          <View
            style={[
              styles.dangerOverlay,
              { left: dangerLeftPx, width: dangerWidthPx },
            ]}
          />
        )}

        {ticks.map((tick) => (
          <View key={tick.offset} style={styles.tickContainer}>
            <Text
              style={[
                styles.tickLabel,
                tick.isInDanger && styles.dangerTickLabel,
              ]}
            >
              {tick.label}
            </Text>
            <View
              style={[
                styles.tickBar,
                {
                  backgroundColor: tick.isInDanger ? '#E07B39' : '#A8D5BA',
                  opacity: tick.isInDanger ? 1 : 0.6,
                },
              ]}
            />
          </View>
        ))}
      </Animated.View>

      {/* Fixed NOW indicator — always at screen center */}
      <View style={styles.nowContainer} pointerEvents="none">
        <View style={styles.nowLabelBg}>
          <Text style={styles.nowTime}>{nowTimeStr}</Text>
          <Text style={styles.nowSubLabel}>NOW</Text>
        </View>
        <View style={styles.nowBar} />
      </View>

      {/* Info footer */}
      {hasDanger && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Danger window · {dangerDuration} min
          </Text>
          <Text style={styles.infoSubtext}>
            {formatTime(riskWindowRef.current.start)} –{' '}
            {formatTime(riskWindowRef.current.end)}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 240,
    backgroundColor: '#EDECE7',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ruler: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-end',
    bottom: 60,
  },
  dangerOverlay: {
    position: 'absolute',
    bottom: 0,
    height: 70,
    backgroundColor: '#E07B39',
    opacity: 0.12,
    borderRadius: 12,
  },
  tickContainer: {
    width: TICK_SPACING,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tickBar: {
    height: 36,
    width: 5,
    borderRadius: 4,
  },
  tickLabel: {
    fontSize: 9,
    color: '#BBB',
    marginBottom: 8,
  },
  dangerTickLabel: {
    color: '#E07B39',
    fontWeight: '600',
  },
  nowContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  nowLabelBg: {
    alignItems: 'center',
    backgroundColor: '#EDECE7',
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  nowTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  nowSubLabel: {
    fontSize: 9,
    color: '#979592',
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 6,
  },
  nowBar: {
    width: 10,
    height: 56,
    backgroundColor: '#2B2B2B',
    borderRadius: 5,
  },
  infoContainer: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E07B39',
    marginBottom: 2,
  },
  infoSubtext: {
    fontSize: 11,
    color: '#979592',
  },
});
