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
      WORKER_BASE_URL: env.WORKER_BASE_URL ?? "",
      MAGIC_WORD: env.MAGIC_WORD ?? "",
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
      WORKER_BASE_URL: string;
      FORESIGHT_POKE_API_KEY: string;
      FORESIGHT_MODAL_TOKEN_ID: string;
      FORESIGHT_MODAL_TOKEN_SECRET: string;
      FORESIGHT_MODAL_APP_NAME: string;
      FORESIGHT_MODAL_CLASS_NAME: string;
      OPENAI_API_KEY: string;
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

    // D1 caption upload — handled entirely in the Worker
    if (url.pathname === "/captions/upload" && request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const { windowId, timestamp, chunkStartS, chunkEndS, caption, latencyMs, tokensGenerated } = body;

      await env.DB.prepare(
        `INSERT OR IGNORE INTO caption_windows (window_id, timestamp, chunk_start_s, chunk_end_s, caption, latency_ms, tokens_generated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          windowId,
          timestamp,
          chunkStartS,
          chunkEndS,
          caption,
          (latencyMs as number) ?? null,
          (tokensGenerated as number) ?? null,
        )
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

  async scheduled(
    _event: ScheduledEvent,
    env: {
      DB: D1Database;
      OPENAI_API_KEY: string;
    },
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runInterventionCheck(env));
  },
};

async function runInterventionCheck(env: {
  DB: D1Database;
  OPENAI_API_KEY: string;
}): Promise<void> {
  try {
    const biometrics = await env.DB.prepare(
      `SELECT id, window_id, features, risk, quality_score, created_at
       FROM biometric_windows
       WHERE created_at >= datetime('now', '-1 minute')`
    ).all();

    const captions = await env.DB.prepare(
      `SELECT id, window_id, caption, chunk_start_s, chunk_end_s, created_at
       FROM caption_windows
       WHERE created_at >= datetime('now', '-1 minute')`
    ).all();

    if (biometrics.results.length === 0 && captions.results.length === 0) {
      console.log("intervention cron: no recent data, skipping");
      return;
    }

    console.log(
      `intervention cron: ${biometrics.results.length} biometric rows, ${captions.results.length} caption rows`
    );

    const systemPrompt = `You are 4sight, a brutally honest AI health agent. You observe real-time biometrics and food intake via smart glasses.

Your job: decide whether to intervene RIGHT NOW with a fear-driven health nudge.

Intervene ("yes") when you see something actionable — unhealthy food, dangerous vitals, sedentary behavior.
Skip ("no") when data is unremarkable or you already intervened recently.

Respond with JSON only: {"decision": "yes" or "no", "reasoning": "one sentence"}`;

    const userMessage = JSON.stringify({
      biometrics: biometrics.results,
      captions: captions.results,
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 100,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      console.error(
        `intervention cron: OpenAI API error ${response.status}`,
        await response.text()
      );
      return;
    }

    const completion = (await response.json()) as {
      choices: { message: { content: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const usage = completion.usage;

    let decision: string;
    let reasoning: string | null = null;

    try {
      const parsed = JSON.parse(raw) as { decision: string; reasoning?: string };
      decision = parsed.decision === "yes" ? "yes" : "no";
      reasoning = parsed.reasoning ?? null;
    } catch {
      // Fallback: substring match
      decision = raw.toLowerCase().includes('"yes"') ? "yes" : "no";
      reasoning = raw.slice(0, 200);
    }

    const biometricIds = JSON.stringify(biometrics.results.map((r) => r.id));
    const captionIds = JSON.stringify(captions.results.map((r) => r.id));

    await env.DB.prepare(
      `INSERT INTO interventions (decision, reasoning, biometric_ids, caption_ids, model, prompt_tokens, completion_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        decision,
        reasoning,
        biometricIds,
        captionIds,
        "gpt-4o-mini",
        usage?.prompt_tokens ?? null,
        usage?.completion_tokens ?? null,
      )
      .run();

    console.log(`intervention cron: decision=${decision}, reasoning=${reasoning}`);
  } catch (err) {
    console.error("intervention cron: unhandled error", err);
  }
}
