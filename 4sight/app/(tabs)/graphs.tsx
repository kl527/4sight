import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Text, ActivityIndicator } from 'react-native';
import { RadarChart } from '@/components/RadarChart';
import { TrendGraph } from '@/components/TrendGraph';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:5000';

interface PredictionResponse {
  timestamp: number;
  riskAssessment: {
    stress: number;
    health: number;
    sleepFatigue: number;
    cognitiveFatigue: number;
    physicalExertion: number;
  };
  overallSusceptibility: number;
  timeToRiskMinutes: number;
  timeToRiskRange: {
    lower: number;
    upper: number;
    confidenceInterval: string;
  };
  alertLevel: string;
  modelConfidence: {
    average: number;
    min: number;
  };
}

interface DataPoint {
  timestamp: Date;
  value: number;
}

export default function GraphsScreen() {
  const [currentScores, setCurrentScores] = useState({
    stress: 0,
    health: 0,
    sleepFatigue: 0,
    cognitiveFatigue: 0,
    physicalExertion: 0,
  });

  const [trendData, setTrendData] = useState<{
    stress: DataPoint[];
    health: DataPoint[];
    sleepFatigue: DataPoint[];
    cognitiveFatigue: DataPoint[];
    physicalExertion: DataPoint[];
  }>({
    stress: [],
    health: [],
    sleepFatigue: [],
    cognitiveFatigue: [],
    physicalExertion: [],
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
    // Refresh every minute
    const interval = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // Fetch current prediction
      const response = await fetch(`${BACKEND_URL}/api/predict`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch data');
      
      const data: PredictionResponse = await response.json();
      
      // Set current risk scores
      setCurrentScores({
        stress: data.riskAssessment.stress,
        health: data.riskAssessment.health,
        sleepFatigue: data.riskAssessment.sleepFatigue,
        cognitiveFatigue: data.riskAssessment.cognitiveFatigue,
        physicalExertion: data.riskAssessment.physicalExertion,
      });
      
      // Update trend data (keep last 24 data points)
      const newDataPoint = {
        timestamp: new Date(data.timestamp),
        value: 0, // Will be set per metric
      };

      setTrendData(prev => {
        const maxPoints = 24; // Keep last 24 readings
        
        const addDataPoint = (prevData: DataPoint[], value: number) => {
          const updated = [...prevData, { ...newDataPoint, value }];
          return updated.slice(-maxPoints);
        };

        return {
          stress: addDataPoint(prev.stress, data.riskAssessment.stress),
          health: addDataPoint(prev.health, data.riskAssessment.health),
          sleepFatigue: addDataPoint(prev.sleepFatigue, data.riskAssessment.sleepFatigue),
          cognitiveFatigue: addDataPoint(prev.cognitiveFatigue, data.riskAssessment.cognitiveFatigue),
          physicalExertion: addDataPoint(prev.physicalExertion, data.riskAssessment.physicalExertion),
        };
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch risk scores:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#8AA97C" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Risk Analysis</Text>
      </View>
      
      <RadarChart scores={currentScores} />
      
      <View style={styles.trendsContainer}>
        <Text style={styles.sectionTitle}>Historical Trends</Text>
        
        {trendData.stress.length > 1 && (
          <>
            <TrendGraph 
              label="Stress" 
              data={trendData.stress}
              color="#E07B39"
            />
            <TrendGraph 
              label="Health" 
              data={trendData.health}
              color="#8AA97C"
            />
            <TrendGraph 
              label="Sleep Fatigue" 
              data={trendData.sleepFatigue}
              color="#D84315"
            />
            <TrendGraph 
              label="Cognitive Fatigue" 
              data={trendData.cognitiveFatigue}
              color="#4F9D9D"
            />
            <TrendGraph 
              label="Physical Exertion" 
              data={trendData.physicalExertion}
              color="#9D4F9D"
            />
          </>
        )}
        
        {trendData.stress.length <= 1 && (
          <View style={styles.noDataContainer}>
            <Text style={styles.noDataText}>
              Building trend history...
            </Text>
            <Text style={styles.noDataSubtext}>
              Keep the app running to see your risk trends over time
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDECE7',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2B2B2B',
  },
  trendsContainer: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2B2B2B',
    marginBottom: 15,
  },
  noDataContainer: {
    padding: 30,
    alignItems: 'center',
  },
  noDataText: {
    textAlign: 'center',
    color: '#2B2B2B',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  noDataSubtext: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
  },
});