import type { Prova } from './db/types';
import type { Exam, Question } from './data';
import type { ReviewAnswer, ReviewSubmission } from './review';
import { isResolvedReading, reviewIssues } from './review';
export type ProvaComResultados = Prova & { respostasValidadas?: Exam['responses'] };

/** O painel usa somente provas individuais completas, como o relatório de revisão. */
export function responsesFromReview(prova: Prova, submissions: ReviewSubmission[], answers: ReviewAnswer[], students: { id: string; referencia_local: string | null }[]): Exam['responses'] {
  const responses: Exam['responses'] = {};
  for (const submission of submissions) {
    const student = students.find(s => s.id === submission.aluno_id);
    if (!student || submissions.filter(s => s.aluno_id === student.id).length !== 1) continue;
    const rows = answers.filter(r => r.submissao_id === submission.id && !isResolvedReading(r));
    if (reviewIssues(prova.barema, [submission], rows).length) continue;
    for (const row of rows) responses[`${student.referencia_local || student.id}:q${row.numero}`] = {
      file: '', score: Number(row.nota_final), feedback: row.comentario_final!, approved: true, alternative: false,
    };
  }
  return responses;
}
const difficulty: Record<string, Question['difficulty']> = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' };
export function examFromProva(prova: ProvaComResultados): Exam {
  return { id: prova.id, title: prova.titulo, date: prova.data_avaliacao || prova.created_at.slice(0,10), file: prova.arquivo_nome || 'Prova', persisted: true,
    revision: prova.revisao, analysis: prova.analise || undefined,
    status: prova.status === 'barema_pronto' ? 'Aguardando respostas' : prova.status === 'corrigida' ? 'Concluída' : prova.status === 'corrigindo' ? 'Em correção' : 'Rascunho',
    questions: (prova.analise?.questoes || []).map(q => ({ id: `q${q.numero}`, number: q.numero, topic: q.conteudo, text: q.enunciado, answer: q.resolucao.respostaFinal,
      difficulty: difficulty[q.dificuldadeEstimada], criteria: (prova.barema?.questoes.find(b => b.numero === q.numero)?.criterios || []).map(c => ({ id: c.id, text: c.descricao, points: c.pontos })) })),
    responses: prova.respostasValidadas || {}, released: prova.status === 'corrigida' };
}
