import type { BiosignalFeatures } from "@/features/feature-extraction/types";
import type { RiskPrediction } from "@/features/risk-prediction";
import { postJSON } from "./client";

interface UploadResponse {
  success: boolean;
  windowId: string;
  storedAt: number;
}

export function uploadBiometrics(
  features: BiosignalFeatures,
  riskPrediction?: RiskPrediction,
): Promise<UploadResponse> {
  const TAG = "[upload]";

  console.log(
    `${TAG} preparing biometrics upload — windowId=${features.windowId} ` +
    `timestamp=${features.timestamp} duration=${features.durationMs}ms quality=${features.qualityScore?.toFixed(2)} ` +
    `HR=${features.hrMean?.toFixed(1)} sdnn=${features.sdnn?.toFixed(1)} rmssd=${features.rmssd?.toFixed(1)} ` +
    `peaks=${features.peakCount} validRR=${features.validRRCount} accelEnergy=${features.accelEnergy?.toFixed(2)}`,
  );

  if (riskPrediction) {
    const r = riskPrediction.riskAssessment;
    console.log(
      `${TAG} riskPrediction included — alert=${riskPrediction.alertLevel} ` +
      `susceptibility=${riskPrediction.overallSusceptibility.toFixed(3)} ` +
      `timeToRisk=${riskPrediction.timeToRiskMinutes.toFixed(1)}m ` +
      `[${riskPrediction.timeToRiskRange.lower.toFixed(1)}-${riskPrediction.timeToRiskRange.upper.toFixed(1)}] ` +
      `stress=L${r.stress.level} health=L${r.health.level} sleep=L${r.sleepFatigue.level} ` +
      `cog=L${r.cognitiveFatigue.level} exert=L${r.physicalExertion.level}`,
    );
  } else {
    console.log(`${TAG} riskPrediction=null (not included in upload)`);
  }

  return postJSON<UploadResponse>("/biometrics/upload", {
    ...features,
    riskPrediction: riskPrediction ?? null,
  });
}
