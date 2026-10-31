import { createHash } from 'node:crypto';
import { FeedbackAluno, type Barema } from './ai/schemas';
import type { ReviewAnswer, ReviewSubmission } from './review';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function contentRevision(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');
}

/** Identifica os dados exatos usados para escrever e revisar uma devolutiva. */
export function reviewRevision(prova: { barema: unknown; analise: unknown }, submission: ReviewSubmission & { arquivo_paths?: string[] }, answers: (ReviewAnswer & { correcao?: unknown })[]): string {
  const source = { barema: prova.barema, analise: prova.analise, aluno: submission.aluno_id, arquivos: submission.arquivo_paths ?? [],
    respostas: answers.filter(answer => answer.submissao_id === submission.id).map(answer => ({ numero: answer.numero, nota: answer.nota_final, comentario: answer.comentario_final, correcao: answer.correcao })).sort((a, b) => a.numero - b.numero) };
  return contentRevision(source);
}

export function validFeedback(content: unknown, rubric: Barema): boolean {
  const parsed = FeedbackAluno.safeParse(content);
  if (!parsed.success || !parsed.data.resumo.trim()) return false;
  const expected = new Set(rubric.questoes.map(q => q.numero));
  return parsed.data.questoes.length === expected.size && parsed.data.questoes.every(q => expected.delete(q.numero)) && expected.size === 0;
}

export function feedbackReviewed(content: unknown, revision: string): boolean {
  if (!content || typeof content !== 'object') return false;
  const metadata = content as Record<string, unknown>;
  return metadata.__revisao === revision && typeof metadata.__aprovadoEm === 'string' && Number.isFinite(Date.parse(metadata.__aprovadoEm));
}
