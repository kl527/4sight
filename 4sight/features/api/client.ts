import Constants from "expo-constants";

const config = Constants.expoConfig?.extra as
  | { apiBaseUrl?: string; magicWord?: string }
  | undefined;

const BASE_URL = config?.apiBaseUrl ?? "https://foresight-backend.jun-871.workers.dev";
const MAGIC_WORD = config?.magicWord ?? "";

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-magic-word": MAGIC_WORD,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
