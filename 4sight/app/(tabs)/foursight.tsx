import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Fonts } from '@/constants/theme';

export default function FoursightScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>4sight</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDECE7',
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '400',
    color: '#1B1B1B',
    fontFamily: Fonts.sans,
  },
});
