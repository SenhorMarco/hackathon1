// Testa a chave da Featherless e o modelo com uma chamada pequena.
// Uso: npx tsx scripts/testar-ia.ts [modelo] [imagem.png|jpg]
//   Sem imagem: pede um JSON simples. Com imagem: pede a transcrição dela.
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { z } from "zod";
import { gerarJson, type TipoImagem } from "../src/lib/ai/json";

process.loadEnvFile(".env.local");

const modelo = process.argv[2] || process.env.AI_MODEL || "Qwen/Qwen3.8-27B";
const caminhoImagem = process.argv[3];

const cliente = new OpenAI({
  apiKey: process.env.FEATHERLESS_API_KEY,
  baseURL: "https://api.featherless.ai/v1",
});

const Teste = z.object({
  ok: z.boolean(),
  transcricao: z.string().describe("Texto lido na imagem, ou vazio se não houver imagem"),
  observacao: z.string(),
});

const imagens = caminhoImagem
  ? [
      {
        tipo: (caminhoImagem.endsWith(".png") ? "image/png" : "image/jpeg") as TipoImagem,
        base64: readFileSync(caminhoImagem).toString("base64"),
      },
    ]
  : [];

const inicio = Date.now();
const resultado = await gerarJson({
  cliente,
  modelo,
  schema: Teste,
  sistema: "Você é um assistente de teste.",
  texto: caminhoImagem
    ? "Transcreva tudo o que está escrito na imagem, incluindo contas matemáticas."
    : "Responda com ok verdadeiro e uma observação curta em português.",
  imagens,
  maxTokens: 2000,
});

console.log(`Modelo: ${modelo} (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
console.log(JSON.stringify(resultado, null, 2));
