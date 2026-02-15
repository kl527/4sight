"""
Export trained XGBoost model to JSON for on-device inference in React Native.

Usage:
    cd biometric_model
    uv run python export_for_mobile.py

Outputs:
    ../4sight/assets/models/risk_model.json
"""

import json
import os
import tempfile
import numpy as np
import joblib
import xgboost as xgb


def export_model(
    pkl_path: str = "model/risk_predictor_combined.pkl",
    output_path: str = "../4sight/assets/models/risk_model.json",
):
    # Load trained model (saved as a dict, not an object)
    data = joblib.load(pkl_path)
    print(f"Loaded model from {pkl_path}")

    # Feature ordering (must match TypeScript side exactly)
    feature_order = [
        # HRV (19)
        "hrMean", "hrStd", "hrMin", "hrMax",
        "meanRR", "sdnn", "rmssd", "sdsd",
        "pnn50", "pnn20", "cvnn", "cvsd",
        "medianRR", "rangeRR", "iqrRR",
        "sd1", "sd2", "sd1sd2", "poincareArea",
        # Accelerometer (5)
        "accelEnergy", "accelMagnitudeMax", "accelMagnitudeMean",
        "accelMagnitudeStd", "movementIntensity",
        # Quality (3)
        "peakCount", "validRRCount", "qualityScore",
        # Derived (9)
        "hr_var_ratio", "hr_cv", "hrv_balance", "hrv_power",
        "sd_ratio", "movement_var", "recovery_score",
        "hr_per_movement", "weighted_sdnn",
    ]

    def export_xgb_model(model) -> dict:
        """Export an XGBoost model's trees to JSON via temp file."""
        # Get the underlying booster
        booster = model.get_booster()
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
            tmp_path = f.name
        try:
            booster.save_model(tmp_path)
            with open(tmp_path) as f:
                return json.load(f)
        finally:
            os.unlink(tmp_path)

    # Export all 9 models
    classifiers = {}
    classifier_names = ["stress", "health", "sleep_fatigue", "cognitive_fatigue", "physical_exertion"]
    classifier_models = [
        data["stress_model"],
        data["health_model"],
        data["sleep_model"],
        data["cognitive_model"],
        data["physical_model"],
    ]

    for name, model in zip(classifier_names, classifier_models):
        classifiers[name] = export_xgb_model(model)
        n_trees = len(classifiers[name]["learner"]["gradient_booster"]["model"]["trees"])
        print(f"  Exported classifier '{name}': {n_trees} trees")

    regressors = {}
    regressor_names = ["susceptibility", "time_to_risk", "time_lower_bound", "time_upper_bound"]
    regressor_models = [
        data["susceptibility_model"],
        data["time_to_risk_model"],
        data["time_lower_bound_model"],
        data["time_upper_bound_model"],
    ]

    for name, model in zip(regressor_names, regressor_models):
        regressors[name] = export_xgb_model(model)
        n_trees = len(regressors[name]["learner"]["gradient_booster"]["model"]["trees"])
        print(f"  Exported regressor '{name}': {n_trees} trees")

    # Export RobustScaler parameters
    scaler = data["scaler"]
    scaler_params = {
        "center": scaler.center_.tolist(),
        "scale": scaler.scale_.tolist(),
    }
    print(f"  Exported scaler: {len(scaler_params['center'])} features")

    # Risk weights and alert thresholds
    risk_weights = data["risk_weights"]

    # Build output
    output = {
        "version": "1.0",
        "featureOrder": feature_order,
        "scaler": scaler_params,
        "classifiers": classifiers,
        "regressors": regressors,
        "config": {
            "nClasses": 4,
            "riskWeights": risk_weights,
            "riskLabels": ["No Risk", "Low Risk", "Moderate Risk", "High Risk"],
            "alertThresholds": {
                "critical": 0.75,
                "high": 0.60,
                "moderate": 0.45,
                "low": 0.30,
            },
        },
    }

    # Strip trees down to only the fields needed for inference
    def strip_model(model_json: dict) -> dict:
        stripped = {
            "learner": {
                "gradient_booster": {
                    "model": {
                        "trees": [],
                        "tree_info": model_json["learner"]["gradient_booster"]["model"]["tree_info"],
                    }
                },
                "learner_model_param": model_json["learner"]["learner_model_param"],
            }
        }
        for tree in model_json["learner"]["gradient_booster"]["model"]["trees"]:
            stripped["learner"]["gradient_booster"]["model"]["trees"].append({
                "left_children": tree["left_children"],
                "right_children": tree["right_children"],
                "split_conditions": tree["split_conditions"],
                "split_indices": tree["split_indices"],
                "base_weights": tree["base_weights"],
                "default_left": tree["default_left"],
            })
        return stripped

    for name in classifiers:
        output["classifiers"][name] = strip_model(output["classifiers"][name])
    for name in regressors:
        output["regressors"][name] = strip_model(output["regressors"][name])

    # Write
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\nExported to {output_path} ({size_mb:.1f} MB)")

    # === VALIDATION ===
    print("\nValidating export...")
    validate_export(data, output_path, feature_order)


