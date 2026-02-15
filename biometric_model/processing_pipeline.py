#!/usr/bin/env python3
"""
Fixed Biometric Data Processing and Feature Extraction Pipeline v2

Improved peak detection and PPG processing for proper HRV feature extraction.

Usage:
    python biometric_pipeline_v2.py
"""

import os
import pickle
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import logging
from scipy import signal
from scipy.interpolate import interp1d

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =============================================================================
# SIGNAL PROCESSING UTILITIES
# =============================================================================

class SignalProcessor:
    """Signal processing utilities for PPG preprocessing"""
    
    @staticmethod
    def butterworth_filter(data: np.ndarray, cutoff, fs: float, 
                          filter_type: str = 'high', order: int = 2) -> np.ndarray:
        """Apply Butterworth filter"""
        # Ensure input is 1D
        data = np.asarray(data).flatten()
        
        if len(data) < 24:  # filtfilt needs at least 3x padlen (padlen default is 3*order)
            logger.warning(f"Signal too short for filtering: {len(data)} samples")
            return data
        
        nyquist = fs / 2.0
        
        if filter_type in ['high', 'low']:
            normalized_cutoff = cutoff / nyquist
            if normalized_cutoff >= 1.0:
                normalized_cutoff = 0.99
            if normalized_cutoff <= 0.0:
                normalized_cutoff = 0.01
        else:  # band
            normalized_cutoff = [c / nyquist for c in cutoff]
            normalized_cutoff = [max(0.01, min(0.99, c)) for c in normalized_cutoff]
        
        try:
            b, a = signal.butter(order, normalized_cutoff, btype=filter_type)
            filtered = signal.filtfilt(b, a, data)
            return np.asarray(filtered).flatten()
        except Exception as e:
            logger.warning(f"Filter failed: {e}")
            return data
    
    @staticmethod
    def median_filter(data: np.ndarray, window_size: int = 3) -> np.ndarray:
        """Apply median filter"""
        data = np.asarray(data).flatten()
        if len(data) < window_size:
            return data
        try:
            filtered = signal.medfilt(data, kernel_size=window_size)
            return np.asarray(filtered).flatten()
        except Exception as e:
            logger.warning(f"Median filter failed: {e}")
            return data


# =============================================================================
# FEATURE EXTRACTION
# =============================================================================

