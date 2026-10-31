import { professorRoute } from '@/lib/auth/server';
import { z } from 'zod';
import { AnaliseProva, Barema } from '@/lib/ai/schemas';
import { validateExam } from '@/lib/ai/exam-validation';
import { db } from '@/lib/db/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { revisionFor, serializeProva } from '@/lib/db/exams';
const Input = z.object({ analise: AnaliseProva, barema: Barema, revisao: z.string().length(64) });
async function handlePUT(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Análise ou barema inválido.', 400);
  const { analise, barema, revisao } = parsed.data;
  const invalid = validateExam(analise, barema);
  if (invalid) return apiError(invalid, 400);
  try {
    const prova = await findProva(examId);
    if (!prova?.analise || !prova.barema) return apiError('Analise a prova antes de confirmar o barema.', 409);
    if (revisionFor(prova) !== revisao) return apiError('A prova mudou no servidor. Recarregue a versão salva antes de editar novamente.', 409);
    if (!['rascunho', 'analisada', 'barema_pronto'].includes(prova.status)) return apiError('A prova já está em correção. O barema não pode ser alterado nesta etapa.', 409);
    if (JSON.stringify(analise.questoes.map(q => q.numero).sort((a,b)=>a-b)) !== JSON.stringify(prova.analise.questoes.map((q: {numero: number}) => q.numero).sort((a: number,b: number)=>a-b))) return apiError('Não é permitido remover ou renumerar questões nesta etapa.', 400);
    const { data, error } = await db().from('provas').update({ analise, barema, status: 'barema_pronto' }).eq('id', examId).eq('status', prova.status).eq('analise', JSON.stringify(prova.analise)).eq('barema', JSON.stringify(prova.barema)).select('*').maybeSingle();
    if (error) throw error;
    if (!data) return apiError('A prova mudou durante a gravação. Recarregue antes de tentar novamente.', 409);
    return Response.json({ prova: serializeProva(data) }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const PUT = professorRoute(handlePUT);
