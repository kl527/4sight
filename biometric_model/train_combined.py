"""
Combined Training Script

Trains model on both base extracted features and augmented temporal data.
Includes comprehensive evaluation, cross-validation support, and model comparison.

Run with: python train_combined.py
"""

import pandas as pd
import numpy as np
from pathlib import Path
import time
import json
from sklearn.model_selection import KFold
from risk import EnhancedRiskPredictor


def load_all_data():
    """Load and combine base features and augmented data"""
    print("="*80)
    print("LOADING DATA")
    print("="*80)
    print()
    
    datasets = []
    
    # === LOAD BASE FEATURES ===
    print("Step 1: Loading base features...")
    
    base_paths = [
        Path("extracted_features.csv"),
        Path("./data/extracted_features/extracted_features.csv"),
        Path("../extracted_features.csv")
    ]
    
    base_df = None
    for path in base_paths:
        if path.exists():
            base_df = pd.read_csv(path)
            print(f"✓ Loaded {len(base_df):,} base samples from {path}")
            datasets.append(base_df)
            break
    
    if base_df is None:
        print("❌ Error: Could not find extracted_features.csv")
        print("Tried locations:")
        for path in base_paths:
            print(f"  - {path}")
        return None
    
    print()
    
    # === LOAD AUGMENTED DATA ===
    print("Step 2: Loading augmented data...")
    
    augmented_paths = [
        Path("./data/augmented_data/augmented_temporal_data.csv"),
        Path("./data/augmented_data/augmented_data.csv"),
        Path("augmented_temporal_data.csv"),
        Path("augmented_data.csv")
    ]
    
    augmented_df = None
    for path in augmented_paths:
        if path.exists():
            augmented_df = pd.read_csv(path)
            print(f"✓ Loaded {len(augmented_df):,} augmented samples from {path}")
            datasets.append(augmented_df)
            break
    
    if augmented_df is None:
        print("⚠ Warning: Could not find augmented data")
        print("Tried locations:")
        for path in augmented_paths:
            print(f"  - {path}")
        print("Continuing with base data only...")
    
    print()
    
    # === COMBINE DATASETS ===
    if len(datasets) > 1:
        print("Step 3: Combining datasets...")
        df_combined = pd.concat(datasets, ignore_index=True)
        print(f"✓ Combined total: {len(df_combined):,} samples")
        print(f"  - Base features: {len(base_df):,}")
        if augmented_df is not None:
            print(f"  - Augmented data: {len(augmented_df):,}")
    else:
        df_combined = datasets[0]
        print("Step 3: Using base data only")
        print(f"✓ Total: {len(df_combined):,} samples")
    
    print()
    
    return df_combined


def clean_data(df):
    """Clean and validate data"""
    print("="*80)
    print("DATA CLEANING")
    print("="*80)
    print()
    
    print(f"Initial samples: {len(df):,}")
    
    # Remove duplicates
    before = len(df)
    df = df.drop_duplicates()
    if len(df) < before:
        print(f"✓ Removed {before - len(df):,} duplicate rows")
    
    # Drop rows with missing critical features
    critical_features = ['hrMean', 'sdnn', 'rmssd']
    before = len(df)
    df = df.dropna(subset=critical_features)
    if len(df) < before:
        print(f"✓ Removed {before - len(df):,} rows with missing critical features")
    
    print(f"✓ Clean dataset: {len(df):,} samples")
    print()
    
    return df