class FeatureExtractor:
    """Extract biosignal features from PPG and accelerometer data"""
    
    def __init__(self):
        self.processor = SignalProcessor()
    
    def extract_features(self, ppg: np.ndarray, acc_x: np.ndarray, acc_y: np.ndarray, 
                        acc_z: np.ndarray, timestamp_ms: float,
                        ppg_hz: float = 64.0, acc_hz: float = 32.0) -> Dict:
        """
        Extract all features from biosignal data
        
        Returns dict matching target format
        """
        features = {
            'timestamp': int(timestamp_ms),
            'durationMs': 27000,  # 27 seconds in ms
        }
        
        # Preprocess PPG and extract HRV
        if len(ppg) > 100 and not np.all(ppg == 0):
            ppg_clean = self._preprocess_ppg(ppg, ppg_hz)
            hrv_features = self._extract_hrv_features(ppg_clean, ppg_hz)
            features.update(hrv_features)
        else:
            features.update(self._empty_hrv_features())
        
        # Extract accelerometer features
        if len(acc_x) > 0:
            accel_features = self._extract_accel_features(acc_x, acc_y, acc_z)
            features.update(accel_features)
        else:
            features.update(self._empty_accel_features())
        
        return features
    
    def _preprocess_ppg(self, ppg: np.ndarray, fs: float) -> np.ndarray:
        """
        Simplified but effective PPG preprocessing:
        1. Remove DC offset
        2. Bandpass filter (0.5-8 Hz to capture HR range 30-240 BPM)
        3. Light smoothing
        """
        ppg_clean = ppg.copy().astype(float).flatten()  # Ensure 1D
        
        # Remove DC offset
        ppg_clean = ppg_clean - np.mean(ppg_clean)
        
        # Bandpass filter: 0.5-8 Hz covers HR range of 30-240 BPM
        try:
            filtered = self.processor.butterworth_filter(
                ppg_clean, cutoff=[0.5, 8.0], fs=fs, filter_type='band', order=3
            )
            # Ensure we got back a valid 1D array
            if filtered is not None and len(filtered) == len(ppg_clean):
                ppg_clean = filtered.flatten()
        except Exception as e:
            logger.warning(f"Bandpass filter failed: {e}, using unfiltered signal")
        
        # Light median filter to remove spikes (only if signal is long enough)
        if len(ppg_clean) >= 3:
            try:
                ppg_clean = self.processor.median_filter(ppg_clean, window_size=3)
                ppg_clean = ppg_clean.flatten()  # Ensure 1D after median filter
            except Exception as e:
                logger.warning(f"Median filter failed: {e}")
        
        return ppg_clean.flatten()
    
    def _find_peaks(self, ppg: np.ndarray, fs: float) -> np.ndarray:
        """
        Robust peak detection using scipy's find_peaks with adaptive thresholds
        """
        # Ensure 1D array
        ppg = ppg.flatten()
        
        if len(ppg) < 100:
            logger.warning(f"PPG signal too short: {len(ppg)} samples")
            return np.array([])
        
        # Normalize signal
        ppg_std = np.std(ppg)
        if ppg_std < 1e-6:
            logger.warning("PPG signal has near-zero variance")
            return np.array([])
        
        ppg_norm = (ppg - np.mean(ppg)) / ppg_std
        
        # Calculate adaptive parameters
        # Minimum distance: 0.4s (max HR ~150 BPM)
        min_distance = int(0.4 * fs)
        
        # Height threshold: use a percentile-based approach
        height_threshold = np.percentile(ppg_norm, 60)  # 60th percentile
        
        # Prominence: peaks should stand out from surrounding signal
        prominence = 0.3 * np.std(ppg_norm)
        
        try:
            # Find peaks
            peaks, properties = signal.find_peaks(
                ppg_norm,
                height=height_threshold,
                distance=min_distance,
                prominence=prominence
            )
        except Exception as e:
            logger.warning(f"Peak detection failed: {e}")
            return np.array([])
        
        # Additional filtering: remove peaks that are too close (< 0.3s)
        if len(peaks) > 1:
            filtered_peaks = [peaks[0]]
            for i in range(1, len(peaks)):
                if (peaks[i] - filtered_peaks[-1]) >= int(0.3 * fs):
                    filtered_peaks.append(peaks[i])
            peaks = np.array(filtered_peaks)
        
        return peaks
    
    def _extract_hrv_features(self, ppg: np.ndarray, fs: float) -> Dict:
        """Extract HRV features from preprocessed PPG"""
        # Find peaks
        peaks = self._find_peaks(ppg, fs)
        
        if len(peaks) < 3:
            logger.debug(f"Insufficient peaks found: {len(peaks)}")
            return self._empty_hrv_features()
        
        # Calculate RR intervals (in ms)
        rr_intervals = np.diff(peaks) / fs * 1000
        
        # Filter physiologically plausible RR intervals
        # For 27s window, expect 20-60 beats (HR: 44-133 BPM)
        # RR intervals: 450-1350 ms
        valid_mask = (rr_intervals >= 400) & (rr_intervals <= 1500)
        valid_rr = rr_intervals[valid_mask]
        
        if len(valid_rr) < 2:
            logger.debug(f"Insufficient valid RR intervals: {len(valid_rr)} out of {len(rr_intervals)}")
            return self._empty_hrv_features()
        
        # Time domain features
        hr = 60000 / valid_rr  # Heart rate in BPM
        
        features = {
            # Heart rate statistics
            'hrMean': float(np.mean(hr)),
            'hrStd': float(np.std(hr)),
            'hrMin': float(np.min(hr)),
            'hrMax': float(np.max(hr)),
            
            # RR interval statistics
            'meanRR': float(np.mean(valid_rr)),
            'medianRR': float(np.median(valid_rr)),
            'rangeRR': float(np.max(valid_rr) - np.min(valid_rr)),
            'iqrRR': float(np.percentile(valid_rr, 75) - np.percentile(valid_rr, 25)),
            'sdnn': float(np.std(valid_rr)),
        }
        
        # Successive differences
        if len(valid_rr) > 1:
            diffs = np.diff(valid_rr)
            features['sdsd'] = float(np.std(diffs))
            features['rmssd'] = float(np.sqrt(np.mean(diffs**2)))
            
            # pNNxx
            nn50 = np.sum(np.abs(diffs) > 50)
            nn20 = np.sum(np.abs(diffs) > 20)
            features['pnn50'] = float(nn50 / len(diffs) * 100) if len(diffs) > 0 else 0.0
            features['pnn20'] = float(nn20 / len(diffs) * 100) if len(diffs) > 0 else 0.0
        else:
            features['sdsd'] = 0.0
            features['rmssd'] = 0.0
            features['pnn50'] = 0.0
            features['pnn20'] = 0.0
        
        # Coefficients of variation
        features['cvnn'] = features['sdnn'] / features['meanRR'] if features['meanRR'] > 0 else 0.0
        features['cvsd'] = features['rmssd'] / features['meanRR'] if features['meanRR'] > 0 else 0.0
        
        # Poincaré features
        sd1 = (1.0 / np.sqrt(2.0)) * features['sdsd']
        sd2_term = 2.0 * features['sdnn']**2 - 0.5 * features['sdsd']**2
        sd2 = np.sqrt(max(0, sd2_term))
        
        features['sd1'] = float(sd1)
        features['sd2'] = float(sd2)
        features['sd1sd2'] = float(sd1 / sd2) if sd2 > 0 else 0.0
        features['poincareArea'] = float(np.pi * sd1 * sd2)
        
        # Quality metrics
        features['peakCount'] = int(len(peaks))
        features['validRRCount'] = int(len(valid_rr))
        features['qualityScore'] = self._compute_quality_score(ppg, peaks, valid_rr)
        
        return features
    
    def _compute_quality_score(self, ppg: np.ndarray, peaks: np.ndarray, valid_rr: np.ndarray) -> float:
        """Compute signal quality score (0-1)"""
        score = 0.0
        
        # Component 1: Signal amplitude (0.25 weight)
        signal_std = np.std(ppg)
        if signal_std > 0.1:
            amp_score = min(signal_std / 0.5, 1.0)
        else:
            amp_score = 0.0
        score += 0.25 * amp_score
        
        # Component 2: Peak detection success (0.25 weight)
        peak_count = len(peaks)
        expected_peaks = 27 * 1.2  # ~72 BPM for 27 seconds = ~32 peaks
        if 15 <= peak_count <= 50:  # Reasonable range
            peak_score = 1.0
        elif peak_count > 0:
            peak_score = 0.5
        else:
            peak_score = 0.0
        score += 0.25 * peak_score
        
        # Component 3: RR validity ratio (0.5 weight)
        if len(peaks) > 1:
            validity_ratio = len(valid_rr) / (len(peaks) - 1)
        else:
            validity_ratio = 0
        score += 0.5 * validity_ratio
        
        return float(min(1.0, max(0.0, score)))
    
    def _extract_accel_features(self, x: np.ndarray, y: np.ndarray, z: np.ndarray) -> Dict:
        """Extract accelerometer features"""
        # Per-axis statistics
        features = {
            'accelMeanX': float(np.mean(x)),
            'accelMeanY': float(np.mean(y)),
            'accelMeanZ': float(np.mean(z)),
            'accelStdX': float(np.std(x)),
            'accelStdY': float(np.std(y)),
            'accelStdZ': float(np.std(z)),
        }
        
        # Magnitude
        magnitudes = np.sqrt(x**2 + y**2 + z**2)
        features['accelMagnitudeMean'] = float(np.mean(magnitudes))
        features['accelMagnitudeStd'] = float(np.std(magnitudes))
        features['accelMagnitudeMax'] = float(np.max(magnitudes))
        
        # Movement intensity and energy
        features['movementIntensity'] = float(features['accelMagnitudeStd']**2)
        features['accelEnergy'] = float(np.sum(magnitudes**2))
        
        return features
    
    def _empty_hrv_features(self) -> Dict:
        """Return empty HRV features"""
        return {
            'hrMean': None, 'hrStd': None, 'hrMin': None, 'hrMax': None,
            'meanRR': None, 'sdnn': None, 'rmssd': None, 'sdsd': None,
            'pnn50': None, 'pnn20': None, 'cvnn': None, 'cvsd': None,
            'medianRR': None, 'rangeRR': None, 'iqrRR': None,
            'sd1': None, 'sd2': None, 'sd1sd2': None, 'poincareArea': None,
            'peakCount': None, 'validRRCount': None, 'qualityScore': 0.0
        }
    
    def _empty_accel_features(self) -> Dict:
        """Return empty accelerometer features"""
        return {
            'accelMeanX': None, 'accelMeanY': None, 'accelMeanZ': None,
            'accelStdX': None, 'accelStdY': None, 'accelStdZ': None,
            'accelMagnitudeMean': None, 'accelMagnitudeStd': None, 'accelMagnitudeMax': None,
            'movementIntensity': None, 'accelEnergy': None
        }


