"""
Test client for Risk Prediction API

Simple script to test the API with example data.

Usage:
    python test_api.py
"""

import requests
import json
from typing import Dict, List

# API configuration
API_URL = "http://localhost:8000"


def test_health_check():
    """Test the health check endpoint"""
    print("=" * 80)
    print("TESTING HEALTH CHECK")
    print("=" * 80)
    print()
    
    response = requests.get(f"{API_URL}/health")
    
    if response.status_code == 200:
        data = response.json()
        print("✓ API is online")
        print(f"  Status: {data['status']}")
        print(f"  Model loaded: {data['model_loaded']}")
        print()
        return True
    else:
        print(f"❌ Health check failed: {response.status_code}")
        print()
        return False


def test_prediction(data: Dict):
    """Test a prediction request"""
    print("=" * 80)
    print("TESTING PREDICTION")
    print("=" * 80)
    print()
    
    print(f"Sending {len(data['data'])} rows of biometric data...")
    print()
    
    response = requests.post(
        f"{API_URL}/predict",
        json=data,
        headers={"Content-Type": "application/json"}
    )
    
    if response.status_code == 200:
        result = response.json()
        
        print("✓ Prediction successful")
        print()
        
        # Print formatted results
        print("RISK FACTORS")
        print("-" * 80)
        for factor_name, factor_data in result['risk_factors'].items():
            factor_display = factor_name.replace('_', ' ').title()
            print(f"  {factor_display:20s}: Level {factor_data['level']}/5 (confidence: {factor_data['confidence']:.3f})")
        
        print()
        print("OVERALL RISK")
        print("-" * 80)
        print(f"  Susceptibility: {result['overall_risk']['susceptibility']:.3f}")
        print(f"  Alert Level: {result['overall_risk']['alert_level']}")
        
        print()
        print("TIME TO BAD DECISION")
        print("-" * 80)
        print(f"  Estimated Time: {result['time_to_bad_decision']['estimated_time']:.1f} min")
        print(f"  Range: {result['time_to_bad_decision']['range_lower']:.1f} - {result['time_to_bad_decision']['range_upper']:.1f} min")
        print()
        
        return result
    else:
        print(f"❌ Prediction failed: {response.status_code}")
        print(f"   Error: {response.text}")
        print()
        return None


def test_minimal_data():
    """Test with single row from actual data"""
    print("=" * 80)
    print("TESTING WITH SINGLE ROW")
    print("=" * 80)
    print()
    
    # Use one row from the actual CSV format
    single_row_data = {
        "data": [
            {
                "windowId": 0,
                "timestamp": 0,
                "durationMs": 27000,
                "accelEnergy": 858.9990234375,
                "accelMagnitudeMax": 3.235054276495991,
                "accelMagnitudeMean": 0.9897393157732727,
                "accelMagnitudeStd": 0.1209459362481675,
                "accelMeanX": 0.39104094328703703,
                "accelMeanY": -0.6777886284722222,
                "accelMeanZ": 0.17494936342592593,
                "accelStdX": 0.26614170734680953,
                "accelStdY": 0.5126409843854675,
                "accelStdZ": 0.13289816193201195,
                "movementIntensity": 0.014627919494945798,
                "cvnn": 0.14405120006869815,
                "cvsd": 0.18763903500727006,
                "hrMax": 147.69230769230768,
                "hrMean": 96.44751844043174,
                "hrMin": 62.950819672131146,
                "hrStd": 16.003182413034185,
                "iqrRR": 62.5,
                "meanRR": 636.6185897435897,
                "medianRR": 640.625,
                "rangeRR": 546.875,
                "pnn20": 50.0,
                "pnn50": 21.052631578947366,
                "rmssd": 119.45449784717633,
                "sdnn": 91.7056718386063,
                "sdsd": 119.45379015948413,
                "poincareArea": 26115.020580896497,
                "sd1": 84.4665850602061,
                "sd1sd2": 0.8582807513886118,
                "sd2": 98.41370078910388,
                "peakCount": 40,
                "qualityScore": 1.0,
                "validRRCount": 39
            }
        ],
        "window_size": 1
    }
    
    return test_prediction(single_row_data)


