interface Env {
  BACKEND: DurableObjectNamespace;
  DB: D1Database;
  MAGIC_WORD: string;
  WORKER_BASE_URL: string;
  FORESIGHT_POKE_API_KEY: string;
  FORESIGHT_MODAL_TOKEN_ID: string;
  FORESIGHT_MODAL_TOKEN_SECRET: string;
  FORESIGHT_MODAL_APP_NAME: string;
  FORESIGHT_MODAL_CLASS_NAME: string;
  OPENAI_API_KEY: string;
}
