import type { Barema } from './ai/schemas';
import type { Resposta, Submissao } from './db/types';

export type ReviewAnswer = Pick<Resposta, 'submissao_id' | 'numero' | 'nota_final' | 'comentario_final'>;
export type ReviewSubmission = Pick<Submissao, 'id' | 'aluno_id' | 'status'>;

/** Completeness is checked against the rubric, never just the answers that exist. */
export function reviewIssues(barema: Barema | null, submissions: ReviewSubmission[], answers: ReviewAnswer[]): string[] {
  if (!barema?.questoes.length) return ['Confirme o barema antes de validar a prova.'];
  if (!submissions.length) return ['Nenhuma prova de aluno recebida.'];
  const issues: string[] = [];
  for (const submission of submissions) {
    if (!submission.aluno_id) issues.push('Há prova sem aluno confirmado.');
    if (submission.status !== 'corrigida') issues.push('Há prova ainda sem pré-correção concluída.');
    const rows = answers.filter(answer => answer.submissao_id === submission.id);
    if (rows.some(row => !barema.questoes.some(q => q.numero === row.numero))) issues.push('Há resposta sem associação a uma questão do barema.');
    for (const question of barema.questoes) {
      const matches = rows.filter(answer => answer.numero === question.numero);
      if (matches.length !== 1) {
        issues.push(`Q${question.numero}: resposta ausente ou duplicada. Confira o arquivo e a associação.`);
        continue;
      }
      if (!isValidated(matches[0], question.valorTotal)) issues.push(`Q${question.numero}: revise a nota e o feedback de cada resposta.`);
    }
  }
  return [...new Set(issues)];
}

export function isValidated(answer: ReviewAnswer | undefined, maximum: number): boolean {
  return !!answer && answer.nota_final !== null && Number.isFinite(Number(answer.nota_final)) &&
    Number(answer.nota_final) >= 0 && Number(answer.nota_final) <= maximum && !!answer.comentario_final?.trim();
}

export function finalTotal(barema: Barema | null, submission: ReviewSubmission, answers: ReviewAnswer[]): number | null {
  if (reviewIssues(barema, [submission], answers).length) return null;
  return barema!.questoes.reduce((total, question) => total + Number(answers.find(answer => answer.submissao_id === submission.id && answer.numero === question.numero)!.nota_final), 0);
}

export function csvCell(value: string | number): string {
  const text = String(value);
  return '"' + (/^[=+@\-\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
}
