import { z } from 'zod';
import { professorRoute } from '@/lib/auth/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';
import type { BaremaQuestao } from '@/lib/ai/schemas';

const Input = z.object({ numero: z.number().int().positive() });
async function handlePOST(request: Request, context: { params: Promise<{ examId: string; answerId: string }> }) {
  const { examId, answerId } = await context.params;
  if (![examId, answerId].every(id => uuid.safeParse(id).success)) return apiError('Resposta inválida.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Selecione uma questão do barema.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova?.barema) return apiError('Prova não encontrada.', 404);
    if (prova.status === 'corrigida') return apiError('A prova já foi liberada.', 409);
    if (!prova.barema.questoes.some((q: BaremaQuestao) => q.numero === parsed.data.numero)) return apiError('Questão fora do barema.', 400);
    const { data: answer, error } = await db().from('respostas').select('*').eq('prova_id', examId).eq('id', answerId).maybeSingle();
    if (error) throw error;
    if (!answer) return apiError('Resposta não encontrada.', 404);
    if (answer.numero > 0) return apiError('Esta resposta já está associada. Recarregue a revisão.', 409);
    const { data: existing, error: existingError } = await db().from('respostas').select('id').eq('submissao_id', answer.submissao_id).eq('numero', parsed.data.numero).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return apiError('Este aluno já tem resposta nesta questão. Nenhuma resposta foi substituída.', 409);
    const { error: feedbackError } = await db().from('feedbacks').delete().eq('submissao_id', answer.submissao_id);
    if (feedbackError) throw feedbackError;
    const { data, error: updateError } = await db().from('respostas').update({
      numero: parsed.data.numero, grupo_id: null, nota_final: null, comentario_final: null,
      // Pontuação referente a uma questão incerta não pode ser reaproveitada.
      correcao: { ...answer.correcao, numero: parsed.data.numero, notaSugerida: 0, criteriosAtendidos: [], legivel: false,
        justificativa: 'Questão associada manualmente. Confira o arquivo e avalie a nota e o feedback pelo barema desta questão.',
        associacaoOriginal: answer.correcao.numero },
    }).eq('id', answerId).eq('numero', answer.numero).select('*').maybeSingle();
    if (updateError?.code === '23505') return apiError('A questão foi associada em outra revisão. Recarregue.', 409);
    if (updateError) throw updateError;
    if (!data) return apiError('A associação mudou. Recarregue antes de tentar novamente.', 409);
    return Response.json({ resposta: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}
export const POST = professorRoute(handlePOST);
