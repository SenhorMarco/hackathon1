// Casos sintéticos de comportamento. Uso: npx tsx scripts/avaliar-prompts.mts [modelo]
// Até 14 chamadas; limites configuráveis por TESTE_MAX_TOKENS e TESTE_ORCAMENTO_USD.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { analisarProva } from "../src/lib/ai/analise-prova";
import { gerarBarema } from "../src/lib/ai/barema";
import { corrigirAluno } from "../src/lib/ai/correcao";
import type { AnaliseProva, Barema } from "../src/lib/ai/schemas";

process.loadEnvFile(".env.local");
const modelo = process.argv[2] || "Qwen/Qwen2.5-72B-Instruct";
const filtros = process.argv.slice(3);
const maxTokens = Number(process.env.TESTE_MAX_TOKENS ?? 2000);
const orcamento = Number(process.env.TESTE_ORCAMENTO_USD ?? 1);
if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8000 || !Number.isFinite(orcamento) || orcamento <= 0 || orcamento > 1) throw new Error("Limites inválidos: saída até 8000 tokens e orçamento até US$ 1 por rodada");
const cliente = new OpenAI({ apiKey: process.env.FEATHERLESS_API_KEY, baseURL: "https://api.featherless.ai/v1", maxRetries: 0, timeout: 180_000 });
const criar = cliente.chat.completions.create.bind(cliente.chat.completions);
let chamadas = 0;
let custo = 0;
const usos: unknown[] = [];
const respostasBrutas: string[] = [];
cliente.chat.completions.create = (async (...args: Parameters<typeof criar>) => {
  if (++chamadas > 14) throw new Error("Orçamento de chamadas do teste atingido");
  if (custo >= orcamento) throw new Error("Orçamento de custo informado da rodada atingido");
  const inicio = Date.now();
  const r = await criar(...args);
  if (!("choices" in r)) throw new Error("Streaming não esperado");
  const uso = r.usage as (typeof r.usage & { cost?: number });
  custo += uso?.cost ?? 0;
  usos.push({ ...uso, duracaoMs: Date.now() - inicio });
  respostasBrutas.push(r.choices[0]?.message?.content ?? "");
  return r;
}) as typeof cliente.chat.completions.create;

const analise: AnaliseProva = { questoes: [{ numero: 1, enunciado: "Resolva 3x+2=14.", conteudo: "equação do primeiro grau", resolucao: { passos: ["3x=12", "x=4"], respostaFinal: "x=4" }, existenciaResposta: { status: "unica", observacao: "Coeficiente não nulo." }, problemasEnunciado: [], dificuldadeEstimada: "facil", justificativaDificuldade: "Duas operações elementares." }], observacoesGerais: "Prova sintética." };
const barema: Barema = { questoes: [{ numero: 1, valorTotal: 2, criterios: [{ id: "q1-c1", descricao: "Isola 3x=12 corretamente.", pontos: 1 }, { id: "q1-c2", descricao: "Encontra x=4 corretamente.", pontos: 1 }] }] };
const base = { cliente, modelo, maxTokens };
const resultados: unknown[] = [];
let falhas = 0;
let selecionados = 0;
let falhaExecucao = false;

async function caso(nome: string, executar: () => Promise<unknown>) {
  if (filtros.length && !filtros.includes(nome)) return;
  selecionados++;
  if (falhaExecucao) {
    falhas++;
    resultados.push({ nome, executado: false, motivo: "Execução interrompida após falha da API" });
    return;
  }
  const inicio = usos.length;
  try {
    const resultado = await executar();
    resultados.push({ nome, aprovado: true, resultado, usos: usos.slice(inicio) });
    console.log(`${nome}: aprovado`);
  } catch (e) {
    falhas++;
    const conhecido = e instanceof Error && ["ErroRevisaoIA", "AssertionError", "ErroIA"].includes(e.name);
    const erro = e instanceof Error ? e.message.replaceAll(process.env.FEATHERLESS_API_KEY ?? "CHAVE_NAO_CONFIGURADA", "[CHAVE]").slice(0,1000) : "Erro desconhecido";
    if (!conhecido) falhaExecucao = true;
    resultados.push({ nome, aprovado: false, erro, respostas: respostasBrutas.slice(inicio), usos: usos.slice(inicio) });
    console.log(`${nome}: falhou — ${erro}`);
  }
}

