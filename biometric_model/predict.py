"""
Combined Real-Time Prediction with Sliding Window

Features:
- Configurable window size (default: 5)
- Real-time prediction using previous N rows
- Works with any trained model (auto-detects)
- Test mode: specify a row index to backtest
- Production mode: feed live data streams
- Comprehensive evaluation metrics

Usage:
    # Test mode (backtest on specific row)
    python predict_realtime.py --row 100 --window 5
    
    # Production mode (comment out test section, feed live data)
    predictor = RealtimePredictor(model, window_size=5)
    prediction = predictor.add_row_and_predict(new_biometric_data)
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Deque
from collections import deque
import time
import json
import argparse


class RealtimePredictor:
    """
    Real-time prediction using sliding window of previous N rows.
    
    Compatible with:
    - risk_predictor.pkl (base model)
    - risk_predictor_combined.pkl (combined training)
    - risk_predictor_augmented.pkl (augmented model)
    """
    
    def __init__(self, model, window_size: int = 5):
        """
        Initialize predictor with configurable window size.
        
        Args:
            model: Trained EnhancedRiskPredictor model
            window_size: Number of previous rows to use (default: 5)
        """
        self.model = model
        self.window_size = window_size
        self.buffer: Deque[Dict] = deque(maxlen=window_size)
        
        print(f"✓ Initialized RealtimePredictor with window_size={window_size}")
        print()
    
    def add_row(self, biometric_row: Dict):
        """Add a new biometric data row to the buffer"""
        self.buffer.append(biometric_row.copy())
    
    def reset(self):
        """Clear the buffer (start fresh)"""
        self.buffer.clear()
    
    def is_ready(self) -> bool:
        """Check if we have enough rows for prediction"""
        return len(self.buffer) == self.window_size
    
    def get_status(self) -> Dict:
        """Get current buffer status"""
        return {
            "current_rows": len(self.buffer),
            "target_window_size": self.window_size,
            "is_ready": self.is_ready(),
            "rows_needed": max(0, self.window_size - len(self.buffer))
        }
    
    def predict(self, use_temporal: bool = True) -> Dict:
        """
        Make prediction using current buffer.
        
        Args:
            use_temporal: Whether to use temporal context (default: True)
        
        Returns:
            Prediction dictionary with risk assessment, susceptibility, etc.
        """
        if not self.is_ready():
            raise ValueError(
                f"Need {self.window_size} rows before prediction. "
                f"Currently have {len(self.buffer)} rows."
            )
        
        # Get the most recent row (the one we're predicting for)
        current_row = self.buffer[-1]
        
        # If using temporal context, feed previous rows to model first
        if use_temporal and len(self.buffer) > 1:
            # Feed all previous rows to build temporal context
            for i in range(len(self.buffer) - 1):
                self.model.predict_realtime(self.buffer[i], use_temporal=True)
        
        # Make prediction on current row
        prediction = self.model.predict_realtime(current_row, use_temporal=use_temporal)
        
        # Add window metadata
        prediction['window_metadata'] = {
            'window_size_used': self.window_size,
            'temporal_context_enabled': use_temporal
        }
        
        return prediction
    
    def add_row_and_predict(self, biometric_row: Dict, use_temporal: bool = True) -> Optional[Dict]:
        """
        Convenience method: add row and predict if ready.
        
        Args:
            biometric_row: New biometric data
            use_temporal: Whether to use temporal context
        
        Returns:
            Prediction if buffer is full, None otherwise
        """
        self.add_row(biometric_row)
        
        if self.is_ready():
            return self.predict(use_temporal=use_temporal)
        
        return None
    
    def batch_predict_from_dataframe(
        self, 
        df: pd.DataFrame, 
        start_index: Optional[int] = None,
        stride: int = 1,
        use_temporal: bool = True
    ) -> List[Dict]:
        """
        Make predictions on a dataframe using sliding window.
        
        Args:
            df: DataFrame with biometric data
            start_index: Starting row index (must be >= window_size - 1)
            stride: Step size between predictions (default: 1 for every row)
            use_temporal: Whether to use temporal context
        
        Returns:
            List of predictions
        """
        predictions = []
        
        # Determine starting point
        if start_index is None:
            start_idx = self.window_size - 1
        else:
            if start_index < self.window_size - 1:
                raise ValueError(
                    f"start_index must be >= {self.window_size - 1} "
                    f"(need {self.window_size} rows for first prediction)"
                )
            start_idx = start_index
        
        # Reset buffer
        self.reset()
        
        # Fill initial buffer
        for i in range(start_idx - self.window_size + 1, start_idx + 1):
            self.add_row(df.iloc[i].to_dict())
        
        # Make first prediction
        pred = self.predict(use_temporal=use_temporal)
        pred['row_index'] = start_idx
        predictions.append(pred)
        
        # Continue with stride
        for i in range(start_idx + stride, len(df), stride):
            # Add new rows to buffer
            for j in range(i - stride + 1, i + 1):
                if j < len(df):
                    self.add_row(df.iloc[j].to_dict())
            
            if self.is_ready():
                pred = self.predict(use_temporal=use_temporal)
                pred['row_index'] = i
                predictions.append(pred)
        
        return predictions


def load_latest_model():
    """Load the most recently trained model"""
    model_dir = Path("./model")
    
    # Check for models in priority order
    model_options = [
        ("risk_predictor_combined.pkl", "Combined (Base + Augmented)"),
        ("risk_predictor_augmented.pkl", "Augmented Data"),
        ("risk_predictor.pkl", "Base Model")
    ]
    
    for model_file, description in model_options:
        model_path = model_dir / model_file
        if model_path.exists():
            print(f"Found model: {description}")
            print(f"Path: {model_path}")
            
            from risk import EnhancedRiskPredictor
            model = EnhancedRiskPredictor.load(str(model_path))
            
            print("✓ Model loaded successfully")
            print()
            return model, model_path
    
    raise FileNotFoundError(
        "No trained model found. Please train a model first:\n"
        "  python train_combined.py"
    )


def load_test_data():
    """Load test data for predictions"""
    data_paths = [
        Path("./data/extracted_features/extracted_features.csv"),
        Path("./data/augmented_data/augmented_temporal_data.csv"),
        Path("./data/augmented_data/augmented_data.csv"),
        Path("extracted_features.csv")
    ]
    
    for path in data_paths:
        if path.exists():
            print(f"Loading data from: {path}")
            df = pd.read_csv(path)
            
            # Clean data
            df = df.dropna(subset=['hrMean', 'sdnn', 'rmssd'])
            
            print(f"✓ Loaded {len(df):,} valid rows")
            print()
            return df
    
    raise FileNotFoundError("No test data found")


def print_prediction_summary(prediction: Dict, row_index: int):
    """Print a formatted prediction summary"""
    print("="*80)
    print(f"PREDICTION FOR ROW {row_index}")
    print("="*80)
    print()
    
    # Risk dimensions with numeric levels
    print("RISK FACTORS")
    print("-"*80)
    dimensions = ['stress', 'health', 'sleep_fatigue', 'cognitive_fatigue', 'physical_exertion']
    
    for dim in dimensions:
        risk = prediction['risk_assessment'][dim]
        # Convert level (0-3) to risk scale (1-5)
        # 0 (No Risk) -> 1, 1 (Low) -> 2, 2 (Moderate) -> 3, 3 (High) -> 4-5 based on confidence
        level_map = {0: 1, 1: 2, 2: 3, 3: 4}
        numeric_level = level_map.get(risk['level'], 1)
        # Boost to 5 if high risk with high confidence
        if risk['level'] == 3 and risk['confidence'] > 0.7:
            numeric_level = 5
        
        print(f"  {dim:20s}: Level {numeric_level}/5 (confidence: {risk['confidence']:.3f})")
    print()
    
    # Overall assessment
    print("OVERALL RISK")
    print("-"*80)
    print(f"  Susceptibility: {prediction['overall_susceptibility']:.3f}")
    print(f"  Alert Level: {prediction['alert_level']}")
    print()
    
    # Time to bad decision
    print("TIME TO BAD DECISION")
    print("-"*80)
    print(f"  Estimated Time: {prediction['time_to_risk_minutes']:.1f} min")
    print(f"  Range: {prediction['time_to_risk_range']['lower']:.1f} - {prediction['time_to_risk_range']['upper']:.1f} min")
    print()



def test_mode(model, df, row_index: int, window_size: int, use_temporal: bool = True):
    """
    Test mode: Make prediction for a specific row using previous N rows.
    
    Args:
        model: Trained model
        df: Test dataframe
        row_index: Row to predict (must be >= window_size - 1)
        window_size: Number of previous rows to use
        use_temporal: Whether to use temporal context
    """
    print("="*80)
    print("TEST MODE - BACKTESTING ON SPECIFIC ROW")
    print("="*80)
    print()
    
    if row_index < window_size - 1:
        print(f"❌ Error: row_index must be >= {window_size - 1}")
        print(f"   Need {window_size} rows for prediction")
        return
    
    if row_index >= len(df):
        print(f"❌ Error: row_index {row_index} exceeds dataset size {len(df)}")
        return
    
    print(f"Settings:")
    print(f"  Window Size: {window_size}")
    print(f"  Target Row: {row_index}")
    print(f"  Using rows: {row_index - window_size + 1} to {row_index}")
    print(f"  Temporal Context: {'Enabled' if use_temporal else 'Disabled'}")
    print()
    
    # Create predictor
    predictor = RealtimePredictor(model, window_size=window_size)
    
    # Show the window data
    print("WINDOW DATA")
    print("-"*80)
    window_data = df.iloc[row_index - window_size + 1:row_index + 1]
    
    key_features = ['hrMean', 'hrStd', 'sdnn', 'rmssd', 'movementIntensity']
    available_features = [f for f in key_features if f in window_data.columns]
    
    if available_features:
        print(window_data[available_features].to_string())
    else:
        print("Key features not found in data")
    print()
    
    # Make prediction
    print("Making prediction...")
    start_time = time.time()
    
    # Add rows to buffer
    for i in range(row_index - window_size + 1, row_index + 1):
        predictor.add_row(df.iloc[i].to_dict())
    
    # Predict
    prediction = predictor.predict(use_temporal=use_temporal)
    
    latency = (time.time() - start_time) * 1000
    print(f"✓ Prediction complete in {latency:.2f}ms")
    print()
    
    # Print results
    print_prediction_summary(prediction, row_index)
    

def batch_test_mode(model, df, num_predictions: int, window_size: int, stride: int = 1):
    """
    Batch test mode: Make multiple predictions and show statistics.
    
    Args:
        model: Trained model
        df: Test dataframe
        num_predictions: Number of predictions to make
        window_size: Number of previous rows to use
        stride: Step between predictions
    """
    print("="*80)
    print("BATCH TEST MODE - MULTIPLE PREDICTIONS")
    print("="*80)
    print()
    
    print(f"Settings:")
    print(f"  Window Size: {window_size}")
    print(f"  Number of Predictions: {num_predictions}")
    print(f"  Stride: {stride}")
    print()
    
    # Create predictor
    predictor = RealtimePredictor(model, window_size=window_size)
    
    # Make predictions
    print("Making predictions...")
    start_time = time.time()
    
    predictions = predictor.batch_predict_from_dataframe(
        df,
        start_index=window_size - 1,
        stride=stride,
        use_temporal=True
    )
    
    # Limit to requested number
    predictions = predictions[:num_predictions]
    
    total_time = time.time() - start_time
    print(f"✓ Made {len(predictions)} predictions in {total_time:.2f}s")
    print(f"  Average: {(total_time / len(predictions)) * 1000:.2f}ms per prediction")
    print()
    
    # Statistics
    print("="*80)
    print("PREDICTION STATISTICS")
    print("="*80)
    print()
    
    susceptibility = np.array([p['overall_susceptibility'] for p in predictions])
    time_to_risk = np.array([p['time_to_risk_minutes'] for p in predictions])
    
    print("Overall Susceptibility:")
    print(f"  Mean: {susceptibility.mean():.3f}")
    print(f"  Std: {susceptibility.std():.3f}")
    print(f"  Range: [{susceptibility.min():.3f}, {susceptibility.max():.3f}]")
    print()
    
    print("Time to Risk:")
    print(f"  Mean: {time_to_risk.mean():.1f} min")
    print(f"  Range: [{time_to_risk.min():.1f}, {time_to_risk.max():.1f}] min")
    print()
    
    # Alert distribution
    from collections import Counter
    alerts = [p['alert_level'] for p in predictions]
    alert_dist = Counter(alerts)
    
    print("Alert Distribution:")
    for level in ["NO ALERT", "LOW ALERT", "MODERATE ALERT", "HIGH ALERT", "CRITICAL ALERT"]:
        count = alert_dist.get(level, 0)
        pct = count / len(predictions) * 100
        print(f"  {level:20s}: {count:4d} ({pct:5.1f}%)")
    print()
    
    # Show first few predictions
    print("SAMPLE PREDICTIONS (first 5)")
    print("="*80)
    for i, pred in enumerate(predictions[:5]):
        print(f"\nRow {pred['row_index']}:")
        print(f"  Susceptibility: {pred['overall_susceptibility']:.3f}")
        print(f"  Alert: {pred['alert_level']}")
        print(f"  Time to Risk: {pred['time_to_risk_minutes']:.1f} min")


def production_mode_example(model, window_size: int = 5):
    """
    Example of how to use in production with live data stream.
    
    This shows the pattern for real-time usage.
    """
    print("="*80)
    print("PRODUCTION MODE - EXAMPLE USAGE")
    print("="*80)
    print()
    
    print("This is an example of how to use the predictor in production.")
    print("In production, you would feed live biometric data as it arrives.")
    print()
    
    # Create predictor
    predictor = RealtimePredictor(model, window_size=window_size)
    
    print("Example code:")
    print("-"*80)
    print("""
