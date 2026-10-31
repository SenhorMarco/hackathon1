import { z } from 'zod';
import { db } from '@/lib/db/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
const roster = z.array(z.object({ referencia_local: z.string().min(1).max(100), nome: z.string().trim().min(1).max(150) })).max(200);
export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  const parsed = roster.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new Set(parsed.data.map(s => s.referencia_local)).size !== parsed.data.length) return apiError('Lista de alunos inválida.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova?.turma_id) return apiError('Prova ou turma não encontrada.', 404);
    if (parsed.data.length) {
      const { error } = await db().from('alunos').upsert(parsed.data.map(s => ({ ...s, turma_id: prova.turma_id })), { onConflict: 'turma_id,referencia_local' });
      if (error) throw error;
    }
    const { data, error } = await db().from('alunos').select('*').eq('turma_id', prova.turma_id).order('nome');
    if (error) throw error;
    return Response.json({ alunos: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}
