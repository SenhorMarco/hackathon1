import { db } from '@/lib/db/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { findSubmission } from '@/lib/db/submissions';
export async function PATCH(request: Request, context: { params: Promise<{ examId: string; submissionId: string }> }) {
  const { examId, submissionId } = await context.params;
  const body = await request.json().catch(() => null);
  if (![examId, submissionId, body?.aluno_id].every(id => uuid.safeParse(id).success)) return apiError('Prova, submissão ou aluno inválido.', 400);
  try {
    const prova = await findProva(examId);
    const submission = await findSubmission(examId, submissionId);
    if (!prova || !submission) return apiError('Submissão não encontrada.', 404);
    const { data: aluno, error: alunoError } = await db().from('alunos').select('id').eq('id', body.aluno_id).eq('turma_id', prova.turma_id).maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno) return apiError('O aluno não pertence à turma da prova.', 400);
    const { data, error } = await db().from('submissoes').update({ aluno_id: aluno.id }).eq('id', submissionId).eq('prova_id', examId).select('*').single();
    if (error) throw error;
    return Response.json({ submissao: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}
