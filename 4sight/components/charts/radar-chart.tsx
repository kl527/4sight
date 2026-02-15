import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Polygon,
  Text as SvgText,
  Defs,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { Fonts } from '@/constants/theme';

interface RadarChartProps {
  labels: string[];
  values: number[]; // 0–1 normalized
  size?: number;
}

export function RadarChart({ labels, values, size = 280 }: RadarChartProps) {
  const padding = 50; // extra room so labels aren't clipped
  const svgSize = size + padding * 2;
  const center = svgSize / 2;
  const radius = size * 0.38;
  const n = labels.length;

  const vertices = useMemo(() => {
    return labels.map((_, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2; // start from top
      return {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
        angle,
      };
    });
  }, [n, center, radius]);

  const outlinePoints = vertices.map((v) => `${v.x},${v.y}`).join(' ');

  // Ensure a minimum visible polygon even when all values are near zero
  const MIN_VISIBLE = 0.08;
  const dataPoints = useMemo(() => {
    return values
      .map((val, i) => {
        const clamped = Math.max(MIN_VISIBLE, Math.min(1, val));
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const x = center + radius * clamped * Math.cos(angle);
        const y = center + radius * clamped * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');
  }, [values, n, center, radius]);

  // Position labels with anchor-aware placement
  const labelPositions = useMemo(() => {
    const labelOffset = 20;
    return vertices.map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const lx = center + (radius + labelOffset) * Math.cos(angle);
      const ly = center + (radius + labelOffset) * Math.sin(angle);

      // Determine text anchor based on horizontal position
      const normalizedAngle = ((angle + Math.PI * 2) % (Math.PI * 2));
      let anchor: 'middle' | 'start' | 'end' = 'middle';
      if (Math.abs(Math.cos(angle)) < 0.15) {
        // Near top or bottom — center
        anchor = 'middle';
      } else if (Math.cos(angle) > 0) {
        anchor = 'start';
      } else {
        anchor = 'end';
      }

      // Vertical adjustment
      let dy = 0;
      if (Math.sin(angle) < -0.5) dy = -4; // top labels: shift up
      if (Math.sin(angle) > 0.5) dy = 12;  // bottom labels: shift down

      return { x: lx, y: ly + dy, anchor };
    });
  }, [vertices, n, center, radius]);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} viewBox={`0 0 ${svgSize} ${svgSize}`}>
        <Defs>
          <RadialGradient
            id="dataGradient"
            cx={center.toString()}
            cy={center.toString()}
            rx={radius.toString()}
            ry={radius.toString()}
          >
            <Stop offset="0" stopColor="#E8C4BC" stopOpacity="0.85" />
            <Stop offset="0.6" stopColor="#EDCFC8" stopOpacity="0.6" />
            <Stop offset="1" stopColor="#F0D5CE" stopOpacity="0.3" />
          </RadialGradient>
        </Defs>

        {/* Pentagon outline */}
        <Polygon
          points={outlinePoints}
          fill="none"
          stroke="#2B2B2B"
          strokeWidth={1.2}
        />

        {/* Data shape with gradient fill */}
        <Polygon
          points={dataPoints}
          fill="url(#dataGradient)"
          stroke="none"
        />

        {/* Labels with values */}
        {labels.map((label, i) => {
          const pos = labelPositions[i];
          const pct = Math.round((values[i] ?? 0) * 100);
          return (
            <React.Fragment key={label}>
              <SvgText
                x={pos.x}
                y={pos.y}
                textAnchor={pos.anchor}
                fontSize={13}
                fontFamily={Fonts.sans}
                fill="#2B2B2B"
              >
                {label}
              </SvgText>
              <SvgText
                x={pos.x}
                y={pos.y + 14}
                textAnchor={pos.anchor}
                fontSize={11}
                fontFamily={Fonts.sans}
                fill="#979592"
              >
                {pct}%
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16,
  },
});
