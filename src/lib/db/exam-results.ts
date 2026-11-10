import 'server-only';
import { db } from './server';
import type { Prova } from './types';
import { responsesFromReview, type ProvaComResultados } from '../exams';

/** Recebe apenas provas cuja propriedade já foi verificada pelo chamador. */
export async function withExamResults(provas: Prova[]): Promise<ProvaComResultados[]> {
  if (!provas.length) return [];
  const { data: submissions, error } = await db().from('submissoes')
    .select('id,prova_id,aluno_id,status').in('prova_id', provas.map(p => p.id));
  if (error) throw error;
  if (!submissions.length) return provas.map(p => ({ ...p, respostasValidadas: {} }));
  const studentIds = [...new Set(submissions.map(s => s.aluno_id).filter(Boolean))];
  const [answers, students] = await Promise.all([
    db().from('respostas').select('submissao_id,numero,nota_final,comentario_final,correcao').in('submissao_id', submissions.map(s => s.id)),
    studentIds.length ? db().from('alunos').select('id,referencia_local').in('id', studentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (answers.error || students.error) throw answers.error || students.error;
  return provas.map(p => ({ ...p, respostasValidadas: responsesFromReview(p, submissions.filter(s => s.prova_id === p.id), answers.data, students.data || []) }));
}
