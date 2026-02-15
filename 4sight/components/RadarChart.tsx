import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText } from 'react-native-svg';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SIZE = SCREEN_WIDTH - 80;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 44;

interface RiskScores {
  stress: number;
  health: number;
  sleepFatigue: number;
  cognitiveFatigue: number;
  physicalExertion: number;
}

interface RadarChartProps {
  scores: RiskScores;
}

const LABELS = ['Stress', 'Health', 'Exertion', 'Cognitive', 'Sleep'];
const KEYS: (keyof RiskScores)[] = [
  'stress',
  'health',
  'physicalExertion',
  'cognitiveFatigue',
  'sleepFatigue',
];
const ANCHORS: ('middle' | 'start' | 'end')[] = [
  'middle',
  'start',
  'start',
  'end',
  'end',
];

function getVertex(index: number, r: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / 5;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

function pentagonPoints(r: number): string {
  return Array.from({ length: 5 }, (_, i) => {
    const p = getVertex(i, r);
    return `${p.x},${p.y}`;
  }).join(' ');
}

export const RadarChart: React.FC<RadarChartProps> = ({ scores }) => {
  const values = KEYS.map((k) => scores[k]);

  const dataPoints = values
    .map((level, i) => {
      const p = getVertex(i, (level / 5) * RADIUS);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE}>
        {/* Pentagon grid rings — levels 1-5 */}
        {[1, 2, 3, 4, 5].map((level) => (
          <Polygon
            key={`ring-${level}`}
            points={pentagonPoints((level / 5) * RADIUS)}
            stroke="#D7D5D0"
            strokeWidth={0.8}
            fill="none"
            opacity={0.7}
          />
        ))}

        {/* Axis lines from center to each vertex */}
        {[0, 1, 2, 3, 4].map((i) => {
          const p = getVertex(i, RADIUS);
          return (
            <Line
              key={`axis-${i}`}
              x1={CENTER}
              y1={CENTER}
              x2={p.x}
              y2={p.y}
              stroke="#D7D5D0"
              strokeWidth={0.8}
              opacity={0.7}
            />
          );
        })}

        {/* Level numbers along top axis */}
        {[1, 2, 3, 4, 5].map((level) => (
          <SvgText
            key={`level-${level}`}
            x={CENTER + 10}
            y={CENTER - (level / 5) * RADIUS + 4}
            fontSize={9}
            fill="#BBB"
          >
            {level}
          </SvgText>
        ))}

        {/* Data polygon */}
        <Polygon
          points={dataPoints}
          fill="#8AA97C"
          fillOpacity={0.25}
          stroke="#8AA97C"
          strokeWidth={2}
        />

        {/* Data point dots */}
        {values.map((level, i) => {
          const p = getVertex(i, (level / 5) * RADIUS);
          return (
            <Circle
              key={`dot-${i}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="#8AA97C"
            />
          );
        })}

        {/* Category labels + score */}
        {LABELS.map((label, i) => {
          const p = getVertex(i, RADIUS + 28);
          const anchor = ANCHORS[i];
          const yOff = i === 0 ? -10 : 4;

          return (
            <React.Fragment key={`label-${i}`}>
              <SvgText
                x={p.x}
                y={p.y + yOff}
                fontSize={12}
                fontWeight="600"
                fill="#2B2B2B"
                textAnchor={anchor}
              >
                {label}
              </SvgText>
              <SvgText
                x={p.x}
                y={p.y + yOff + 15}
                fontSize={14}
                fontWeight="bold"
                fill="#8AA97C"
                textAnchor={anchor}
              >
                {values[i]}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
  },
});
