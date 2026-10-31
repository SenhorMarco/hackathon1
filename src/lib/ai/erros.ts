import OpenAI from "openai";
import { ErroIA } from "./json";

/**
 * Traduz uma falha da chamada à IA em uma frase que o professor entende,
 * sem expor chaves ou detalhes internos. Começa em minúscula para compor
 * "Não foi possível analisar o documento: <motivo>".
 */
export function motivoFalhaIA(error: unknown): string {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "a IA demorou demais para responder. Tente de novo; se repetir, envie um arquivo com menos páginas.";
  if (error instanceof OpenAI.RateLimitError) return "a IA está ocupada com outra tarefa do grupo (limite de uso simultâneo). Aguarde um minuto e tente de novo.";
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) return "a chave da IA foi recusada. Confira a FEATHERLESS_API_KEY na Vercel.";
  if (error instanceof OpenAI.NotFoundError) return "o modelo de IA configurado não existe na Featherless. Confira a variável AI_MODEL.";
  if (error instanceof OpenAI.BadRequestError) return `a IA recusou o pedido (${error.message.slice(0, 160)}). Tente um arquivo menor ou com menos páginas.`;
  if (error instanceof OpenAI.APIConnectionError) return "não foi possível conectar à IA. Tente de novo em instantes.";
  if (error instanceof OpenAI.APIError) return `a IA respondeu com erro ${error.status ?? ""}. Tente de novo em instantes.`;
  if (error instanceof ErroIA) return "a resposta da IA veio incompleta ou fora do formato esperado. Tente de novo.";
  if (error instanceof Error && /páginas/.test(error.message)) return error.message;
  if (error instanceof Error && /indisponível|ausente/i.test(error.message)) return "o arquivo não foi encontrado no armazenamento. Envie a prova de novo.";
  return "não foi possível converter o documento em imagens para a IA. Envie um PDF ou uma foto legível.";
}

/** Linha de log para a Vercel: tipo e mensagem do erro, sem dados da prova. */
export function logFalhaIA(etapa: string, error: unknown) {
  const tipo = error instanceof Error ? error.name : typeof error;
  const status = error instanceof OpenAI.APIError ? ` status=${error.status}` : "";
  const mensagem = error instanceof Error ? error.message.slice(0, 300) : "";
  console.error(`Falha na ${etapa}: ${tipo}${status} ${mensagem}`);
}
