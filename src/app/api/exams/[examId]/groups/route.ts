import { z } from 'zod';
import { agruparQuestao } from '@/lib/ai/agrupamento';
import { ia, MODELO } from '@/lib/ai/client';
import type { AgrupamentoQuestao, BaremaQuestao, CorrecaoQuestao, QuestaoAnalisada } from '@/lib/ai/schemas';
import { ErroRevisaoIA } from '@/lib/ai/validacao';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';
export const maxDuration = 300;

const Input = z.object({ numero: z.number().int().positive() });

/** Agrupa as respostas corrigidas de uma questão. Refazer substitui os grupos anteriores. */
export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Informe o número da questão.', 400);
  const { numero } = parsed.data;
  try {
    const prova = await findProva(examId);
    if (!prova?.analise || !prova.barema) return apiError('Prova sem análise ou barema.', 409);
    if (prova.status === 'corrigida') return apiError('As correções desta prova já foram liberadas.', 409);
    const questao = prova.analise.questoes.find((q: QuestaoAnalisada) => q.numero === numero);
    const barema = prova.barema.questoes.find((q: BaremaQuestao) => q.numero === numero);
    if (!questao || !barema) return apiError('Questão não encontrada no barema.', 404);

    const { data: respostas, error } = await db().from('respostas').select('id, correcao').eq('prova_id', examId).eq('numero', numero);
    if (error) throw error;
    if (!respostas?.length) return apiError('Nenhuma resposta corrigida para esta questão.', 409);

    let agrupamento: AgrupamentoQuestao;
    let alerta: string | null = null;
    try {
      agrupamento = await agruparQuestao({
        cliente: ia().withOptions({ timeout: 180_000, maxRetries: 1 }),
        modelo: MODELO, questao, barema,
        respostas: respostas.map(r => ({ id: r.id as string, correcao: r.correcao as CorrecaoQuestao })),
      });
    } catch (e) {
      if (!(e instanceof ErroRevisaoIA) || !e.resultado) throw e;
      agrupamento = e.resultado as AgrupamentoQuestao;
      alerta = e.motivos.join('; ');
    }

    // Corrige o que a IA deixou inconsistente: ids repetidos ou inexistentes saem, e o que sobrar vai para "A revisar".
    const ids = new Set(respostas.map(r => r.id as string));
    const usados = new Set<string>();
    const grupos = agrupamento.grupos.map(g => ({
      ...g,
      notaSugerida: Math.min(Math.max(0, g.notaSugerida), barema.valorTotal),
      respostaIds: g.respostaIds.filter(id => ids.has(id) && !usados.has(id) && usados.add(id)),
    })).filter(g => g.respostaIds.length);
    const sobras = [...ids].filter(id => !usados.has(id));
    if (sobras.length) grupos.push({ rotulo: 'A revisar', categoria: 'parcial', descricao: 'Respostas que a IA não conseguiu agrupar.', respostaIds: sobras, notaSugerida: 0, comentarioSugerido: '', criterioSugerido: null });

    const { error: delError } = await db().from('grupos').delete().eq('prova_id', examId).eq('numero', numero);
    if (delError) throw delError;
    for (const g of grupos) {
      const { data: grupo, error: insError } = await db().from('grupos').insert({
        prova_id: examId, numero, rotulo: g.rotulo, categoria: g.categoria, descricao: g.descricao,
        nota_sugerida: g.notaSugerida, comentario_sugerido: g.comentarioSugerido, criterio_sugerido: g.criterioSugerido,
      }).select('id').single();
      if (insError) throw insError;
      const { error: updError } = await db().from('respostas').update({ grupo_id: grupo.id, nota_final: null, comentario_final: null }).in('id', g.respostaIds);
      if (updError) throw updError;
    }
    return Response.json({ grupos: grupos.length, alerta }, { headers: privateHeaders });
  } catch (error) {
    console.error('Falha no agrupamento:', error instanceof Error ? error.message : 'erro');
    return serverError(error);
  }
}
