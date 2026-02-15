import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TICK_WIDTH = 60;
const VISIBLE_TICKS = 13;
const CENTER_INDEX = Math.floor(VISIBLE_TICKS / 2);

interface TimeRulerProps {
  riskStartMinutes: number; // Minutes from now when risk starts
  riskEndMinutes: number;   // Minutes from now when risk ends
}

export const TimeRuler: React.FC<TimeRulerProps> = ({ 
  riskStartMinutes = 2, 
  riskEndMinutes = 6 
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const lastMinute = useRef(currentTime.getMinutes());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      if (now.getMinutes() !== lastMinute.current) {
        lastMinute.current = now.getMinutes();
        
        scrollAnim.setValue(0);
        Animated.timing(scrollAnim, {
          toValue: TICK_WIDTH,
          duration: 60000,
          useNativeDriver: true,
        }).start();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date, minuteOffset: number): string => {
    const newDate = new Date(date);
    newDate.setMinutes(newDate.getMinutes() + minuteOffset);
    const hours = newDate.getHours();
    const minutes = newDate.getMinutes();
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')}`;
  };

  const renderTick = (index: number) => {
    const minuteOffset = index - CENTER_INDEX;
    const isCenter = index === CENTER_INDEX;
    const isInDangerZone = 
      minuteOffset >= riskStartMinutes && 
      minuteOffset <= riskEndMinutes;

    const tickColor = isInDangerZone ? '#E07B39' : '#A8D5BA';
    const tickHeight = isCenter ? 60 : 40;
    const tickWidth = isCenter ? 12 : 6;
    const tickOpacity = isInDangerZone ? 1 : 0.6;

    return (
      <View key={index} style={styles.tickContainer}>
        <Text
          style={[
            styles.timeLabel,
            isCenter && styles.centerTimeLabel,
            isInDangerZone && !isCenter && styles.dangerTimeLabel,
          ]}
        >
          {formatTime(currentTime, minuteOffset)}
        </Text>
        
        {isCenter && (
          <Text style={styles.nowLabel}>NOW</Text>
        )}

        <View
          style={[
            styles.tick,
            {
              height: tickHeight,
              width: tickWidth,
              backgroundColor: tickColor,
              opacity: tickOpacity,
            },
          ]}
        >
          {isCenter && <View style={styles.centerGlow} />}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.dangerZoneHighlight,
          {
            left: SCREEN_WIDTH / 2 + (riskStartMinutes * TICK_WIDTH) - TICK_WIDTH / 2,
            width: (riskEndMinutes - riskStartMinutes + 1) * TICK_WIDTH,
          },
        ]}
      />

      <Animated.View
        style={[
          styles.ruler,
          {
            transform: [
              {
                translateX: scrollAnim.interpolate({
                  inputRange: [0, TICK_WIDTH],
                  outputRange: [0, TICK_WIDTH],
                }),
              },
            ],
          },
        ]}
      >
        {Array.from({ length: VISIBLE_TICKS }).map((_, index) => 
          renderTick(index)
        )}
      </Animated.View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          ⚠️ Danger window: {riskEndMinutes - riskStartMinutes + 1} minutes
        </Text>
        <Text style={styles.infoSubtext}>
          {formatTime(currentTime, riskStartMinutes)} - {formatTime(currentTime, riskEndMinutes)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 300,
    backgroundColor: '#EDECE7',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ruler: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 60,
    paddingLeft: SCREEN_WIDTH / 2 - (CENTER_INDEX * TICK_WIDTH),
  },
  tickContainer: {
    width: TICK_WIDTH,
    alignItems: 'center',
    height: 140,
    justifyContent: 'flex-end',
  },
  tick: {
    borderRadius: 6,
  },
  timeLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 8,
    fontFamily: 'System',
  },
  centerTimeLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  dangerTimeLabel: {
    color: '#D84315',
    fontWeight: '600',
  },
  nowLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  centerGlow: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E07B39',
    opacity: 0.2,
    top: '50%',
    left: '50%',
    transform: [{ translateX: -12 }, { translateY: -12 }],
  },
  dangerZoneHighlight: {
    position: 'absolute',
    height: 80,
    backgroundColor: '#E07B39',
    opacity: 0.1,
    borderRadius: 12,
    top: 80,
  },
  infoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E07B39',
    marginBottom: 4,
  },
  infoSubtext: {
    fontSize: 12,
    color: '#666',
  },
});