import { createHash } from 'node:crypto';
import { z } from 'zod';
import { professorRoute } from '@/lib/auth/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';

type Context = { params: Promise<{ examId: string }> };
const Input = z.object({ prazo: z.iso.datetime({ offset: true }).nullable(), excecoes: z.record(z.uuid(), z.iso.datetime({ offset: true })), revisao: z.string().length(64) });
const revision = (p: { prazo_envio?: string | null; excecoes_envio?: unknown; status: string }) => createHash('sha256').update(JSON.stringify([p.prazo_envio ?? null, p.excecoes_envio ?? {}, p.status])).digest('hex');
async function state(examId: string) {
  const prova = await findProva(examId);
  if (!prova) return null;
  const { data: alunos, error } = await db().from('alunos').select('id,nome').eq('turma_id', prova.turma_id).order('nome');
  if (error) throw error;
  return { prova, alunos, payload: { prazo: prova.prazo_envio ?? null, excecoes: prova.excecoes_envio ?? {}, alunos, revisao: revision(prova), status: prova.status } };
}
export const GET = professorRoute(async (_request: Request, context: Context) => {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  try {
    const current = await state(examId);
    if (!current) return apiError('Prova não encontrada.', 404);
    if (current.prova.excecoes_envio === undefined) return apiError('A configuração de prazos precisa da atualização do banco (supabase/prazos.sql).', 503);
    return Response.json(current.payload, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
});
export const PUT = professorRoute(async (request: Request, context: Context) => {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Informe datas e horários válidos, com fuso horário.', 400);
  try {
    const current = await state(examId);
    if (!current) return apiError('Prova não encontrada.', 404);
    if (current.prova.excecoes_envio === undefined) return apiError('Atualize o banco com supabase/prazos.sql antes de configurar prazos.', 503);
    if (current.prova.status === 'corrigida') return apiError('A prova já foi publicada. Os envios estão encerrados.', 409);
    if (current.payload.revisao !== parsed.data.revisao) return apiError('Os prazos mudaram. Recarregue antes de salvar.', 409);
    const { prazo, excecoes } = parsed.data;
    for (const [id, date] of Object.entries(excecoes)) {
      if (!current.alunos.some(a => a.id === id)) return apiError('A exceção deve pertencer a um aluno desta turma.', 400);
      // Exceções antigas podem permanecer sem alteração; uma autorização nova precisa estar no futuro.
      if (current.payload.excecoes[id] !== date && Date.parse(date) <= Date.now()) return apiError('A reabertura individual precisa terminar no futuro.', 400);
      if (current.payload.excecoes[id] !== date && (!prazo || Date.parse(date) <= Date.parse(prazo))) return apiError('A exceção deve estender o prazo geral.', 400);
    }
    let query = db().from('provas').update({ prazo_envio: prazo, excecoes_envio: excecoes }).eq('id', examId).eq('status', current.prova.status).eq('excecoes_envio', JSON.stringify(current.prova.excecoes_envio));
    query = current.prova.prazo_envio ? query.eq('prazo_envio', current.prova.prazo_envio) : query.is('prazo_envio', null);
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) return apiError('Os prazos mudaram durante a gravação. Recarregue antes de salvar.', 409);
    return Response.json({ ...current.payload, prazo: data.prazo_envio, excecoes: data.excecoes_envio, revisao: revision(data) }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
});
