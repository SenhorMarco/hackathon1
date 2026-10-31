// Testes locais de regressão, sem chamadas à API: npx tsx scripts/check-validacao-ia.ts
import assert from "node:assert/strict";
import { validarBarema, validarCorrecao } from "../src/lib/ai/validacao";
import type { Barema, CorrecaoAluno } from "../src/lib/ai/schemas";

const barema: Barema = { questoes: [{ numero: 1, valorTotal: 2, criterios: [
  { id: "q1-c1", descricao: "Isolar 2x=4", pontos: 1 },
  { id: "q1-c2", descricao: "Obter x=2", pontos: 1 },
] }] };
const original = [{ numero: 1, texto: "2x=4, portanto x=4." }];
const valida: CorrecaoAluno = { nomeLido: null, questoes: [{
  numero: 1, transcricao: original[0].texto, legivel: true,
  passos: [
    { descricao: "2x=4", correto: true, comentario: "Isolamento correto." },
    { descricao: "x=4", correto: false, comentario: "Faltou dividir por 2." },
  ],
  metodo: "padrao", descricaoMetodo: "Isolamento da incógnita.", tipoErro: "calculo",
  primeiroPassoErrado: 2, criteriosAtendidos: ["q1-c1"], notaSugerida: 1,
  justificativa: "Atende apenas ao primeiro critério.",
}] };
assert.deepEqual(validarBarema(barema), []);
assert.deepEqual(validarCorrecao(valida, barema, original), []);

const rejeita = (nome: string, alterar: (r: CorrecaoAluno) => void) => {
  const r = structuredClone(valida);
  alterar(r);
  assert.ok(validarCorrecao(r, barema, original).length > 0, nome);
  console.log(`Bloqueado: ${nome}`);
};
rejeita("transcrição trocada pela solução de referência", r => { r.questoes[0].transcricao = "2x=4, portanto x=2."; });
rejeita("leitura insuficiente", r => { r.questoes[0].legivel = false; });
rejeita("nota maior que os critérios atendidos", r => { r.questoes[0].notaSugerida = 2; });
rejeita("critério inexistente", r => { r.questoes[0].criteriosAtendidos = ["inventado"]; });
rejeita("critério duplicado", r => { r.questoes[0].criteriosAtendidos = ["q1-c1", "q1-c1"]; });
rejeita("primeiro passo errado contraditório", r => { r.questoes[0].passos[0].correto = false; });
rejeita("tipoErro nenhum com passo incorreto", r => { r.questoes[0].tipoErro = "nenhum"; });
rejeita("questão omitida", r => { r.questoes = []; });
const totalErrado = structuredClone(barema);
totalErrado.questoes[0].valorTotal = 3;
assert.ok(validarBarema(totalErrado).length > 0);
console.log("Bloqueado: total diferente da soma do barema");
console.log("Regressões aprovadas: 1 correção válida aceita e 9 casos inválidos bloqueados.");
