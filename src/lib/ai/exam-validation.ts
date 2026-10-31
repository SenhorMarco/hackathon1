import type { AnaliseProva, Barema } from './schemas';
export function validateExam(analise: AnaliseProva, barema: Barema): string | null {
  if (analise.questoes.some(q => !q.enunciado.trim())) return 'Preencha o enunciado de cada questão.';
  const numbers = analise.questoes.map(q => q.numero);
  if (!numbers.length || numbers.some(n => !Number.isInteger(n) || n < 1) || new Set(numbers).size !== numbers.length) return 'A análise deve ter questões com números positivos e únicos.';
  if (barema.questoes.length !== numbers.length || new Set(barema.questoes.map(q => q.numero)).size !== numbers.length) return 'O barema deve cobrir todas as questões uma única vez.';
  for (const q of barema.questoes) {
    if (!numbers.includes(q.numero) || !q.criterios.length || !Number.isFinite(q.valorTotal) || q.valorTotal <= 0 || q.valorTotal > 1000) return 'Questão ou pontuação do barema inválida.';
    if (q.criterios.some(c => !c.id.trim() || !c.descricao.trim() || !Number.isFinite(c.pontos) || c.pontos < 0) || new Set(q.criterios.map(c => c.id)).size !== q.criterios.length) return 'Preencha critérios únicos, com descrição e pontos não negativos.';
    if (Math.abs(q.criterios.reduce((sum,c) => sum + c.pontos, 0) - q.valorTotal) > 0.00001) return 'A soma dos critérios deve corresponder ao total da questão.';
  }
  return null;
}
