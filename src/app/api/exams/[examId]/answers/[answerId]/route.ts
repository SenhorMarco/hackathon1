import { professorRoute } from '@/lib/auth/server';
import { z } from 'zod';
import type { BaremaQuestao } from '@/lib/ai/schemas';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';

const Input = z.object({ nota: z.number().min(0), comentario: z.string().max(2000) });

/** Ajuste explícito do professor em uma resposta, diferente do resto do grupo. */
async function handlePATCH(request: Request, context: { params: Promise<{ examId: string; answerId: string }> }) {
  const { examId, answerId } = await context.params;
  if (![examId, answerId].every(id => uuid.safeParse(id).success)) return apiError('Resposta inválida.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Informe nota e comentário válidos.', 400);
  const { nota, comentario } = parsed.data;
  try {
    const prova = await findProva(examId);
    if (!prova?.barema) return apiError('Prova não encontrada.', 404);
    if (prova.status === 'corrigida') return apiError('As correções desta prova já foram liberadas.', 409);
    const { data: resposta, error } = await db().from('respostas').select('id, numero').eq('id', answerId).eq('prova_id', examId).maybeSingle();
    if (error) throw error;
    if (!resposta) return apiError('Resposta não encontrada.', 404);
    const valor = prova.barema.questoes.find((q: BaremaQuestao) => q.numero === resposta.numero)?.valorTotal ?? 0;
    if (nota > valor) return apiError(`A nota máxima desta questão é ${valor}.`, 400);
    const { data, error: uError } = await db().from('respostas').update({ nota_final: nota, comentario_final: comentario }).eq('id', answerId).select('*').single();
    if (uError) throw uError;
    return Response.json({ resposta: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const PATCH = professorRoute(handlePATCH);