def test_high_stress_scenario():
    """Test with high stress indicators (simulated)"""
    print("=" * 80)
    print("TESTING HIGH STRESS SCENARIO")
    print("=" * 80)
    print()
    
    # Create high stress scenario by modifying known good data
    # High HR, low HRV = stress
    high_stress_data = {
        "data": [
            {
                "windowId": 0,
                "timestamp": 0,
                "durationMs": 27000,
                "accelEnergy": 858.9990234375,
                "accelMagnitudeMax": 3.235054276495991,
                "accelMagnitudeMean": 0.9897393157732727,
                "accelMagnitudeStd": 0.1209459362481675,
                "accelMeanX": 0.39104094328703703,
                "accelMeanY": -0.6777886284722222,
                "accelMeanZ": 0.17494936342592593,
                "accelStdX": 0.26614170734680953,
                "accelStdY": 0.5126409843854675,
                "accelStdZ": 0.13289816193201195,
                "movementIntensity": 0.025,  # Higher movement
                "cvnn": 0.14405120006869815,
                "cvsd": 0.18763903500727006,
                "hrMax": 155.0,  # Higher max HR
                "hrMean": 110.0,  # Higher mean HR (stressed)
                "hrMin": 85.0,  # Higher min HR
                "hrStd": 25.0,  # Higher variability
                "iqrRR": 62.5,
                "meanRR": 545.0,  # Lower RR (faster HR)
                "medianRR": 540.0,
                "rangeRR": 546.875,
                "pnn20": 15.0,  # Lower parasympathetic
                "pnn50": 5.0,  # Much lower
                "rmssd": 35.0,  # Low HRV (stressed)
                "sdnn": 28.0,  # Low HRV
                "sdsd": 35.0,
                "poincareArea": 5000.0,  # Low area
                "sd1": 25.0,
                "sd1sd2": 0.5,
                "sd2": 50.0,
                "peakCount": 45,
                "qualityScore": 0.95,
                "validRRCount": 44
            },
            {
                "windowId": 1,
                "timestamp": 27000,
                "durationMs": 27000,
                "accelEnergy": 858.9990234375,
                "accelMagnitudeMax": 3.235054276495991,
                "accelMagnitudeMean": 0.9897393157732727,
                "accelMagnitudeStd": 0.1209459362481675,
                "accelMeanX": 0.39104094328703703,
                "accelMeanY": -0.6777886284722222,
                "accelMeanZ": 0.17494936342592593,
                "accelStdX": 0.26614170734680953,
                "accelStdY": 0.5126409843854675,
                "accelStdZ": 0.13289816193201195,
                "movementIntensity": 0.028,
                "cvnn": 0.14405120006869815,
                "cvsd": 0.18763903500727006,
                "hrMax": 158.0,
                "hrMean": 112.0,
                "hrMin": 88.0,
                "hrStd": 26.0,
                "iqrRR": 62.5,
                "meanRR": 535.0,
                "medianRR": 530.0,
                "rangeRR": 546.875,
                "pnn20": 12.0,
                "pnn50": 3.0,
                "rmssd": 30.0,
                "sdnn": 25.0,
                "sdsd": 30.0,
                "poincareArea": 4500.0,
                "sd1": 22.0,
                "sd1sd2": 0.45,
                "sd2": 48.0,
                "peakCount": 46,
                "qualityScore": 0.93,
                "validRRCount": 45
            },
            {
                "windowId": 2,
                "timestamp": 54000,
                "durationMs": 27000,
                "accelEnergy": 858.9990234375,
                "accelMagnitudeMax": 3.235054276495991,
                "accelMagnitudeMean": 0.9897393157732727,
                "accelMagnitudeStd": 0.1209459362481675,
                "accelMeanX": 0.39104094328703703,
                "accelMeanY": -0.6777886284722222,
                "accelMeanZ": 0.17494936342592593,
                "accelStdX": 0.26614170734680953,
                "accelStdY": 0.5126409843854675,
                "accelStdZ": 0.13289816193201195,
                "movementIntensity": 0.030,
                "cvnn": 0.14405120006869815,
                "cvsd": 0.18763903500727006,
                "hrMax": 160.0,
                "hrMean": 115.0,
                "hrMin": 90.0,
                "hrStd": 28.0,
                "iqrRR": 62.5,
                "meanRR": 520.0,
                "medianRR": 515.0,
                "rangeRR": 546.875,
                "pnn20": 10.0,
                "pnn50": 2.0,
                "rmssd": 25.0,
                "sdnn": 22.0,
                "sdsd": 25.0,
                "poincareArea": 4000.0,
                "sd1": 18.0,
                "sd1sd2": 0.4,
                "sd2": 45.0,
                "peakCount": 48,
                "qualityScore": 0.92,
                "validRRCount": 47
            }
        ],
        "window_size": 3
    }
    
    return test_prediction(high_stress_data)


def test_from_file(filepath: str = "test_data.json"):
    """Test using data from a JSON file"""
    print("=" * 80)
    print(f"TESTING WITH DATA FROM {filepath}")
    print("=" * 80)
    print()
    
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        return test_prediction(data)
    except FileNotFoundError:
        print(f"❌ File not found: {filepath}")
        print()
        return None
    except json.JSONDecodeError:
        print(f"❌ Invalid JSON in file: {filepath}")
        print()
        return None


def main():
    """Run all tests"""
    print("=" * 80)
    print("RISK PREDICTION API - TEST CLIENT")
    print("=" * 80)
    print()
    
    # Test health check
    if not test_health_check():
        print("⚠ API is not responding. Make sure the server is running:")
        print("   uvicorn api:app --reload")
        print()
        return
    
    # Test with file data (if available)
    test_from_file("test_data.json")
    
    # Test minimal data
    test_minimal_data()
    
    # Test high stress scenario
    test_high_stress_scenario()
    
    print("=" * 80)
    print("ALL TESTS COMPLETE")
    print("=" * 80)
    print()


if __name__ == "__main__":
    main()