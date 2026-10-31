// Mede a velocidade da IA ao analisar um PDF: uma chamada por página, em paralelo,
// com raciocínio estendido desligado. Mostra o progresso a cada 15 s.
// Uso: npx tsx scripts/medir-analise.mts caminho/prova.pdf [modelo] [larguraMax]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import OpenAI from "openai";

process.loadEnvFile(".env.local");
const arquivo = process.argv[2];
const modelo = process.argv[3] || process.env.AI_MODEL || "Qwen/Qwen3.8-27B";
const larguraMax = Number(process.argv[4] || 1600);
const cliente = new OpenAI({ apiKey: process.env.FEATHERLESS_API_KEY, baseURL: "https://api.featherless.ai/v1", timeout: 400_000, maxRetries: 0 });

async function paginas(bytes: Uint8Array): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const root = join(process.cwd(), "node_modules", "pdfjs-dist").split("\\").join("/");
  const pdf = await getDocument({ data: bytes, standardFontDataUrl: root + "/standard_fonts/", cMapUrl: root + "/cmaps/", cMapPacked: true }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const o = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, larguraMax / o.width, (larguraMax * 1.4) / o.height) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport }).promise;
    out.push(canvas.toBuffer("image/png").toString("base64"));
  }
  return out;
}

const imgs = await paginas(new Uint8Array(readFileSync(arquivo)));
console.log(`${modelo} · ${imgs.length} página(s) · largura ${larguraMax}px · ${(imgs.reduce((s, b) => s + b.length, 0) / 1024).toFixed(0)} KB`);
const inicio = Date.now();
const estado = imgs.map(() => ({ chars: 0, primeiro: 0, fim: 0 }));
const relogio = setInterval(() => console.log(`  ${((Date.now() - inicio) / 1000).toFixed(0)}s: ${estado.map((e, i) => `p${i + 1}=${e.chars}ch${e.fim ? " ✓" : ""}`).join(" ")}`), 15_000);

await Promise.all(imgs.map(async (b, i) => {
  const stream = await cliente.chat.completions.create({
    model: modelo, max_tokens: 8000, temperature: 0.2, stream: true,
    messages: [
      { role: "system", content: "Analise as questões desta página da prova. Para cada questão: número, enunciado, conteúdo, resolução passo a passo curta, resposta final, dificuldade, e critérios de barema com pontos. Responda só em JSON, de forma concisa." },
      { role: "user", content: [{ type: "text", text: `Página ${i + 1} de ${imgs.length}.` }, { type: "image_url", image_url: { url: `data:image/png;base64,${b}` } }] },
    ],
    chat_template_kwargs: { enable_thinking: false },
  } as unknown as OpenAI.Chat.ChatCompletionCreateParamsStreaming);
  for await (const parte of stream) {
    const d = parte.choices[0]?.delta?.content ?? "";
    if (d && !estado[i].primeiro) estado[i].primeiro = Date.now();
    estado[i].chars += d.length;
  }
  estado[i].fim = Date.now();
}));
clearInterval(relogio);
estado.forEach((e, i) => console.log(`página ${i + 1}: 1º token ${((e.primeiro - inicio) / 1000).toFixed(1)}s, fim ${((e.fim - inicio) / 1000).toFixed(1)}s, ${e.chars} caracteres`));