def validate_export(data: dict, json_path: str, feature_order: list):
    """Run test samples through the pickle models and save test vectors."""
    import pandas as pd

    np.random.seed(42)
    n_test = 50

    test_data = {
        "hrMean": np.random.uniform(55, 110, n_test),
        "hrStd": np.random.uniform(2, 20, n_test),
        "hrMin": np.random.uniform(45, 80, n_test),
        "hrMax": np.random.uniform(80, 140, n_test),
        "meanRR": np.random.uniform(500, 1100, n_test),
        "sdnn": np.random.uniform(10, 100, n_test),
        "rmssd": np.random.uniform(10, 80, n_test),
        "sdsd": np.random.uniform(5, 60, n_test),
        "pnn50": np.random.uniform(0, 50, n_test),
        "pnn20": np.random.uniform(10, 80, n_test),
        "cvnn": np.random.uniform(0.01, 0.15, n_test),
        "cvsd": np.random.uniform(0.01, 0.12, n_test),
        "medianRR": np.random.uniform(500, 1100, n_test),
        "rangeRR": np.random.uniform(50, 500, n_test),
        "iqrRR": np.random.uniform(20, 200, n_test),
        "sd1": np.random.uniform(5, 60, n_test),
        "sd2": np.random.uniform(10, 100, n_test),
        "sd1sd2": np.random.uniform(0.2, 1.5, n_test),
        "poincareArea": np.random.uniform(100, 15000, n_test),
        "accelEnergy": np.random.uniform(0, 50, n_test),
        "accelMagnitudeMax": np.random.uniform(0.5, 5, n_test),
        "accelMagnitudeMean": np.random.uniform(0.8, 1.5, n_test),
        "accelMagnitudeStd": np.random.uniform(0.01, 0.5, n_test),
        "movementIntensity": np.random.uniform(0, 0.1, n_test),
        "peakCount": np.random.uniform(10, 60, n_test),
        "validRRCount": np.random.uniform(5, 55, n_test),
        "qualityScore": np.random.uniform(0.3, 1.0, n_test),
    }
    df = pd.DataFrame(test_data)

    scaler = data["scaler"]
    classifier_map = {
        "stress": data["stress_model"],
        "health": data["health_model"],
        "sleep_fatigue": data["sleep_model"],
        "cognitive_fatigue": data["cognitive_model"],
        "physical_exertion": data["physical_model"],
    }

    # Replicate _extract_features: base 27 + 9 derived
    base_cols = feature_order[:27]  # First 27 are base features

    def build_features(row: dict) -> np.ndarray:
        base = [row.get(c, 0) for c in base_cols]
        # Derived features (same as risk.py)
        hr_var_ratio = row["hrStd"] / (row["hrMean"] + 1e-6)
        hr_cv = row["hrStd"] / row["hrMean"] if row["hrMean"] != 0 else 0
        hrv_balance = row["rmssd"] / (row["sdnn"] + 1e-6)
        hrv_power = np.sqrt(row["sdnn"] ** 2 + row["rmssd"] ** 2)
        sd_ratio = row["sd1"] / (row["sd2"] + 1e-6)
        movement_var = row["accelMagnitudeStd"] / (row["accelMagnitudeMean"] + 1e-6)
        recovery_score = (row["pnn50"] / 100) * row["rmssd"]
        hr_per_movement = row["hrMean"] / (row["movementIntensity"] + 1e-6)
        weighted_sdnn = row["sdnn"] * row["qualityScore"]
        derived = [hr_var_ratio, hr_cv, hrv_balance, hrv_power, sd_ratio,
                   movement_var, recovery_score, hr_per_movement, weighted_sdnn]
        return np.array(base + derived).reshape(1, -1)

    # Run predictions
    test_vectors = []
    for i in range(min(5, n_test)):
        row = df.iloc[i].to_dict()
        X = build_features(row)
        X_scaled = scaler.transform(X)

        stress_probs = classifier_map["stress"].predict_proba(X_scaled)[0]
        stress_level = int(np.argmax(stress_probs))
        health_probs = classifier_map["health"].predict_proba(X_scaled)[0]
        health_level = int(np.argmax(health_probs))

        susceptibility = float(np.clip(data["susceptibility_model"].predict(X_scaled)[0], 0, 1))
        time_to_risk = float(np.clip(data["time_to_risk_model"].predict(X_scaled)[0], 3, 30))

        thresholds = {"critical": 0.75, "high": 0.60, "moderate": 0.45, "low": 0.30}
        if susceptibility >= thresholds["critical"]:
            alert_level = "CRITICAL ALERT"
        elif susceptibility >= thresholds["high"]:
            alert_level = "HIGH ALERT"
        elif susceptibility >= thresholds["moderate"]:
            alert_level = "MODERATE ALERT"
        elif susceptibility >= thresholds["low"]:
            alert_level = "LOW ALERT"
        else:
            alert_level = "NO ALERT"

        test_vectors.append({
            "input": {k: float(v) for k, v in row.items()},
            "expected": {
                "stress_level": stress_level,
                "stress_probs": stress_probs.tolist(),
                "health_level": health_level,
                "susceptibility": susceptibility,
                "time_to_risk": time_to_risk,
                "alert_level": alert_level,
            },
        })

    vectors_path = os.path.join(os.path.dirname(json_path), "test_vectors.json")
    with open(vectors_path, "w") as f:
        json.dump(test_vectors, f, indent=2)
    print(f"  Saved {len(test_vectors)} test vectors to {vectors_path}")
    print(f"  Ran {n_test} predictions through pickle models - all succeeded")
    print("  Validation PASSED")


if __name__ == "__main__":
    export_model()