await caso("barema-coerente-sem-falso-problema", async () => {
  const r = await gerarBarema({ ...base, analise, baremaProfessor: barema });
  assert.equal(r.problemas.length, 0);
  return r;
});
await caso("barema-sugerido-com-pontuacao-explicita", async () => {
  const r = await gerarBarema({ ...base, analise, valoresQuestoes: { 1: 2 } });
  assert.equal(r.origem, "sugerido");
  return r;
});
for (const teste of [
  { nome: "correcao-correta", texto: "3x=12; x=4.", nota: 2, ids: ["q1-c1", "q1-c2"], erro: null, passos: [true, true] },
  { nome: "correcao-parcial", texto: "3x=12; x=12.", nota: 1, ids: ["q1-c1"], erro: 2, passos: [true, false] },
  { nome: "correcao-sem-criterios-atendidos", texto: "3x=16; x=16.", nota: 0, ids: [], erro: 1, passos: [false, false] },
]) {
  await caso(teste.nome, async () => {
    const r = await corrigirAluno({ ...base, analise, barema, resposta: "Avalie respostasTexto.", respostasTexto: [{ numero: 1, texto: teste.texto }] });
    const q = r.questoes[0];
    assert.equal(q.notaSugerida, teste.nota);
    assert.deepEqual([...q.criteriosAtendidos].sort(), [...teste.ids].sort());
    assert.equal(q.primeiroPassoErrado, teste.erro);
    assert.deepEqual(q.passos.map(p => p.correto), teste.passos);
    assert.equal(q.metodo, "padrao");
    return r;
  });
}
await caso("correcao-metodo-alternativo-valido", async () => {
  const alternativa: AnaliseProva = { ...analise, questoes: [{ ...analise.questoes[0], enunciado: "Resolva x²-5x+6=0 nos reais.", resolucao: { passos: ["Pela fórmula de Bhaskara, Δ=25-24=1", "x=(5±1)/2"], respostaFinal: "x=2 ou x=3" }, existenciaResposta: { status: "multiplas", observacao: "Duas raízes reais." } }] };
  const criterios: Barema = { questoes: [{ numero: 1, valorTotal: 2, criterios: [{ id: "q1-c1", descricao: "Apresenta procedimento matematicamente válido para obter as raízes, por qualquer método.", pontos: 1 }, { id: "q1-c2", descricao: "Obtém ambas as raízes x=2 e x=3.", pontos: 1 }] }] };
  const r = await corrigirAluno({ ...base, analise: alternativa, barema: criterios, resposta: "Avalie respostasTexto.", respostasTexto: [{ numero: 1, texto: "x²-5x+6=(x-2)(x-3)=0; x=2 ou x=3." }] });
  assert.equal(r.questoes[0].notaSugerida, 2);
  assert.equal(r.questoes[0].metodo, "alternativo");
  assert.equal(r.questoes[0].primeiroPassoErrado, null);
  return r;
});
await caso("analise-dados-insuficientes", async () => {
  const r = await analisarProva({ ...base, texto: "1. Um retângulo tem área de 12 cm². Determine seu perímetro." });
  assert.equal(r.questoes.length, 1);
  assert.equal(r.questoes[0].existenciaResposta.status, "ambigua");
  assert.ok(r.questoes[0].problemasEnunciado.length > 0);
  return r;
});

await caso("correcao-raiz-estranha", async () => {
  const a: AnaliseProva = { ...analise, questoes: [{ ...analise.questoes[0], enunciado: "Resolva sqrt(x+2)=x nos reais.", resolucao: { passos: ["Elevar ao quadrado: x+2=x²", "Fatorar: (x-2)(x+1)=0", "Verificar na equação original: somente x=2 é válido"], respostaFinal: "x=2" } }] };
  const b: Barema = { questoes: [{ numero: 1, valorTotal: 3, criterios: [{ id: "q1-c1", descricao: "Obtém x+2=x² elevando ao quadrado.", pontos: 1 }, { id: "q1-c2", descricao: "Encontra os candidatos x=2 e x=-1 por fatoração ou fórmula.", pontos: 1 }, { id: "q1-c3", descricao: "Verifica os candidatos na equação original e conclui somente x=2, rejeitando x=-1.", pontos: 1 }] }] };
  const r = await corrigirAluno({ ...base, analise: a, barema: b, resposta: "Avalie respostasTexto.", respostasTexto: [{ numero: 1, texto: "x+2=x²; (x-2)(x+1)=0; a solução é x=2 ou x=-1." }] });
  assert.equal(r.questoes[0].notaSugerida, 2);
  assert.deepEqual([...r.questoes[0].criteriosAtendidos].sort(), ["q1-c1", "q1-c2"]);
  assert.notEqual(r.questoes[0].primeiroPassoErrado, null);
  return r;
});
await caso("correcao-erro-propagado-sem-dupla-penalizacao", async () => {
  const a: AnaliseProva = { ...analise, questoes: [{ ...analise.questoes[0], enunciado: "Resolva 2x+3=7.", resolucao: { passos: ["2x=4", "x=2"], respostaFinal: "x=2" } }] };
  const b: Barema = { questoes: [{ numero: 1, valorTotal: 2, criterios: [{ id: "q1-c1", descricao: "Isola corretamente 2x=4.", pontos: 1 }, { id: "q1-c2", descricao: "Divide ambos os membros por 2 corretamente a partir da equação que escreveu, mesmo com erro numérico anterior; não penalizar novamente o erro propagado.", pontos: 1 }] }] };
  const r = await corrigirAluno({ ...base, analise: a, barema: b, resposta: "Avalie respostasTexto.", respostasTexto: [{ numero: 1, texto: "2x=10; dividindo por 2: x=5." }] });
  const q = r.questoes[0];
  assert.equal(q.notaSugerida, 1);
  assert.deepEqual(q.criteriosAtendidos, ["q1-c2"]);
  assert.equal(q.primeiroPassoErrado, 1);
  assert.equal(q.passos.at(-1)?.correto, true);
  return r;
});

mkdirSync("docs", { recursive: true });
const sufixo = modelo.startsWith("Qwen/Qwen2.5-") ? "" : `-${modelo.replace(/[^a-zA-Z0-9.-]/g, "-")}`;
const caminho = `docs/avaliacao-prompts${sufixo}${filtros.length ? "-complemento" : ""}.json`;
writeFileSync(caminho, JSON.stringify({ modelo, dados: "sintéticos; execução única por caso, sem estimativa de acurácia", maxTokensSaida: maxTokens, limiteCustoInformadoUSD: orcamento, chamadas, custoInformadoUSD: custo, resultados }, null, 2));
console.log(`Total: ${selecionados - falhas}/${selecionados} casos aprovados; custo informado US$ ${custo.toFixed(8)}`);
if (falhas) process.exitCode = 1;
