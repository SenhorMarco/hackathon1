import { z } from 'zod';
import { professorRoute } from '@/lib/auth/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';
import { findSubmission } from '@/lib/db/submissions';
import type { BaremaQuestao } from '@/lib/ai/schemas';

const Input = z.object({ numero: z.number().int().positive(), transcricao: z.string().trim().min(1).max(20000), arquivoConferido: z.literal(true) });
async function handlePOST(request: Request, context: { params: Promise<{ examId: string; submissionId: string }> }) {
  const { examId, submissionId } = await context.params;
  if (![examId, submissionId].every(id => uuid.safeParse(id).success)) return apiError('Submissão inválida.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Selecione a questão, registre a transcrição e confirme a conferência do arquivo.', 400);
  try {
    const [prova, submission] = await Promise.all([findProva(examId), findSubmission(examId, submissionId)]);
    if (!prova?.barema || !submission) return apiError('Prova ou submissão não encontrada.', 404);
    if (prova.status === 'corrigida') return apiError('A prova já foi liberada.', 409);
    if (!submission.aluno_id) return apiError('Confirme o aluno antes de registrar a resposta.', 409);
    if (!prova.barema.questoes.some((q: BaremaQuestao) => q.numero === parsed.data.numero)) return apiError('Questão fora do barema.', 400);
    const { data: existing, error: existingError } = await db().from('respostas').select('numero').eq('submissao_id', submissionId);
    if (existingError) throw existingError;
    if (existing?.some(r => r.numero === parsed.data.numero)) return apiError('A questão já tem uma resposta. Revise a resposta existente.', 409);
    if (existing?.some(r => r.numero < 1)) return apiError('Resolva as pendências de associação desta prova antes de registrar outra resposta.', 409);
    const { error: feedbackError } = await db().from('feedbacks').delete().eq('submissao_id', submissionId);
    if (feedbackError) throw feedbackError;
    const { data, error } = await db().from('respostas').insert({ prova_id: examId, submissao_id: submissionId, numero: parsed.data.numero,
      nota_final: null, comentario_final: null, grupo_id: null,
      correcao: { numero: parsed.data.numero, transcricao: parsed.data.transcricao, legivel: true, passos: [], metodo: 'padrao',
        descricaoMetodo: 'Resposta registrada pelo professor a partir do arquivo original.', tipoErro: 'nenhum', primeiroPassoErrado: null,
        criteriosAtendidos: [], notaSugerida: 0, justificativa: '', origem: 'professor' },
    }).select('*').single();
    if (error?.code === '23505') return apiError('A resposta foi registrada em outra revisão. Recarregue.', 409);
    if (error) throw error;
    const numbers = new Set([...(existing || []).map(r => r.numero), parsed.data.numero]);
    if (prova.barema.questoes.every((q: BaremaQuestao) => numbers.has(q.numero))) {
      const { error: statusError } = await db().from('submissoes').update({ status: 'corrigida', erro: null }).eq('id', submissionId);
      if (statusError) throw statusError;
    }
    return Response.json({ resposta: data }, { status: 201, headers: privateHeaders });
  } catch (error) { return serverError(error); }
}
export const POST = professorRoute(handlePOST);
