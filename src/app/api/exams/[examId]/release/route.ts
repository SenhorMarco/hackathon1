import { account, professorRoute } from '@/lib/auth/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';
import { reviewIssues } from '@/lib/review';
import { feedbackReviewed, reviewRevision, validFeedback } from '@/lib/review-revision';
import { releaseSnapshot } from '@/lib/release-snapshot';

/** Libera as devolutivas: só quando todas as respostas têm nota aprovada e todo aluno tem devolutiva. */
async function handlePOST(_request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova) return apiError('Prova não encontrada.', 404);
    const { data: submissoes, error } = await db().from('submissoes').select('id, aluno_id, status, arquivo_paths').eq('prova_id', examId);
    if (error) throw error;
    if (!submissoes?.length) return apiError('Nenhuma prova de aluno confirmada.', 409);
    if (submissoes.some(s => s.status !== 'corrigida')) return apiError('Há provas de alunos ainda sem correção.', 409);
    const ids = submissoes.map(s => s.id);
    const { data: respostas, error: pError } = await db().from('respostas').select('id,prova_id,submissao_id,numero,nota_final,comentario_final,correcao').in('submissao_id', ids);
    if (pError) throw pError;
    const pendencias = reviewIssues(prova.barema, submissoes, respostas || []);
    if (pendencias.length) return apiError(pendencias.join(' '), 409);
    const { data: feedbacks, error: fError } = await db().from('feedbacks').select('id,submissao_id,conteudo').in('submissao_id', ids);
    if (fError) throw fError;
    if (ids.some(id => !feedbacks?.some(f => f.submissao_id === id))) return apiError('Gere a devolutiva de todos os alunos antes de liberar.', 409);
    for (const submission of submissoes) {
      const feedback = feedbacks!.find(f => f.submissao_id === submission.id)!;
      const revision = reviewRevision(prova, submission, respostas || []);
      if (!validFeedback(feedback.conteudo, prova.barema) || !feedbackReviewed(feedback.conteudo, revision)) return apiError('Revise e aprove o texto atualizado da devolutiva de cada aluno antes de liberar.', 409);
    }

    const user = await account();
    if (!user) return apiError('Entre na sua conta.', 401);
    const { data, error: publicationError } = await db().rpc('publicar_prova', {
      p_prova: examId, p_professor: user.id, p_snapshot: releaseSnapshot(prova, submissoes, respostas || [], feedbacks || []),
    });
    if (publicationError) {
      if (['PGRST202', '42883'].includes(publicationError.code)) return apiError('A publicação precisa da atualização do banco: supabase/publicacao.sql.', 503);
      if (publicationError.code === 'P0002') return apiError('Prova não encontrada.', 404);
      throw publicationError;
    }
    return Response.json(data, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const POST = professorRoute(handlePOST);
