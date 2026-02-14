import { Container, getContainer } from "@cloudflare/containers";

export class BackendContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "5m";

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
    env: { BACKEND: DurableObjectNamespace<BackendContainer> },
  ): Promise<Response> {
    const container = getContainer(env.BACKEND, "backend");
    return container.fetch(request);
  },
};
