// Dois testes sintéticos pagos, no máximo duas chamadas de até 800 tokens de saída.
// Uso: npx tsx scripts/testar-prompts-texto.mts
import assert from "node:assert/strict";
import OpenAI from "openai";
import { gerarBarema } from "../src/lib/ai/barema";
import { corrigirAluno } from "../src/lib/ai/correcao";
import type { AnaliseProva, Barema } from "../src/lib/ai/schemas";

process.loadEnvFile(".env.local");
const cliente = new OpenAI({ apiKey: process.env.FEATHERLESS_API_KEY, baseURL: "https://api.featherless.ai/v1", maxRetries: 0, timeout: 90_000 });
const criar = cliente.chat.completions.create.bind(cliente.chat.completions);
let chamadas = 0;
let custo = 0;
// Impede que uma repetição estrutural de gerarJson amplie o orçamento deste teste.
cliente.chat.completions.create = (async (...args: Parameters<typeof criar>) => {
  if (++chamadas > 2) throw new Error("Limite global de duas chamadas atingido");
  const resultado = await criar(...args);
  if (!("choices" in resultado)) throw new Error("Streaming não é usado neste teste");
  const uso = resultado.usage as (typeof resultado.usage & { cost?: number });
  custo += uso?.cost ?? 0;
  console.log("Uso:", JSON.stringify(uso));
  return resultado;
}) as typeof cliente.chat.completions.create;

const analise: AnaliseProva = { questoes: [{ numero: 1, enunciado: "Resolva 3x+2=14.", conteudo: "equação do primeiro grau", resolucao: { passos: ["3x=12", "x=4"], respostaFinal: "x=4" }, existenciaResposta: { status: "unica", observacao: "Uma equação linear com coeficiente não nulo." }, problemasEnunciado: [], dificuldadeEstimada: "facil", justificativaDificuldade: "Duas operações elementares." }], observacoesGerais: "Prova sintética." };
const barema: Barema = { questoes: [{ numero: 1, valorTotal: 2, criterios: [{ id: "q1-c1", descricao: "Isola 3x=12 corretamente.", pontos: 1 }, { id: "q1-c2", descricao: "Encontra x=4 corretamente.", pontos: 1 }] }] };
const modelo = "Qwen/Qwen2.5-3B-Instruct";
for (const etapa of ["barema", "correcao"]) {
  try {
    if (etapa === "barema") {
      const resultado = await gerarBarema({ cliente, modelo, analise, baremaProfessor: barema, maxTokens: 800 });
      console.log("Barema:", JSON.stringify(resultado));
      assert.equal(resultado.problemas.length, 0, "Não deveria apontar falha no barema coerente");
    } else {
      const respostasTexto = [{ numero: 1, texto: "3x=12, portanto x=12." }];
      const resultado = await corrigirAluno({ cliente, modelo, analise, barema, resposta: "Avalie o texto fornecido em respostasTexto.", respostasTexto, maxTokens: 800 });
      console.log("Correção:", JSON.stringify(resultado));
      const q = resultado.questoes[0];
      assert.equal(q.notaSugerida, 1);
      assert.deepEqual(q.criteriosAtendidos, ["q1-c1"]);
      assert.equal(q.passos[0].correto, true);
      assert.equal(q.primeiroPassoErrado, 2);
      assert.equal(q.metodo, "padrao");
    }
    console.log(`${etapa}: caso aprovado`);
  } catch (erro) {
    // Evita imprimir objetos da SDK que possam conter detalhes da requisição.
    console.log(`${etapa}: falhou (${erro instanceof Error ? erro.name : "erro desconhecido"})`);
    if (erro instanceof Error && ["ErroRevisaoIA", "AssertionError"].includes(erro.name)) console.log(erro.message);
    process.exitCode = 1;
  }
}
console.log(`Custo informado pela API: US$ ${custo.toFixed(8)}`);
