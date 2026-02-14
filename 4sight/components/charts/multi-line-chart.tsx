import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Circle } from 'react-native-svg';

interface Series {
  data: number[];
  color: string;
  label: string;
}

interface MultiLineChartProps {
  series: Series[];
  width: number;
  height: number;
  strokeWidth?: number;
  showLegend?: boolean;
  label?: string;
}

function downsample(data: number[], maxPoints: number): number[] {
  if (data.length <= maxPoints) return data;
  const stride = data.length / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(data[Math.floor(i * stride)]);
  }
  return out;
}

export function MultiLineChart({
  series,
  width,
  height,
  strokeWidth = 1.5,
  showLegend = false,
  label,
}: MultiLineChartProps) {
  const padding = { top: 4, bottom: 16, left: 32, right: 8 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const { paths, globalMin, globalMax } = useMemo(() => {
    let gMin = Infinity;
    let gMax = -Infinity;

    for (const s of series) {
      for (const v of s.data) {
        if (v < gMin) gMin = v;
        if (v > gMax) gMax = v;
      }
    }
    const range = gMax - gMin || 1;

    const result = series.map((s) => {
      const sampled = downsample(s.data, Math.min(s.data.length, chartW));
      const points = sampled.map((v, i) => {
        const x = padding.left + (i / (sampled.length - 1)) * chartW;
        const y = padding.top + chartH - ((v - gMin) / range) * chartH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      });
      return { path: points.join(''), color: s.color, label: s.label };
    });

    return { paths: result, globalMin: gMin, globalMax: gMax };
  }, [series, chartW, chartH, padding.left, padding.top]);

  if (series.every((s) => s.data.length === 0)) return null;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      {showLegend && (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}
      <Svg width={width} height={height}>
        {/* Grid */}
        {[1, 2, 3].map((i) => {
          const y = padding.top + (chartH / 4) * i;
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
        <SvgText x={padding.left - 4} y={padding.top + 10} textAnchor="end" fontSize={9} fill="#999">
          {globalMax.toFixed(1)}
        </SvgText>
        <SvgText x={padding.left - 4} y={padding.top + chartH} textAnchor="end" fontSize={9} fill="#999">
          {globalMin.toFixed(1)}
        </SvgText>

        {/* Data lines */}
        {paths.map((p) => (
          <Path key={p.label} d={p.path} stroke={p.color} strokeWidth={strokeWidth} fill="none" />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 4 },
  label: { fontSize: 11, fontWeight: '600', marginBottom: 2, marginLeft: 32, color: '#666' },
  legend: { flexDirection: 'row', gap: 12, marginBottom: 4, marginLeft: 32 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#666' },
});
