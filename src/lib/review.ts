import type { Barema } from './ai/schemas';
import type { Resposta, Submissao } from './db/types';

export type ReviewAnswer = Pick<Resposta, 'submissao_id' | 'numero' | 'nota_final' | 'comentario_final'> & { correcao?: unknown };
export type ReviewSubmission = Pick<Submissao, 'id' | 'aluno_id' | 'status'>;

/** Só uma decisão humana explícita pode retirar uma leitura técnica da revisão. */
export function isResolvedReading(answer: { numero: number; correcao?: unknown }): boolean {
  if (answer.numero > 0 || !answer.correcao || typeof answer.correcao !== 'object') return false;
  const resolution = (answer.correcao as Record<string, unknown>).resolucaoLeitura;
  if (!resolution || typeof resolution !== 'object') return false;
  const r = resolution as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return r.acao === 'desconsiderar' && ['duplicada', 'fora_da_prova'].includes(String(r.tipo)) &&
    typeof r.motivo === 'string' && !!r.motivo.trim() && typeof r.professorId === 'string' && uuid.test(r.professorId) &&
    typeof r.em === 'string' && Number.isFinite(Date.parse(r.em)) && typeof r.revisaoAnterior === 'string' && /^[a-f0-9]{64}$/.test(r.revisaoAnterior) &&
    (r.tipo !== 'duplicada' || (typeof r.duplicadaDe === 'string' && uuid.test(r.duplicadaDe)));
}

/** Completeness is checked against the rubric, never just the answers that exist. */
export function reviewIssues(barema: Barema | null, submissions: ReviewSubmission[], answers: ReviewAnswer[]): string[] {
  if (!barema?.questoes.length) return ['Confirme o barema antes de validar a prova.'];
  if (!submissions.length) return ['Nenhuma prova de aluno recebida.'];
  const issues: string[] = [];
  for (const submission of submissions) {
    if (!submission.aluno_id) issues.push('Há prova sem aluno confirmado.');
    if (submission.status !== 'corrigida') issues.push('Há prova ainda sem pré-correção concluída.');
    const rows = answers.filter(answer => answer.submissao_id === submission.id && !isResolvedReading(answer));
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
  if (answer?.correcao && typeof answer.correcao === 'object' && (answer.correcao as { legivel?: boolean }).legivel === false) return false;
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
