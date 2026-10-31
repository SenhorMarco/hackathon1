import type { Barema, CorrecaoAluno } from './ai/schemas';

/** Preserva inclusive leituras sem número e duplicadas para associação humana. */
export function correctionRows(correction: CorrecaoAluno, rubric: Barema, examId: string, submissionId: string) {
  const expected = new Set(rubric.questoes.map(question => question.numero));
  const used = new Set<number>();
  return correction.questoes.map((question, index) => {
    const identified = expected.has(question.numero) && !used.has(question.numero);
    if (identified) used.add(question.numero);
    return {
      prova_id: examId, submissao_id: submissionId,
      // Chave técnica negativa: não é apresentada como número de questão.
      numero: identified ? question.numero : -(index + 1),
      correcao: question, grupo_id: null, nota_final: null, comentario_final: null,
    };
  });
}
