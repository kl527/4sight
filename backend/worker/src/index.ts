import { Container, getContainer } from "@cloudflare/containers";

export class BackendContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30s";

  override onStart(): void {
    console.log("Backend container started");
  }

  override onStop(): void {
    console.log("Backend container stopped");
  }

  override onError(error: unknown): void {
    console.error("Backend container error:", error);
  }
}

export default {
  async fetch(
    request: Request,
    env: {
      BACKEND: DurableObjectNamespace<BackendContainer>;
      MAGIC_WORD: string;
      FORESIGHT_POKE_API_KEY: string;
      FORESIGHT_MODAL_TOKEN_ID: string;
      FORESIGHT_MODAL_TOKEN_SECRET: string;
      FORESIGHT_MODAL_APP_NAME: string;
      FORESIGHT_MODAL_CLASS_NAME: string;
    },
  ): Promise<Response> {
    const url = new URL(request.url);

    // health check is public
    if (url.pathname === "/health") {
      const container = getContainer(env.BACKEND, "backend");
      return container.fetch(request);
    }

    // everything else requires the magic word (header or query param)
    const magic =
      request.headers.get("x-magic-word") ?? url.searchParams.get("magic_word");
    if (!env.MAGIC_WORD || magic !== env.MAGIC_WORD) {
      return new Response("forbidden", { status: 403 });
    }

    // forward secrets to the container as headers
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

    const container = getContainer(env.BACKEND, "backend");
    return container.fetch(proxied);
  },
};