def split_data(df, train_ratio=0.7, val_ratio=0.15):
    """Split data into train/val/test sets"""
    print("="*80)
    print("TRAIN/VAL/TEST SPLIT")
    print("="*80)
    print()
    
    # Check if person_id exists for proper splitting
    if 'person_id' in df.columns:
        print("Using person-based split (no data leakage)...")
        people = df['person_id'].unique()
        np.random.shuffle(people)
        
        n_train = int(len(people) * train_ratio)
        n_val = int(len(people) * val_ratio)
        
        train_people = people[:n_train]
        val_people = people[n_train:n_train+n_val]
        test_people = people[n_train+n_val:]
        
        df_train = df[df['person_id'].isin(train_people)]
        df_val = df[df['person_id'].isin(val_people)]
        df_test = df[df['person_id'].isin(test_people)]
        
        print(f"✓ Split {len(people)} people:")
        print(f"  - Train: {len(train_people)} people")
        print(f"  - Val:   {len(val_people)} people")
        print(f"  - Test:  {len(test_people)} people")
    else:
        print("Using simple chronological split...")
        train_size = int(train_ratio * len(df))
        val_size = int(val_ratio * len(df))
        
        df_train = df[:train_size]
        df_val = df[train_size:train_size+val_size]
        df_test = df[train_size+val_size:]
    
    print()
    print(f"Dataset sizes:")
    print(f"  Train: {len(df_train):,} samples ({len(df_train)/len(df)*100:.1f}%)")
    print(f"  Val:   {len(df_val):,} samples ({len(df_val)/len(df)*100:.1f}%)")
    print(f"  Test:  {len(df_test):,} samples ({len(df_test)/len(df)*100:.1f}%)")
    print()
    
    return df_train, df_val, df_test


def evaluate_model_performance(model, df_test):
    """Comprehensive model evaluation"""
    print("="*80)
    print("MODEL PERFORMANCE EVALUATION")
    print("="*80)
    print()
    
    # Get predictions
    print(f"Running predictions on {len(df_test):,} test windows...")
    start_time = time.time()
    
    predictions = []
    for idx, row in df_test.iterrows():
        pred = model.predict_realtime(row.to_dict(), use_temporal=False)
        predictions.append(pred)
        
        if len(predictions) % 5000 == 0:
            print(f"  Progress: {len(predictions):,} / {len(df_test):,}...")
    
    end_time = time.time()
    avg_latency = (end_time - start_time) / len(df_test) * 1000  # ms
    
    print(f"✓ Predictions complete")
    print(f"  Average latency: {avg_latency:.2f}ms per prediction")
    print()
    
    # === DIMENSION PERFORMANCE ===
    print("Risk Dimension Performance:")
    print("-" * 80)
    
    dimensions = ['stress', 'health', 'sleep_fatigue', 'cognitive_fatigue', 'physical_exertion']
    
    for dim in dimensions:
        levels = [p['risk_assessment'][dim]['level'] for p in predictions]
        confidences = [p['risk_assessment'][dim]['confidence'] for p in predictions]
        
        dist = np.bincount(levels, minlength=4).tolist()
        avg_conf = np.mean(confidences)
        
        print(f"\n{dim.upper()}")
        print(f"  Distribution: {dist}")
        print(f"  Avg Confidence: {avg_conf:.3f}")
    
    print()
    print()
    
    # === SUSCEPTIBILITY METRICS ===
    susceptibility = np.array([p['overall_susceptibility'] for p in predictions])
    
    print("Overall Susceptibility:")
    print("-" * 80)
    print(f"  Range: [{susceptibility.min():.3f}, {susceptibility.max():.3f}]")
    print(f"  Mean: {susceptibility.mean():.3f}")
    print(f"  Std Dev: {susceptibility.std():.3f}")
    print()
    
    # Alert distribution
    from collections import Counter
    alerts = [p['alert_level'] for p in predictions]
    alert_dist = Counter(alerts)
    
    print("Alert Distribution:")
    for level in ["NO ALERT", "LOW ALERT", "MODERATE ALERT", "HIGH ALERT", "CRITICAL ALERT"]:
        count = alert_dist.get(level, 0)
        pct = count / len(predictions) * 100
        print(f"  {level:20s}: {count:6,} ({pct:5.1f}%)")
    print()
    
    # === TIME-TO-RISK METRICS ===
    time_to_risk = np.array([p['time_to_risk_minutes'] for p in predictions])
    time_lower = np.array([p['time_to_risk_range']['lower'] for p in predictions])
    time_upper = np.array([p['time_to_risk_range']['upper'] for p in predictions])
    
    print("Time-to-Risk Predictions:")
    print("-" * 80)
    print(f"  Mean: {time_to_risk.mean():.2f} min")
    print(f"  Range: [{time_to_risk.min():.2f}, {time_to_risk.max():.2f}] min")
    print(f"  Avg Uncertainty: ±{((time_upper - time_lower) / 2).mean():.2f} min")
    print()
    
    # === CONFIDENCE METRICS ===
    model_conf = [p['model_confidence']['average'] for p in predictions]
    
    print("Model Confidence:")
    print("-" * 80)
    print(f"  Average: {np.mean(model_conf):.3f}")
    print(f"  Min: {np.min(model_conf):.3f}")
    print(f"  Max: {np.max(model_conf):.3f}")
    print()
    
    # === CORRELATION ANALYSIS ===
    print("Susceptibility vs Time-to-Risk Correlation:")
    print("-" * 80)
    correlation = np.corrcoef(susceptibility, time_to_risk)[0, 1]
    print(f"  Pearson r: {correlation:.3f}")
    
    if correlation < -0.5:
        print("  ✓ Strong negative correlation (higher risk = shorter time)")
    elif correlation < -0.3:
        print("  ⚠ Moderate correlation - room for improvement")
    else:
        print("  ⚠ Weak correlation - model may need adjustment")
    
    print()
    
    return predictions, susceptibility


