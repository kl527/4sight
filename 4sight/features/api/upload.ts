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
  return postJSON<UploadResponse>("/biometrics/upload", {
    ...features,
    riskPrediction: riskPrediction ?? null,
  });
}
