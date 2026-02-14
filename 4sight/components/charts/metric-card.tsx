import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}

export function MetricCard({ label, value, unit, color = '#333' }: MetricCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={[styles.value, { color }]}>
          {typeof value === 'number' ? value.toFixed(value > 100 ? 0 : 1) : value}
        </Text>
        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    minWidth: '45%',
  },
  label: { fontSize: 10, color: '#888', fontWeight: '500', marginBottom: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  value: { fontSize: 18, fontWeight: '700' },
  unit: { fontSize: 10, color: '#999' },
});