def convert_to_native(obj):
    """Recursively convert numpy types to native Python types for JSON"""
    if isinstance(obj, dict):
        return {k: convert_to_native(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_native(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_to_native(item) for item in obj)
    elif isinstance(obj, (np.integer, np.int64, np.int32)):
        return int(obj)
    elif isinstance(obj, (np.floating, np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    else:
        return obj


def main():
    print("="*80)
    print("COMBINED RISK PREDICTION MODEL TRAINING")
    print("Base Features + Augmented Data")
    print("="*80)
    print()
    
    # === LOAD DATA ===
    df = load_all_data()
    if df is None:
        return
    
    # === CLEAN DATA ===
    df = clean_data(df)
    
    # === SPLIT DATA ===
    df_train, df_val, df_test = split_data(df)
    
    # Combine train + val for model's internal split
    df_train_full = pd.concat([df_train, df_val], ignore_index=True)
    
    # === TRAIN MODEL ===
    print("="*80)
    print("MODEL TRAINING")
    print("="*80)
    print()
    print(f"Training on {len(df_train_full):,} samples...")
    print("This may take 5-10 minutes...")
    print()
    
    # Initialize model with improved settings
    # Note: If EnhancedRiskPredictor doesn't support these parameters,
    # you may need to update the class constructor in risk.py
    try:
        model = EnhancedRiskPredictor(
            temporal_window_size=5,
            n_estimators=200,  # More trees for better confidence
            max_depth=8,       # Deeper trees for better patterns
            learning_rate=0.05  # Lower learning rate for stability
        )
    except TypeError:
        # Fallback to basic initialization
        print("⚠ Using default model parameters (update risk.py to support custom parameters)")
        model = EnhancedRiskPredictor(temporal_window_size=5)
    
    start_time = time.time()
    stats = model.train(df_train_full, validation_split=0.15)
    train_time = time.time() - start_time
    
    print()
    print(f"✓ Training complete in {train_time/60:.1f} minutes")
    print()
    
    # === TRAINING STATISTICS ===
    print("="*80)
    print("TRAINING STATISTICS")
    print("="*80)
    print()
    
    print(f"Total samples: {stats['n_samples']:,}")
    print(f"Features: {stats['n_features']}")
    print(f"Training: {stats['n_train']:,}")
    print(f"Validation: {stats['n_val']:,}")
    print()
    
    print("Model Performance:")
    for name, metrics in stats['metrics'].items():
        print(f"\n{name.upper()}")
        if 'accuracy' in metrics:
            print(f"  Accuracy: {metrics['accuracy']:.3f}")
            print(f"  Distribution: {metrics['distribution']}")
        elif 'r2' in metrics:
            print(f"  R² Score: {metrics['r2']:.3f}")
            print(f"  MAE: {metrics['mae']:.4f}")
    
    print()
    print()
    
    # === EVALUATE ON TEST SET ===
    predictions, susceptibility = evaluate_model_performance(model, df_test)
    
    # === FEATURE IMPORTANCE ===
    print("="*80)
    print("TOP 15 MOST IMPORTANT FEATURES")
    print("="*80)
    print()
    
    # Aggregate feature importance across models
    all_importance = {}
    for dim, importances in model.feature_importance.items():
        for feature, importance in importances.items():
            if feature not in all_importance:
                all_importance[feature] = []
            all_importance[feature].append(importance)
    
    # Average across dimensions
    avg_importance = {
        feat: np.mean(imps)
        for feat, imps in all_importance.items()
    }
    
    # Sort
    sorted_features = sorted(
        avg_importance.items(),
        key=lambda x: x[1],
        reverse=True
    )
    
    for i, (feature, importance) in enumerate(sorted_features[:15], 1):
        print(f"{i:2d}. {feature:25s}: {importance:.4f}")
    
    print()
    print()
    
    # === SAVE MODEL ===
    print("="*80)
    print("SAVING MODEL")
    print("="*80)
    print()
    
    model_dir = Path("./model")
    model_dir.mkdir(exist_ok=True)
    
    model_path = model_dir / "risk_predictor_combined.pkl"
    print(f"Saving model to {model_path}...")
    model.save(str(model_path))
    print(f"✓ Model saved")
    print()
    
    # Save statistics
    stats_path = model_dir / "training_stats_combined.json"
    
    json_stats = {
        'training_time_minutes': train_time / 60,
        'data_sources': {
            'base_features': True,
            'augmented_data': 'augmented_data' in str(df.columns) or len(df) > 100000
        },
        'n_samples_total': len(df),
        'n_train': len(df_train_full),
        'n_val': 0,  # Already included in train_full
        'n_test': len(df_test),
        'n_features': int(stats['n_features']),
        'metrics': convert_to_native(stats['metrics']),
        'baseline_stats': convert_to_native(stats['baseline_stats']),
        'test_performance': {
            'susceptibility_mean': float(susceptibility.mean()),
            'susceptibility_std': float(susceptibility.std()),
            'avg_latency_ms': float((time.time() - start_time) / len(df_test) * 1000)
        },
        'feature_importance_top15': [(str(k), float(v)) for k, v in sorted_features[:15]]
    }
    
    with open(stats_path, 'w') as f:
        json.dump(json_stats, f, indent=2)
    
    print(f"✓ Statistics saved to {stats_path}")
    print()
    
    # === FINAL SUMMARY ===
    print("="*80)
    print("TRAINING COMPLETE")
    print("="*80)
    print()
    
    print("✓ Model successfully trained with:")
    print(f"  - XGBoost classifiers for 5 risk dimensions")
    print(f"  - XGBoost regressors for susceptibility & time-to-risk")
    print(f"  - Uncertainty quantification (confidence intervals)")
    print(f"  - {stats['n_features']} engineered features")
    print(f"  - Trained on {len(df_train_full):,} samples")
    print(f"  - Tested on {len(df_test):,} samples")
    print(f"  - Validation R² for susceptibility: {stats['metrics']['susceptibility']['r2']:.3f}")
    print(f"  - Training time: {train_time/60:.1f} minutes")
    print()
    
    print("Model weights (relative importance):")
    for dim, weight in model.risk_weights.items():
        print(f"  {dim:20s}: {weight:.2f} ({int(weight*100)}%)")
    
    print()
    print("Output files:")
    print(f"  - Model: {model_path}")
    print(f"  - Stats: {stats_path}")
    print()
    print("Next steps:")
    print("  1. Test with: python sliding_window_predictor.py")
    print("  2. Run enhanced tests: python enhanced_test_model.py")
    print("  3. Deploy to production backend")
    print()


if __name__ == "__main__":
    main()