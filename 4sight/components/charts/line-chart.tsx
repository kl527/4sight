import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';

interface LineChartProps {
  data: number[];
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
  label?: string;
  yAxisLabel?: string;
  showGrid?: boolean;
}

/** Downsample to at most `maxPoints` using stride. */
function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;
  const stride = data.length / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(data[Math.floor(i * stride)]);
  }
  return out;
}

export function LineChart({
  data,
  width,
  height,
  color,
  strokeWidth = 1.5,
  label,
  yAxisLabel,
  showGrid = true,
}: LineChartProps) {
  const padding = { top: 4, bottom: 16, left: yAxisLabel ? 40 : 32, right: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const { path, minVal, maxVal } = useMemo(() => {
    if (data.length === 0) return { path: '', minVal: 0, maxVal: 0 };

    const sampled = downsample(data, Math.min(data.length, chartW));
    let min = sampled[0];
    let max = sampled[0];
    for (const v of sampled) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    const points = sampled.map((v, i) => {
      const x = padding.left + (i / (sampled.length - 1)) * chartW;
      const y = padding.top + chartH - ((v - min) / range) * chartH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return { path: points.join(''), minVal: min, maxVal: max };
  }, [data, chartW, chartH, padding.left, padding.top]);

  if (data.length === 0) return null;

  const gridLines = showGrid ? 3 : 0;

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color }]}>{label}</Text>}
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {Array.from({ length: gridLines }).map((_, i) => {
          const y = padding.top + (chartH / (gridLines + 1)) * (i + 1);
          return (
            <Line
              key={i}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#e0e0e0"
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          );
        })}

        {/* Y-axis labels */}
        <SvgText
          x={padding.left - 4}
          y={padding.top + 10}
          textAnchor="end"
          fontSize={9}
          fill="#999"
        >
          {maxVal.toFixed(maxVal > 100 ? 0 : 1)}
        </SvgText>
        <SvgText
          x={padding.left - 4}
          y={padding.top + chartH}
          textAnchor="end"
          fontSize={9}
          fill="#999"
        >
          {minVal.toFixed(minVal > 100 ? 0 : 1)}
        </SvgText>

        {/* Data line */}
        <Path d={path} stroke={color} strokeWidth={strokeWidth} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 4 },
  label: { fontSize: 11, fontWeight: '600', marginBottom: 2, marginLeft: 32 },
});
