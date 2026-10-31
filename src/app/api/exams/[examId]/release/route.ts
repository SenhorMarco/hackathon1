import { professorRoute } from '@/lib/auth/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';

/** Libera as devolutivas: só quando todas as respostas têm nota aprovada e todo aluno tem devolutiva. */
async function handlePOST(_request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova) return apiError('Prova não encontrada.', 404);
    const { data: submissoes, error } = await db().from('submissoes').select('id, aluno_id, status').eq('prova_id', examId).not('aluno_id', 'is', null);
    if (error) throw error;
    if (!submissoes?.length) return apiError('Nenhuma prova de aluno confirmada.', 409);
    if (submissoes.some(s => s.status !== 'corrigida')) return apiError('Há provas de alunos ainda sem correção.', 409);
    const ids = submissoes.map(s => s.id);
    const { count: pendentes, error: pError } = await db().from('respostas').select('id', { count: 'exact' }).in('submissao_id', ids).is('nota_final', null).limit(1);
    if (pError) throw pError;
    if (pendentes) return apiError('Aprove as notas de todos os grupos antes de liberar.', 409);
    const { data: feedbacks, error: fError } = await db().from('feedbacks').select('submissao_id').in('submissao_id', ids);
    if (fError) throw fError;
    if ((feedbacks?.length ?? 0) < ids.length) return apiError('Gere a devolutiva de todos os alunos antes de liberar.', 409);

    const { error: pubError } = await db().from('feedbacks').update({ publicado: true }).in('submissao_id', ids);
    if (pubError) throw pubError;
    const { error: provaError } = await db().from('provas').update({ status: 'corrigida' }).eq('id', examId);
    if (provaError) throw provaError;
    return Response.json({ liberadas: ids.length }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const POST = professorRoute(handlePOST);
