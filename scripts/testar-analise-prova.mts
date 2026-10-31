// Uso: npx tsx scripts/testar-analise-prova.mts [arquivo.txt|imagem.png|imagem.jpg|imagem.webp]
// Sem argumento, usa questões sintéticas; com argumento, lê apenas o arquivo indicado.
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import OpenAI from "openai";
import { analisarProva } from "../src/lib/ai/analise-prova";
import type { Imagem, TipoImagem } from "../src/lib/ai/json";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.FEATHERLESS_API_KEY) {
  throw new Error("Defina FEATHERLESS_API_KEY no ambiente ou em .env.local.");
}

const arquivo = process.argv[2];
const extensao = arquivo ? extname(arquivo).toLowerCase() : "";
const tipos: Record<string, TipoImagem> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
let texto: string;
let imagens: Imagem[] = [];
if (!arquivo) {
  texto = `Analise esta prova sintética:
1. Resolva 2x + 3 = 7.
2. Encontre os números reais x tais que x² = 4.
3. Determine x sabendo que x + 1 = x + 2.
4. Um retângulo tem área de 12 cm². Determine seu perímetro.`;
} else if (extensao === ".txt") {
  texto = readFileSync(arquivo, "utf8");
} else if (tipos[extensao]) {
  texto = "Analise a prova presente na imagem fornecida.";
  imagens = [{ tipo: tipos[extensao], base64: readFileSync(arquivo).toString("base64") }];
} else {
  throw new Error("Formato não suportado. Forneça um arquivo .txt, .png, .jpg, .jpeg ou .webp. PDF deve ser convertido em imagens antes do teste.");
}

const cliente = new OpenAI({ apiKey: process.env.FEATHERLESS_API_KEY, baseURL: "https://api.featherless.ai/v1", timeout: 180_000 });
const resultado = await analisarProva({
  cliente,
  modelo: process.env.AI_MODEL || "Qwen/Qwen3.8-27B",
  texto,
  imagens,
});
console.log(JSON.stringify(resultado, null, 2));
