import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRAPH_WIDTH = SCREEN_WIDTH - 72;
const GRAPH_HEIGHT = 200;
const PAD_LEFT = 28;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

const PLOT_W = GRAPH_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = GRAPH_HEIGHT - PAD_TOP - PAD_BOTTOM;

interface DataPoint {
  timestamp: number;
  level: number;
}

interface TrendGraphProps {
  data: DataPoint[];
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = d.getHours() >= 12 ? 'p' : 'a';
  return `${h}:${m}${period}`;
}

export const TrendGraph: React.FC<TrendGraphProps> = ({ data }) => {
  if (data.length < 2) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Building trend data...</Text>
        <Text style={styles.emptySubtext}>
          Keep the app running to see trends over time
        </Text>
      </View>
    );
  }

  const getX = (i: number) =>
    PAD_LEFT + (i / Math.max(1, data.length - 1)) * PLOT_W;
  const getY = (level: number) =>
    PAD_TOP + ((5 - level) / 5) * PLOT_H;

  // Sharp line path (no smoothing)
  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.level)}`)
    .join(' ');

  return (
    <View style={styles.container}>
      <Svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT}>
        {/* Horizontal grid lines at each level */}
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <React.Fragment key={`grid-${level}`}>
            <Line
              x1={PAD_LEFT}
              y1={getY(level)}
              x2={GRAPH_WIDTH - PAD_RIGHT}
              y2={getY(level)}
              stroke="#DEDEDD"
              strokeWidth={0.6}
            />
            <SvgText
              x={PAD_LEFT - 8}
              y={getY(level) + 4}
              fontSize={10}
              fill="#BBB"
              textAnchor="end"
            >
              {level}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Data line — sharp connections */}
        <Path d={pathD} stroke="#8AA97C" strokeWidth={2.5} fill="none" />

        {/* Data point circles + x-axis labels */}
        {data.map((d, i) => (
          <React.Fragment key={`pt-${i}`}>
            <Circle
              cx={getX(i)}
              cy={getY(d.level)}
              r={5}
              fill="#8AA97C"
            />
            <SvgText
              x={getX(i)}
              y={GRAPH_HEIGHT - 6}
              fontSize={9}
              fill="#BBB"
              textAnchor="middle"
            >
              {formatTime(d.timestamp)}
            </SvgText>
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2B2B2B',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#979592',
    textAlign: 'center',
  },
});
