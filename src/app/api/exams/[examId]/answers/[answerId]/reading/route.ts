import { z } from 'zod';
import { account, professorRoute } from '@/lib/auth/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';
import { isResolvedReading } from '@/lib/review';
import { readingRevision } from '@/lib/review-revision';
import type { RegistroLeitura, Resposta } from '@/lib/db/types';

const Input = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('desconsiderar'), tipo: z.enum(['duplicada', 'fora_da_prova']),
    motivo: z.string().trim().min(5).max(1000), arquivoConferido: z.literal(true),
    duplicadaDe: z.uuid().optional(), revisao: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ acao: z.literal('reabrir'), revisao: z.string().regex(/^[a-f0-9]{64}$/) }),
]);

/** Decisão reversível: preserva a linha original e registra autoria e motivo. */
export const POST = professorRoute(async (request: Request, context: { params: Promise<{ examId: string; answerId: string }> }) => {
  const { examId, answerId } = await context.params;
  if (![examId, answerId].every(id => uuid.safeParse(id).success)) return apiError('Leitura inválida.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Confira o arquivo, informe o motivo e recarregue a revisão se necessário.', 400);
  const input = parsed.data;
  if (input.acao === 'desconsiderar' && input.tipo === 'duplicada' && !input.duplicadaDe) return apiError('Indique qual resposta já representa esta leitura.', 400);
  try {
    const [prova, user, result] = await Promise.all([findProva(examId), account(),
      db().from('respostas').select('*').eq('prova_id', examId).eq('id', answerId).maybeSingle()]);
    if (result.error) throw result.error;
    if (!prova?.barema || !result.data) return apiError('Leitura não encontrada.', 404);
    if (!user) return apiError('Entre na sua conta.', 401);
    if (prova.status === 'corrigida') return apiError('A prova já foi liberada.', 409);
    const answer = result.data as Resposta;
    if (answer.numero > 0 || answer.nota_final !== null || answer.comentario_final !== null) return apiError('Somente leituras sem associação e sem validação podem ser desconsideradas.', 409);
    const resolved = isResolvedReading(answer);
    const last = answer.correcao.historicoLeitura?.at(-1);
    const prior = resolved ? answer.correcao.resolucaoLeitura : last;
    const repeated = prior?.acao === input.acao && prior.professorId === user.id && prior.revisaoAnterior === input.revisao &&
      (input.acao === 'reabrir' || (prior.acao === 'desconsiderar' && prior.tipo === input.tipo && prior.motivo === input.motivo && prior.duplicadaDe === input.duplicadaDe));
    if (!repeated && readingRevision(answer) !== input.revisao) return apiError('Esta leitura mudou. Recarregue antes de decidir.', 409);
    if (!repeated && (input.acao === 'reabrir' ? !resolved : resolved)) return apiError('A situação da leitura mudou. Recarregue a revisão.', 409);
    if (input.acao === 'desconsiderar' && input.tipo === 'duplicada') {
      const target = await db().from('respostas').select('id,numero').eq('prova_id', examId).eq('submissao_id', answer.submissao_id).eq('id', input.duplicadaDe!).maybeSingle();
      if (target.error) throw target.error;
      const targetNumber = target.data?.numero;
      if (!target.data || !prova.barema.questoes.some((q: { numero: number }) => q.numero === targetNumber)) return apiError('Escolha uma resposta associada da mesma prova do aluno.', 400);
    }
    let saved = answer;
    if (!repeated) {
      const event: RegistroLeitura = input.acao === 'reabrir'
        ? { acao: 'reabrir', professorId: user.id, em: new Date().toISOString(), revisaoAnterior: input.revisao }
        : { acao: 'desconsiderar', tipo: input.tipo, motivo: input.motivo, duplicadaDe: input.duplicadaDe,
          professorId: user.id, em: new Date().toISOString(), revisaoAnterior: input.revisao };
      const correction = { ...answer.correcao, historicoLeitura: [...(answer.correcao.historicoLeitura || []), event] };
      if (event.acao === 'reabrir') delete correction.resolucaoLeitura;
      else correction.resolucaoLeitura = event;
      const updated = await db().from('respostas').update({ correcao: correction, grupo_id: null })
        .eq('id', answerId).eq('prova_id', examId).eq('numero', answer.numero)
        .eq('correcao', JSON.stringify(answer.correcao)).is('nota_final', null).is('comentario_final', null).select('*').maybeSingle();
      if (updated.error) throw updated.error;
      if (!updated.data) return apiError('Outra revisão alterou esta leitura. Recarregue.', 409);
      saved = updated.data as Resposta;
    }
    // Snapshot também fica desatualizado: uma falha de limpeza não permite publicação.
    if (!repeated) {
      const removed = await db().from('feedbacks').delete().eq('submissao_id', answer.submissao_id);
      if (removed.error) throw removed.error;
    }
    return Response.json({ resposta: { ...saved, revisaoLeitura: readingRevision(saved) } }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
});