# =============================================================================
# WESAD DATASET PROCESSOR
# =============================================================================

class WESADProcessor:
    """Process WESAD dataset"""
    
    def __init__(self, raw_data_path: Path, output_path: Path):
        self.raw_data_path = raw_data_path
        self.output_path = output_path
        self.extractor = FeatureExtractor()
    
    def process(self) -> List[Dict]:
        """Process all WESAD subjects and extract features"""
        logger.info("Processing WESAD dataset...")
        
        wesad_path = self.raw_data_path / "WESAD"
        if not wesad_path.exists():
            logger.warning(f"WESAD path not found: {wesad_path}")
            return []
        
        all_features = []
        subject_dirs = sorted([d for d in wesad_path.iterdir() if d.is_dir() and d.name.startswith('S')])
        
        for subject_dir in subject_dirs:
            subject_id = subject_dir.name
            logger.info(f"Processing WESAD subject {subject_id}...")
            
            try:
                subject_features = self._process_subject(subject_dir)
                all_features.extend(subject_features)
                logger.info(f"  Extracted {len(subject_features)} windows")
            except Exception as e:
                logger.error(f"  Error processing {subject_id}: {e}")
                import traceback
                traceback.print_exc()
        
        logger.info(f"WESAD: Total {len(all_features)} windows extracted")
        return all_features
    
    def _process_subject(self, subject_dir: Path) -> List[Dict]:
        """Process a single WESAD subject"""
        subject_id = subject_dir.name
        pkl_file = subject_dir / f"{subject_id}.pkl"
        
        if not pkl_file.exists():
            logger.warning(f"  PKL file not found: {pkl_file}")
            return []
        
        # Load synchronized data
        with open(pkl_file, 'rb') as f:
            data = pickle.load(f, encoding='latin1')
        
        # Extract wrist data (Empatica E4)
        wrist_data = data['signal']['wrist']
        
        # Wrist sensors
        ppg = wrist_data['BVP']  # 64 Hz
        acc = wrist_data['ACC']  # 32 Hz, shape (N, 3)
        
        # Separate accelerometer axes (convert from 1/64g to g)
        acc_x = acc[:, 0] / 64.0
        acc_y = acc[:, 1] / 64.0
        acc_z = acc[:, 2] / 64.0
        
        logger.info(f"  PPG signal: {len(ppg)} samples, range: [{np.min(ppg):.2f}, {np.max(ppg):.2f}], std: {np.std(ppg):.2f}")
        logger.info(f"  Accel range: X[{np.min(acc_x):.3f}, {np.max(acc_x):.3f}], Y[{np.min(acc_y):.3f}, {np.max(acc_y):.3f}], Z[{np.min(acc_z):.3f}, {np.max(acc_z):.3f}]")
        
        # Window parameters (27 seconds)
        window_duration = 27.0
        
        ppg_hz = 64.0
        acc_hz = 32.0
        
        ppg_window_size = int(window_duration * ppg_hz)  # 1728 samples
        acc_window_size = int(window_duration * acc_hz)  # 864 samples
        
        # Create windows (non-overlapping)
        features_list = []
        window_idx = 0
        ppg_pos = 0
        
        while ppg_pos + ppg_window_size <= len(ppg):
            # Calculate corresponding positions
            acc_pos = int(ppg_pos * acc_hz / ppg_hz)
            
            if acc_pos + acc_window_size > len(acc_x):
                break
            
            # Extract window data
            ppg_window = ppg[ppg_pos:ppg_pos + ppg_window_size]
            acc_x_window = acc_x[acc_pos:acc_pos + acc_window_size]
            acc_y_window = acc_y[acc_pos:acc_pos + acc_window_size]
            acc_z_window = acc_z[acc_pos:acc_pos + acc_window_size]
            
            # Generate timestamp (milliseconds from start)
            timestamp_ms = float(ppg_pos / ppg_hz * 1000)
            
            # Generate unique window ID
            window_id = f"{int(timestamp_ms)}"
            
            # Extract features
            features = self.extractor.extract_features(
                ppg_window, acc_x_window, acc_y_window, acc_z_window, timestamp_ms,
                ppg_hz=ppg_hz, acc_hz=acc_hz
            )
            
            # Add window ID
            features['windowId'] = window_id
            
            features_list.append(features)
            window_idx += 1
            ppg_pos += ppg_window_size  # Non-overlapping windows
        
        return features_list


