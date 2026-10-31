/**
 * Chamada à IA que devolve JSON validado por um contrato de schemas.ts.
 *
 * A Featherless é compatível com a API da OpenAI, mas não garante o formato
 * da resposta. Por isso o JSON Schema vai no prompt, a resposta é validada
 * com zod e, se vier fora do formato, pedimos a correção uma vez.
 */
import type OpenAI from "openai";
import { z } from "zod";

export type TipoImagem = "image/png" | "image/jpeg" | "image/webp";

export interface Imagem {
  tipo: TipoImagem;
  base64: string;
}

export class ErroIA extends Error {
  constructor(
    message: string,
    readonly respostaBruta?: string,
  ) {
    super(message);
    this.name = "ErroIA";
  }
}

/** Tira raciocínio (<think>), cercas de markdown e texto em volta do objeto JSON. */
export function extrairJson(texto: string): unknown {
  const semRaciocinio = texto.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const inicio = semRaciocinio.indexOf("{");
  const fim = semRaciocinio.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) {
    throw new ErroIA("A resposta não contém um objeto JSON", texto);
  }
  try {
    return JSON.parse(semRaciocinio.slice(inicio, fim + 1));
  } catch {
    throw new ErroIA("A resposta contém JSON inválido", texto);
  }
}

function descreverErros(erro: z.ZodError): string {
  return erro.issues
    .slice(0, 10)
    .map((i) => `- ${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("\n");
}

export interface PedidoJson<T extends z.ZodType> {
  cliente: OpenAI;
  modelo: string;
  schema: T;
  /** Papel e regras da tarefa. O formato JSON é acrescentado automaticamente. */
  sistema: string;
  /** Instrução e dados da chamada. Vai antes das imagens. */
  texto: string;
  imagens?: Imagem[];
  maxTokens?: number;
  /**
   * Desliga o raciocínio estendido dos modelos que o têm (Qwen 3.x e similares).
   * Deixa a resposta várias vezes mais rápida; use em tarefas de transcrição.
   */
  semRaciocinio?: boolean;
}

export async function gerarJson<T extends z.ZodType>({
  cliente,
  modelo,
  schema,
  sistema,
  texto,
  imagens = [],
  maxTokens = 8000,
  semRaciocinio = false,
}: PedidoJson<T>): Promise<z.infer<T>> {
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
  const mensagens: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        `${sistema}\n\n` +
        "Responda APENAS com um objeto JSON válido que siga exatamente este JSON Schema. " +
        "Não escreva nada antes ou depois do JSON e não use markdown.\n" +
        jsonSchema,
    },
    {
      role: "user",
      content: [
        { type: "text", text: texto },
        ...imagens.map(
          (img): OpenAI.Chat.ChatCompletionContentPartImage => ({
            type: "image_url",
            image_url: { url: `data:${img.tipo};base64,${img.base64}` },
          }),
        ),
      ],
    },
  ];

  let ultimaFalha = "";
  let ultimaResposta = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const resposta = await cliente.chat.completions.create({
      model: modelo,
      messages: mensagens,
      max_tokens: maxTokens,
      temperature: 0.2,
      // Parâmetro da Featherless (vLLM), fora dos tipos da OpenAI.
      ...(semRaciocinio ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    ultimaResposta = resposta.choices[0]?.message?.content ?? "";

    try {
      const resultado = schema.safeParse(extrairJson(ultimaResposta));
      if (resultado.success) return resultado.data;
      ultimaFalha = descreverErros(resultado.error);
    } catch (e) {
      ultimaFalha = e instanceof Error ? e.message : String(e);
    }

    mensagens.push(
      { role: "assistant", content: ultimaResposta },
      {
        role: "user",
        content:
          `Sua resposta não seguiu o formato pedido:\n${ultimaFalha}\n` +
          "Responda de novo apenas com o objeto JSON corrigido.",
      },
    );
  }

  throw new ErroIA(`A IA não devolveu o formato esperado: ${ultimaFalha}`, ultimaResposta);
}
