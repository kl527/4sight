import Constants from "expo-constants";

const TAG = "[API]";

const config = Constants.expoConfig?.extra as
  | { apiBaseUrl?: string; magicWord?: string }
  | undefined;

const BASE_URL = config?.apiBaseUrl ?? "https://foresight-backend.jun-871.workers.dev";
const MAGIC_WORD = process.env.EXPO_PUBLIC_MAGIC_WORD ?? config?.magicWord ?? "";

console.log(`${TAG} config loaded — baseUrl=${BASE_URL} magicWord=${MAGIC_WORD ? `"${MAGIC_WORD.slice(0, 3)}…" (${MAGIC_WORD.length} chars)` : "(empty)"}`);

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const payload = JSON.stringify(body);
  const payloadKB = (payload.length / 1024).toFixed(1);

  // Log outgoing request summary
  const bodyObj = body as Record<string, unknown> | null;
  const windowId = bodyObj?.windowId ?? "unknown";
  const hasRisk = bodyObj?.riskPrediction != null;
  const topLevelKeys = bodyObj ? Object.keys(bodyObj) : [];
  console.log(
    `${TAG} POST ${path} — windowId=${windowId} payloadSize=${payloadKB}KB keys=[${topLevelKeys.join(",")}] hasRiskPrediction=${hasRisk} magicWord=${MAGIC_WORD ? "set" : "MISSING"}`,
  );

  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-magic-word": MAGIC_WORD,
      },
      body: payload,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`${TAG} POST ${path} — network error after ${elapsed}ms:`, err);
    throw err;
  }

  const elapsed = Date.now() - start;

  if (!res.ok) {
    const responseBody = await res.text().catch(() => "(unreadable)");
    console.error(
      `${TAG} POST ${path} — FAILED ${res.status} ${res.statusText} after ${elapsed}ms — response: ${responseBody}`,
    );
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as T;
  console.log(`${TAG} POST ${path} — OK 200 after ${elapsed}ms — response: ${JSON.stringify(json)}`);
  return json;
}