# Initialize predictor
predictor = RealtimePredictor(model, window_size=5)

# As new biometric data arrives (e.g., every minute)
def on_new_biometric_data(data):
    # data format: {'hrMean': 75, 'sdnn': 50, 'rmssd': 45, ...}
    
    prediction = predictor.add_row_and_predict(data)
    
    if prediction is None:
        # Still warming up buffer (need more rows)
        status = predictor.get_status()
        print(f"Need {status['rows_needed']} more rows")
        return
    
    # We have a prediction!
    susceptibility = prediction['overall_susceptibility']
    alert = prediction['alert_level']
    time_to_risk = prediction['time_to_risk_minutes']
    
    print(f"Susceptibility: {susceptibility:.3f}")
    print(f"Alert: {alert}")
    print(f"Time to risk: {time_to_risk:.1f} min")
    
    # Take action based on alert level
    if alert in ["HIGH ALERT", "CRITICAL ALERT"]:
        send_notification_to_user(prediction)
    
    return prediction

# To reset and start fresh
predictor.reset()
    """)
    print("-"*80)
    print()
    
    # Simulate with sample data
    print("Simulating live data stream...")
    print()
    
    sample_data = [
        {'hrMean': 72, 'sdnn': 55, 'rmssd': 48, 'movementIntensity': 0.002, 'qualityScore': 0.95},
        {'hrMean': 74, 'sdnn': 53, 'rmssd': 46, 'movementIntensity': 0.003, 'qualityScore': 0.93},
        {'hrMean': 76, 'sdnn': 50, 'rmssd': 44, 'movementIntensity': 0.004, 'qualityScore': 0.92},
        {'hrMean': 78, 'sdnn': 48, 'rmssd': 42, 'movementIntensity': 0.005, 'qualityScore': 0.90},
        {'hrMean': 82, 'sdnn': 45, 'rmssd': 38, 'movementIntensity': 0.006, 'qualityScore': 0.88},
        {'hrMean': 85, 'sdnn': 42, 'rmssd': 35, 'movementIntensity': 0.007, 'qualityScore': 0.85},
    ]
    
    for i, data in enumerate(sample_data, 1):
        print(f"Minute {i}: New data received")
        print(f"  HR: {data['hrMean']:.1f} BPM, SDNN: {data['sdnn']:.1f} ms")
        
        prediction = predictor.add_row_and_predict(data)
        
        if prediction is None:
            status = predictor.get_status()
            print(f"  → Buffering... ({status['current_rows']}/{status['target_window_size']})")
        else:
            print(f"  → Susceptibility: {prediction['overall_susceptibility']:.3f}")
            print(f"  → Alert: {prediction['alert_level']}")
        
        print()


def main():
    """Main entry point with command-line arguments"""
    parser = argparse.ArgumentParser(
        description="Real-time prediction with sliding window",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Test single prediction at row 100 with window size 5
  python predict_realtime.py --row 100 --window 5
  
  # Test with larger window
  python predict_realtime.py --row 200 --window 8
  
  # Batch test with 50 predictions
  python predict_realtime.py --batch 50 --window 5
  
  # Show production example
  python predict_realtime.py --production-example --window 5
        """
    )
    
    parser.add_argument('--row', type=int, help='Row index to predict (test mode)')
    parser.add_argument('--window', type=int, default=5, help='Window size (default: 5)')
    parser.add_argument('--batch', type=int, help='Number of predictions for batch test')
    parser.add_argument('--stride', type=int, default=1, help='Stride for batch predictions (default: 1)')
    parser.add_argument('--no-temporal', action='store_true', help='Disable temporal context')
    parser.add_argument('--production-example', action='store_true', help='Show production usage example')
    
    args = parser.parse_args()
    
    print("="*80)
    print("REAL-TIME PREDICTION WITH SLIDING WINDOW")
    print("="*80)
    print()
    
    # Load model
    print("Loading model...")
    model, model_path = load_latest_model()
    
    # Production example mode (doesn't need data)
    if args.production_example:
        production_mode_example(model, window_size=args.window)
        return
    
    # Load test data
    print("Loading test data...")
    df = load_test_data()
    
    # Run appropriate mode
    if args.batch:
        batch_test_mode(model, df, args.batch, args.window, args.stride)
    elif args.row is not None:
        test_mode(model, df, args.row, args.window, use_temporal=not args.no_temporal)
    else:
        # Default: show single prediction example
        print("No mode specified. Showing single prediction example...")
        print("Use --row to specify a row, --batch for multiple predictions,")
        print("or --production-example for production usage.")
        print()
        
        # Show a default prediction
        default_row = max(args.window - 1, 20)
        if default_row < len(df):
            test_mode(model, df, default_row, args.window, use_temporal=not args.no_temporal)
        else:
            print(f"Not enough data. Need at least {default_row + 1} rows.")


if __name__ == "__main__":
    main()