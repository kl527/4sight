import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';

const { width } = Dimensions.get('window');
const GRAPH_WIDTH = width - 60;
const GRAPH_HEIGHT = 150;
const PADDING = 20;

interface DataPoint {
  timestamp: Date;
  value: number; // 0-1 range
}

interface TrendGraphProps {
  label: string;
  data: DataPoint[];
  color?: string;
}

export const TrendGraph: React.FC<TrendGraphProps> = ({ 
  label, 
  data, 
  color = '#8AA97C' 
}) => {
  if (data.length === 0) return null;

  const maxValue = 1; // Since values are 0-1
  const minValue = 0;
  
  const xScale = (GRAPH_WIDTH - 2 * PADDING) / (data.length - 1 || 1);
  const yScale = (GRAPH_HEIGHT - 2 * PADDING) / (maxValue - minValue);

  const getX = (index: number) => PADDING + index * xScale;
  const getY = (value: number) => GRAPH_HEIGHT - PADDING - (value - minValue) * yScale;

  // Create SVG path
  const pathData = data
    .map((point, index) => {
      const x = getX(index);
      const y = getY(point.value);
      return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    })
    .join(' ');

  // Format timestamp for x-axis labels
  const formatTime = (date: Date) => {
    const hours = date.getHours();
    const displayHours = hours % 12 || 12;
    const period = hours >= 12 ? 'PM' : 'AM';
    return `${displayHours}${period}`;
  };

  // Y-axis labels (percentages)
  const yAxisLabels = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{label}</Text>
      
      <Svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT}>
        {/* Y-axis grid lines */}
        {yAxisLabels.map((level) => (
          <React.Fragment key={`grid-${level}`}>
            <Line
              x1={PADDING}
              y1={getY(level)}
              x2={GRAPH_WIDTH - PADDING}
              y2={getY(level)}
              stroke="#DEDEDD"
              strokeWidth="0.5"
              strokeDasharray="2,2"
            />
            <SvgText
              x={PADDING - 10}
              y={getY(level) + 4}
              fontSize="10"
              fill="#999"
              textAnchor="end"
            >
              {(level * 100).toFixed(0)}%
            </SvgText>
          </React.Fragment>
        ))}

        {/* Trend line */}
        <Path
          d={pathData}
          stroke={color}
          strokeWidth="2"
          fill="none"
        />

        {/* Data points */}
        {data.map((point, index) => {
          const x = getX(index);
          const y = getY(point.value);
          
          return (
            <React.Fragment key={`point-${index}`}>
              <Circle
                cx={x}
                cy={y}
                r="4"
                fill={color}
              />
              {index % Math.max(1, Math.ceil(data.length / 4)) === 0 && (
                <SvgText
                  x={x}
                  y={GRAPH_HEIGHT - 5}
                  fontSize="10"
                  fill="#666"
                  textAnchor="middle"
                >
                  {formatTime(point.timestamp)}
                </SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 15,
    backgroundColor: '#F2F1ED',
    borderRadius: 12,
    padding: 15,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2B2B2B',
    marginBottom: 10,
  },
});