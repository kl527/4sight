import { Container, getContainer } from "@cloudflare/containers";

export class BackendContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "5m";

  constructor(ctx: DurableObjectState<Env>, env: Env) {
    super(ctx, env);
    this.envVars = {
      MODAL_TOKEN_ID: env.FORESIGHT_MODAL_TOKEN_ID ?? "",
      MODAL_TOKEN_SECRET: env.FORESIGHT_MODAL_TOKEN_SECRET ?? "",
      MODAL_APP_NAME: env.FORESIGHT_MODAL_APP_NAME ?? "",
      MODAL_CLASS_NAME: env.FORESIGHT_MODAL_CLASS_NAME ?? "",
    };
  }

  override onStart(): void {
    console.log("Backend container started");
  }

  override onStop(): void {
    console.log("Backend container stopped");
  }

  override onError(error: unknown): void {
    console.error("Backend container error:", error);
  }

  override async onActivityExpired(): Promise<void> {
    // Don't stop — WebSocket activity doesn't reset the sleep timer,
    // so we keep the container alive as long as it's running.
  }
}

export default {
  async fetch(
    request: Request,
    env: {
      BACKEND: DurableObjectNamespace<BackendContainer>;
      DB: D1Database;
      MAGIC_WORD: string;
      FORESIGHT_POKE_API_KEY: string;
      FORESIGHT_MODAL_TOKEN_ID: string;
      FORESIGHT_MODAL_TOKEN_SECRET: string;
      FORESIGHT_MODAL_APP_NAME: string;
      FORESIGHT_MODAL_CLASS_NAME: string;
    },
  ): Promise<Response> {
    const url = new URL(request.url);

    const container = getContainer(env.BACKEND, "backend");

    // health check is public
    if (url.pathname === "/health") {
      return container.fetch(request);
    }

    // everything else requires the magic word (header or query param)
    const magic =
      request.headers.get("x-magic-word") ?? url.searchParams.get("magic_word");
    if (!env.MAGIC_WORD || magic !== env.MAGIC_WORD) {
      return new Response("forbidden", { status: 403 });
    }

    // D1 biometrics upload — handled entirely in the Worker
    if (url.pathname === "/biometrics/upload" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const { windowId, timestamp, durationMs, riskPrediction, qualityScore, ...rest } = body;

      const featuresJson = JSON.stringify({ windowId, timestamp, durationMs, qualityScore, ...rest });
      const riskJson = riskPrediction ? JSON.stringify(riskPrediction) : null;

      await env.DB.prepare(
        `INSERT OR IGNORE INTO biometric_windows (window_id, timestamp, duration_ms, features, risk, quality_score)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(windowId, timestamp, durationMs, featuresJson, riskJson, (qualityScore as number) ?? 0)
        .run();

      return Response.json({ success: true, windowId, storedAt: Date.now() });
    }

    // For WebSocket upgrades, forward the original request directly —
    // new Request() strips the Upgrade header (forbidden in Fetch spec).
    const isUpgrade =
      request.headers.get("Upgrade")?.toLowerCase() === "websocket";

    if (isUpgrade) {
      return container.fetch(request);
    }

    // For regular HTTP: forward secrets to the container as headers
    const headers = new Headers(request.headers);
    if (env.FORESIGHT_POKE_API_KEY) {
      headers.set("x-poke-api-key", env.FORESIGHT_POKE_API_KEY);
    }
    if (env.FORESIGHT_MODAL_TOKEN_ID) {
      headers.set("x-modal-token-id", env.FORESIGHT_MODAL_TOKEN_ID);
    }
    if (env.FORESIGHT_MODAL_TOKEN_SECRET) {
      headers.set("x-modal-token-secret", env.FORESIGHT_MODAL_TOKEN_SECRET);
    }
    if (env.FORESIGHT_MODAL_APP_NAME) {
      headers.set("x-modal-app-name", env.FORESIGHT_MODAL_APP_NAME);
    }
    if (env.FORESIGHT_MODAL_CLASS_NAME) {
      headers.set("x-modal-class-name", env.FORESIGHT_MODAL_CLASS_NAME);
    }
    const proxied = new Request(request, { headers });
    return container.fetch(proxied);
  },
};
