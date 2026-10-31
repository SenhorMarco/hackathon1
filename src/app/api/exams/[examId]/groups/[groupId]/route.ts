import { professorRoute } from '@/lib/auth/server';
import { z } from 'zod';
import type { BaremaQuestao } from '@/lib/ai/schemas';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';

const Input = z.object({ nota: z.number().min(0), comentario: z.string().max(2000) });

/** O professor aprova o grupo: a nota e o comentário valem para todas as respostas dele. */
async function handlePATCH(request: Request, context: { params: Promise<{ examId: string; groupId: string }> }) {
  const { examId, groupId } = await context.params;
  if (![examId, groupId].every(id => uuid.safeParse(id).success)) return apiError('Grupo inválido.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Informe nota e comentário válidos.', 400);
  const { nota, comentario } = parsed.data;
  try {
    const prova = await findProva(examId);
    if (!prova?.barema) return apiError('Prova não encontrada.', 404);
    if (prova.status === 'corrigida') return apiError('As correções desta prova já foram liberadas.', 409);
    const { data: grupo, error } = await db().from('grupos').select('id, numero').eq('id', groupId).eq('prova_id', examId).maybeSingle();
    if (error) throw error;
    if (!grupo) return apiError('Grupo não encontrado.', 404);
    const valor = prova.barema.questoes.find((q: BaremaQuestao) => q.numero === grupo.numero)?.valorTotal ?? 0;
    if (nota > valor) return apiError(`A nota máxima desta questão é ${valor}.`, 400);

    const { data: atualizado, error: gError } = await db().from('grupos').update({ aprovado: true, nota_final: nota, comentario_final: comentario }).eq('id', groupId).select('*').single();
    if (gError) throw gError;
    const { error: rError } = await db().from('respostas').update({ nota_final: nota, comentario_final: comentario }).eq('grupo_id', groupId);
    if (rError) throw rError;
    return Response.json({ grupo: atualizado }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const PATCH = professorRoute(handlePATCH);
