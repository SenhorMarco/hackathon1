import "server-only";
import OpenAI from "openai";

export const FEATHERLESS_URL = "https://api.featherless.ai/v1";

/** Modelo com visão usado em todas as etapas. Troque pelo AI_MODEL no .env.local. */
export const MODELO = process.env.AI_MODEL || "Qwen/Qwen3.8-27B";

let cliente: OpenAI | null = null;

/** Cliente da Featherless (API compatível com a OpenAI). Só no servidor. */
export function ia(): OpenAI {
  if (cliente) return cliente;
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) throw new Error("Defina FEATHERLESS_API_KEY no .env.local");
  // maxRetries cobre o 429 de limite de chamadas simultâneas da Featherless.
  cliente = new OpenAI({ apiKey, baseURL: FEATHERLESS_URL, maxRetries: 3, timeout: 180_000 });
  return cliente;
}