# =============================================================================
# PPG-DALIA DATASET PROCESSOR
# =============================================================================

class PPGDaLiAProcessor:
    """Process PPG-DaLiA dataset"""
    
    def __init__(self, raw_data_path: Path, output_path: Path):
        self.raw_data_path = raw_data_path
        self.output_path = output_path
        self.extractor = FeatureExtractor()
    
    def process(self) -> List[Dict]:
        """Process all PPG-DaLiA subjects and extract features"""
        logger.info("Processing PPG-DaLiA dataset...")
        
        ppg_dalia_path = self.raw_data_path / "PPG-DaLiA"
        if not ppg_dalia_path.exists():
            logger.warning(f"PPG-DaLiA path not found: {ppg_dalia_path}")
            return []
        
        all_features = []
        subject_dirs = sorted([d for d in ppg_dalia_path.iterdir() if d.is_dir() and d.name.startswith('S')])
        
        for subject_dir in subject_dirs:
            subject_id = subject_dir.name
            logger.info(f"Processing PPG-DaLiA subject {subject_id}...")
            
            try:
                subject_features = self._process_subject(subject_dir)
                all_features.extend(subject_features)
                logger.info(f"  Extracted {len(subject_features)} windows")
            except Exception as e:
                logger.error(f"  Error processing {subject_id}: {e}")
                import traceback
                traceback.print_exc()
        
        logger.info(f"PPG-DaLiA: Total {len(all_features)} windows extracted")
        return all_features
    
    def _process_subject(self, subject_dir: Path) -> List[Dict]:
        """Process a single PPG-DaLiA subject"""
        subject_id = subject_dir.name
        pkl_file = subject_dir / f"{subject_id}.pkl"
        
        if not pkl_file.exists():
            logger.warning(f"  PKL file not found: {pkl_file}")
            return []
        
        # Load synchronized data
        with open(pkl_file, 'rb') as f:
            data = pickle.load(f, encoding='latin1')
        
        # Extract wrist data (Empatica E4)
        wrist_data = data['signal']['wrist']
        
        # Wrist sensors
        ppg = wrist_data['BVP']  # 64 Hz
        acc = wrist_data['ACC']  # 32 Hz, shape (N, 3)
        
        # PPG-DaLiA: According to readme, ACC should be in 1/64g units,
        # but based on actual data analysis, it appears to already be in proper g units
        # or pre-processed. Keep as-is without conversion.
        acc_x = acc[:, 0]
        acc_y = acc[:, 1]
        acc_z = acc[:, 2]
        
        logger.info(f"  PPG signal: {len(ppg)} samples, range: [{np.min(ppg):.2f}, {np.max(ppg):.2f}], std: {np.std(ppg):.2f}")
        logger.info(f"  Accel range: X[{np.min(acc_x):.3f}, {np.max(acc_x):.3f}], Y[{np.min(acc_y):.3f}, {np.max(acc_y):.3f}], Z[{np.min(acc_z):.3f}, {np.max(acc_z):.3f}]")
        
        # Window parameters (27 seconds)
        window_duration = 27.0
        
        ppg_hz = 64.0
        acc_hz = 32.0
        
        ppg_window_size = int(window_duration * ppg_hz)
        acc_window_size = int(window_duration * acc_hz)
        
        # Create windows
        features_list = []
        window_idx = 0
        ppg_pos = 0
        
        while ppg_pos + ppg_window_size <= len(ppg):
            acc_pos = int(ppg_pos * acc_hz / ppg_hz)
            
            if acc_pos + acc_window_size > len(acc_x):
                break
            
            # Extract window data
            ppg_window = ppg[ppg_pos:ppg_pos + ppg_window_size]
            acc_x_window = acc_x[acc_pos:acc_pos + acc_window_size]
            acc_y_window = acc_y[acc_pos:acc_pos + acc_window_size]
            acc_z_window = acc_z[acc_pos:acc_pos + acc_window_size]
            
            # Generate timestamp (milliseconds from start)
            timestamp_ms = float(ppg_pos / ppg_hz * 1000)
            
            # Generate unique window ID
            window_id = f"{int(timestamp_ms)}"
            
            # Extract features
            features = self.extractor.extract_features(
                ppg_window, acc_x_window, acc_y_window, acc_z_window, timestamp_ms,
                ppg_hz=ppg_hz, acc_hz=acc_hz
            )
            
            # Add window ID
            features['windowId'] = window_id
            
            features_list.append(features)
            window_idx += 1
            ppg_pos += ppg_window_size  # Non-overlapping windows
        
        return features_list


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def main():
    """Main biometric data processing and feature extraction pipeline"""
    
    # Paths
    base_path = Path(__file__).parent
    raw_data_path = Path("./data/raw")
    output_path = Path("./data/extracted_features")
    
    # Create output directory
    output_path.mkdir(parents=True, exist_ok=True)
    
    logger.info("="*80)
    logger.info("BIOMETRIC DATA PROCESSING AND FEATURE EXTRACTION PIPELINE V2")
    logger.info("="*80)
    logger.info(f"Raw data path: {raw_data_path}")
    logger.info(f"Output path: {output_path}")
    logger.info("")
    
    # Process WESAD
    wesad_processor = WESADProcessor(raw_data_path, output_path)
    wesad_features = wesad_processor.process()
    
    logger.info("")
    
    # Process PPG-DaLiA
    ppg_dalia_processor = PPGDaLiAProcessor(raw_data_path, output_path)
    ppg_dalia_features = ppg_dalia_processor.process()
    
    # Combine all features
    all_features = wesad_features + ppg_dalia_features
    
    if len(all_features) == 0:
        logger.error("No features extracted! Check your data paths.")
        return
    
    # Create DataFrame
    df = pd.DataFrame(all_features)
    
    logger.info("")
    logger.info("="*80)
    logger.info("FEATURE EXTRACTION COMPLETE")
    logger.info("="*80)
    logger.info(f"Total windows: {len(df)}")
    logger.info(f"Total features per window: {len(df.columns)}")
    logger.info("")
    
    # Define feature columns in correct order
    feature_columns = [
        # Identifiers
        'windowId', 'timestamp', 'durationMs',
        
        # Accelerometer (11)
        'accelEnergy', 'accelMagnitudeMax', 'accelMagnitudeMean', 'accelMagnitudeStd',
        'accelMeanX', 'accelMeanY', 'accelMeanZ',
        'accelStdX', 'accelStdY', 'accelStdZ',
        'movementIntensity',
        
        # HRV - Time Domain
        'cvnn', 'cvsd',
        'hrMax', 'hrMean', 'hrMin', 'hrStd',
        'iqrRR', 'meanRR', 'medianRR', 'rangeRR',
        'pnn20', 'pnn50',
        'rmssd', 'sdnn', 'sdsd',
        
        # HRV - Non-Linear/Poincaré
        'poincareArea', 'sd1', 'sd1sd2', 'sd2',
        
        # Quality Metrics
        'peakCount', 'qualityScore', 'validRRCount',
    ]
    
    # Reorder columns
    df = df[feature_columns]
    
    # Save features
    features_csv = output_path / "extracted_features.csv"
    df.to_csv(features_csv, index=False)
    logger.info(f"Features saved to: {features_csv}")
    
    features_pkl = output_path / "extracted_features.pkl"
    df.to_pickle(features_pkl)
    logger.info(f"Features saved to: {features_pkl}")
    
    # Print statistics
    logger.info("")
    logger.info("Feature extraction statistics:")
    logger.info("-" * 80)
    
    # Count windows with valid HRV
    valid_hrv = df['peakCount'].notna() & (df['peakCount'] > 0)
    logger.info(f"Windows with valid HRV: {valid_hrv.sum()} / {len(df)} ({valid_hrv.sum()/len(df)*100:.1f}%)")
    
    if valid_hrv.sum() > 0:
        logger.info(f"Average peaks per window: {df.loc[valid_hrv, 'peakCount'].mean():.1f}")
        logger.info(f"Average quality score: {df.loc[valid_hrv, 'qualityScore'].mean():.3f}")
        logger.info(f"Average HR: {df.loc[valid_hrv, 'hrMean'].mean():.1f} BPM")
    
    # Print sample
    logger.info("")
    logger.info("Sample of first valid row:")
    logger.info("-" * 80)
    first_valid = df[valid_hrv].head(1)
    if len(first_valid) > 0:
        sample = first_valid.iloc[0].to_dict()
        for key, value in sample.items():
            if value is not None:
                logger.info(f"{key}: {value}")
    
    logger.info("")
    logger.info("="*80)
    logger.info("PIPELINE COMPLETE!")
    logger.info("="*80)


if __name__ == "__main__":
    main()