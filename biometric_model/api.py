"""
Risk Prediction API

FastAPI server that accepts biometric data and returns risk predictions.

Installation:
    pip install fastapi uvicorn pydantic

Run:
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload

Test:
    curl -X POST "http://localhost:8000/predict" -H "Content-Type: application/json" -d @test_data.json
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import pandas as pd
import numpy as np
from pathlib import Path
import uvicorn

# Import your model
from risk import EnhancedRiskPredictor

# Initialize FastAPI app
app = FastAPI(
    title="Risk Prediction API",
    description="API for predicting decision-making risk from biometric data",
    version="1.0.0"
)

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variable
model = None


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class BiometricData(BaseModel):
    """Single row of biometric data"""
    hrMean: Optional[float] = Field(None, description="Mean heart rate (BPM)")
    hrStd: Optional[float] = Field(None, description="Heart rate standard deviation")
    hrMin: Optional[float] = Field(None, description="Minimum heart rate")
    hrMax: Optional[float] = Field(None, description="Maximum heart rate")
    sdnn: Optional[float] = Field(None, description="SDNN HRV metric (ms)")
    rmssd: Optional[float] = Field(None, description="RMSSD HRV metric (ms)")
    pnn50: Optional[float] = Field(None, description="pNN50 HRV metric (%)")
    pnn20: Optional[float] = Field(None, description="pNN20 HRV metric (%)")
    movementIntensity: Optional[float] = Field(None, description="Movement intensity")
    qualityScore: Optional[float] = Field(None, description="Signal quality (0-1)")
    
    # Optional additional fields
    meanRR: Optional[float] = None
    sdsd: Optional[float] = None
    cvnn: Optional[float] = None
    cvsd: Optional[float] = None
    medianRR: Optional[float] = None
    rangeRR: Optional[float] = None
    iqrRR: Optional[float] = None
    sd1: Optional[float] = None
    sd2: Optional[float] = None
    sd1sd2: Optional[float] = None
    poincareArea: Optional[float] = None
    accelEnergy: Optional[float] = None
    accelMagnitudeMax: Optional[float] = None
    accelMagnitudeMean: Optional[float] = None
    accelMagnitudeStd: Optional[float] = None
    peakCount: Optional[float] = None
    validRRCount: Optional[float] = None
    timestamp: Optional[int] = None

    class Config:
        json_schema_extra = {
            "example": {
                "hrMean": 75.5,
                "hrStd": 8.2,
                "sdnn": 45.3,
                "rmssd": 38.7,
                "pnn50": 15.2,
                "movementIntensity": 0.0023,
                "qualityScore": 0.95
            }
        }


class PredictionRequest(BaseModel):
    """Request containing multiple rows of biometric data"""
    data: List[BiometricData] = Field(..., description="List of biometric data rows (window)")
    window_size: Optional[int] = Field(5, description="Number of rows to use for prediction")
    
    class Config:
        json_schema_extra = {
            "example": {
                "data": [
                    {"hrMean": 72, "sdnn": 50, "rmssd": 45, "movementIntensity": 0.002, "qualityScore": 0.95},
                    {"hrMean": 74, "sdnn": 48, "rmssd": 42, "movementIntensity": 0.003, "qualityScore": 0.93},
                    {"hrMean": 76, "sdnn": 46, "rmssd": 40, "movementIntensity": 0.004, "qualityScore": 0.91},
                    {"hrMean": 78, "sdnn": 44, "rmssd": 38, "movementIntensity": 0.005, "qualityScore": 0.89},
                    {"hrMean": 82, "sdnn": 40, "rmssd": 35, "movementIntensity": 0.006, "qualityScore": 0.87}
                ],
                "window_size": 5
            }
        }


class RiskFactor(BaseModel):
    """Individual risk factor assessment"""
    level: int = Field(..., description="Risk level (1-5)")
    confidence: float = Field(..., description="Model confidence (0-1)")


class RiskFactors(BaseModel):
    """All risk factors"""
    stress: RiskFactor
    health: RiskFactor
    sleep_fatigue: RiskFactor
    cognitive_fatigue: RiskFactor
    physical_exertion: RiskFactor


class OverallRisk(BaseModel):
    """Overall risk assessment"""
    susceptibility: float = Field(..., description="Overall susceptibility score (0-1)")
    alert_level: str = Field(..., description="Alert level text")


class TimeToBadDecision(BaseModel):
    """Time-to-risk prediction"""
    estimated_time: float = Field(..., description="Estimated time to impairment (minutes)")
    range_lower: float = Field(..., description="Lower bound of time estimate")
    range_upper: float = Field(..., description="Upper bound of time estimate")


class PredictionResponse(BaseModel):
    """Complete prediction response"""
    risk_factors: RiskFactors
    overall_risk: OverallRisk
    time_to_bad_decision: TimeToBadDecision
    timestamp: Optional[int] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    model_path: Optional[str] = None


# ============================================================================
# STARTUP/SHUTDOWN
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    global model
    
    print("=" * 80)
    print("RISK PREDICTION API - STARTING UP")
    print("=" * 80)
    print()
    
    # Try to load the latest model
    model_dir = Path("./model")
    model_options = [
        "risk_predictor_combined.pkl",
        "risk_predictor_augmented.pkl",
        "risk_predictor.pkl"
    ]
    
    for model_file in model_options:
        model_path = model_dir / model_file
        if model_path.exists():
            print(f"Loading model: {model_path}")
            try:
                model = EnhancedRiskPredictor.load(str(model_path))
                print(f"✓ Model loaded successfully")
                print()
                return
            except Exception as e:
                print(f"❌ Error loading model: {e}")
                print()
    
    print("⚠ WARNING: No model found. API will return errors until model is loaded.")
    print("   Please train a model first:")
    print("     python train_combined.py")
    print()


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("Shutting down Risk Prediction API...")


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/", response_model=HealthResponse)
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "model_loaded": model is not None,
        "model_path": "loaded" if model else None
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Detailed health check"""
    return {
        "status": "healthy" if model is not None else "unhealthy",
        "model_loaded": model is not None,
        "model_path": "model loaded" if model else "no model"
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict(request: PredictionRequest):
    """
    Make a risk prediction from biometric data
    
    Args:
        request: PredictionRequest containing biometric data rows
    
    Returns:
        PredictionResponse with risk assessment
    """
    global model
    
    # Check if model is loaded
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Please ensure the model file exists in ./model/"
        )
    
    # Validate input
    if len(request.data) == 0:
        raise HTTPException(
            status_code=400,
            detail="No data provided. Please include at least 1 row of biometric data."
        )
    
    # Use the specified window size or default to 5
    window_size = request.window_size if request.window_size else 5
    
    if len(request.data) > window_size:
        # Use the last N rows
        data_to_use = request.data[-window_size:]
    else:
        # Use all provided data
        data_to_use = request.data
    
    try:
        # Convert to list of dicts
        data_dicts = [row.model_dump(exclude_none=True) for row in data_to_use]
        
        # Average the rows to get a single prediction
        # (Alternative: could predict on each row and average, or just use the last row)
        df = pd.DataFrame(data_dicts)
        
        # Use the mean of all rows as the input
        # This gives a smoothed representation of the window
        averaged_data = df.mean().to_dict()
        
        # Make prediction
        prediction = model.predict_realtime(averaged_data, use_temporal=False)
        
        # Convert to 1-5 scale for risk factors
        def get_risk_level(level: int, confidence: float) -> int:
            """Convert 0-3 level to 1-5 scale"""
            level_map = {0: 1, 1: 2, 2: 3, 3: 4}
            numeric_level = level_map.get(level, 1)
            # Boost to 5 if high risk with high confidence
            if level == 3 and confidence > 0.7:
                numeric_level = 5
            return numeric_level
        
        # Build response
        response = PredictionResponse(
            risk_factors=RiskFactors(
                stress=RiskFactor(
                    level=get_risk_level(
                        prediction['risk_assessment']['stress']['level'],
                        prediction['risk_assessment']['stress']['confidence']
                    ),
                    confidence=round(prediction['risk_assessment']['stress']['confidence'], 3)
                ),
                health=RiskFactor(
                    level=get_risk_level(
                        prediction['risk_assessment']['health']['level'],
                        prediction['risk_assessment']['health']['confidence']
                    ),
                    confidence=round(prediction['risk_assessment']['health']['confidence'], 3)
                ),
                sleep_fatigue=RiskFactor(
                    level=get_risk_level(
                        prediction['risk_assessment']['sleep_fatigue']['level'],
                        prediction['risk_assessment']['sleep_fatigue']['confidence']
                    ),
                    confidence=round(prediction['risk_assessment']['sleep_fatigue']['confidence'], 3)
                ),
                cognitive_fatigue=RiskFactor(
                    level=get_risk_level(
                        prediction['risk_assessment']['cognitive_fatigue']['level'],
                        prediction['risk_assessment']['cognitive_fatigue']['confidence']
                    ),
                    confidence=round(prediction['risk_assessment']['cognitive_fatigue']['confidence'], 3)
                ),
                physical_exertion=RiskFactor(
                    level=get_risk_level(
                        prediction['risk_assessment']['physical_exertion']['level'],
                        prediction['risk_assessment']['physical_exertion']['confidence']
                    ),
                    confidence=round(prediction['risk_assessment']['physical_exertion']['confidence'], 3)
                )
            ),
            overall_risk=OverallRisk(
                susceptibility=round(prediction['overall_susceptibility'], 3),
                alert_level=prediction['alert_level']
            ),
            time_to_bad_decision=TimeToBadDecision(
                estimated_time=round(prediction['time_to_risk_minutes'], 1),
                range_lower=round(prediction['time_to_risk_range']['lower'], 1),
                range_upper=round(prediction['time_to_risk_range']['upper'], 1)
            ),
            timestamp=data_dicts[-1].get('timestamp')
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )


@app.post("/predict-batch")
async def predict_batch(requests: List[PredictionRequest]):
    """
    Make multiple predictions in batch
    
    Args:
        requests: List of PredictionRequest objects
    
    Returns:
        List of PredictionResponse objects
    """
    results = []
    for req in requests:
        try:
            result = await predict(req)
            results.append(result)
        except HTTPException as e:
            results.append({"error": e.detail})
    
    return results


# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    print("=" * 80)
    print("RISK PREDICTION API")
    print("=" * 80)
    print()
    print("Starting server on http://0.0.0.0:8000")
    print()
    print("Documentation available at:")
    print("  - Swagger UI: http://localhost:8000/docs")
    print("  - ReDoc: http://localhost:8000/redoc")
    print()
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )