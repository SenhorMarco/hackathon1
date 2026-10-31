import { professorRoute } from '@/lib/auth/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';

/** Tudo o que a tela de correção precisa: submissões, respostas, grupos, alunos e devolutivas. */
async function handleGET(_request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova) return apiError('Prova não encontrada.', 404);
    const [submissoes, respostas, grupos, alunos] = await Promise.all([
      db().from('submissoes').select('id, aluno_id, status, erro, nome_lido, arquivo_paths, arquivo_nomes').eq('prova_id', examId).order('created_at'),
      db().from('respostas').select('*').eq('prova_id', examId).order('numero'),
      db().from('grupos').select('*').eq('prova_id', examId).order('numero').order('created_at'),
      prova.turma_id ? db().from('alunos').select('id, nome').eq('turma_id', prova.turma_id) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const r of [submissoes, respostas, grupos, alunos]) if (r.error) throw r.error;
    const ids = (submissoes.data || []).map(s => s.id);
    const feedbacks = ids.length ? await db().from('feedbacks').select('submissao_id, token, publicado').in('submissao_id', ids) : { data: [], error: null };
    if (feedbacks.error) throw feedbacks.error;
    return Response.json({
      status: prova.status, barema: prova.barema, analise: prova.analise,
      submissoes: submissoes.data, respostas: respostas.data, grupos: grupos.data, alunos: alunos.data, feedbacks: feedbacks.data,
    }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const GET = professorRoute(handleGET);
