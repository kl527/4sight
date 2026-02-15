import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');
const SIZE = width - 80;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 40;

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

export const RadarChart: React.FC<RadarChartProps> = ({ scores }) => {
  const labels = ['Stress', 'Health', 'Sleep\nFatigue', 'Cognitive\nFatigue', 'Physical\nExertion'];
  const values = [
    scores.stress, 
    scores.health, 
    scores.sleepFatigue, 
    scores.cognitiveFatigue, 
    scores.physicalExertion
  ];
  
  // Normalize scores (0-1 range) to radius percentage
  const normalizedValues = values.map(v => v * RADIUS);

  // Calculate points for each axis
  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
    return {
      x: CENTER + Math.cos(angle) * value,
      y: CENTER + Math.sin(angle) * value,
    };
  };

  // Generate polygon points
  const polygonPoints = normalizedValues
    .map((value, index) => {
      const point = getPoint(index, value);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  // Generate grid circles
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Risk Assessment</Text>
      
      <Svg width={SIZE} height={SIZE}>
        {/* Grid circles */}
        {gridLevels.map((level, index) => (
          <Circle
            key={`grid-${index}`}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS * level}
            stroke="#DEDEDD"
            strokeWidth="1"
            fill="none"
          />
        ))}

        {/* Axis lines and labels */}
        {labels.map((label, index) => {
          const outerPoint = getPoint(index, RADIUS);
          const labelPoint = getPoint(index, RADIUS + 30);
          
          return (
            <React.Fragment key={`axis-${index}`}>
              <Line
                x1={CENTER}
                y1={CENTER}
                x2={outerPoint.x}
                y2={outerPoint.y}
                stroke="#DEDEDD"
                strokeWidth="1"
              />
              <SvgText
                x={labelPoint.x}
                y={labelPoint.y}
                fontSize="11"
                fontWeight="600"
                fill="#2B2B2B"
                textAnchor="middle"
              >
                {label}
              </SvgText>
              <SvgText
                x={labelPoint.x}
                y={labelPoint.y + 18}
                fontSize="14"
                fontWeight="bold"
                fill="#E07B39"
                textAnchor="middle"
              >
                {(values[index] * 100).toFixed(0)}%
              </SvgText>
            </React.Fragment>
          );
        })}

        {/* Data polygon */}
        <Polygon
          points={polygonPoints}
          fill="#8AA97C"
          fillOpacity="0.3"
          stroke="#8AA97C"
          strokeWidth="2"
        />

        {/* Data points */}
        {normalizedValues.map((value, index) => {
          const point = getPoint(index, value);
          return (
            <Circle
              key={`point-${index}`}
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#8AA97C"
            />
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: '#EDECE7',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2B2B2B',
    marginBottom: 20,
  },
});