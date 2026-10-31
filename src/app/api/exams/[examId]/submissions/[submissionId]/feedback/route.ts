import { professorRoute } from '@/lib/auth/server';
import { ia, MODELO } from '@/lib/ai/client';
import { gerarFeedback } from '@/lib/ai/feedback';
import type { CorrecaoQuestao } from '@/lib/ai/schemas';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';
import { findSubmission } from '@/lib/db/submissions';
export const maxDuration = 300;

/** Gera (ou refaz) a devolutiva de um aluno a partir das notas aprovadas. Não publica. */
async function handlePOST(_request: Request, context: { params: Promise<{ examId: string; submissionId: string }> }) {
  const { examId, submissionId } = await context.params;
  if (![examId, submissionId].every(id => uuid.safeParse(id).success)) return apiError('Submissão inválida.', 400);
  try {
    const prova = await findProva(examId);
    const submissao = await findSubmission(examId, submissionId);
    if (!prova?.analise || !prova.barema || !submissao) return apiError('Prova ou submissão não encontrada.', 404);
    const { data: respostas, error } = await db().from('respostas').select('numero, correcao, nota_final, comentario_final').eq('submissao_id', submissionId).order('numero');
    if (error) throw error;
    if (!respostas?.length) return apiError('Esta prova ainda não foi corrigida.', 409);
    if (respostas.some(r => r.nota_final === null)) return apiError('Aprove as notas de todas as questões deste aluno antes de gerar a devolutiva.', 409);

    let conteudo;
    try {
      conteudo = await gerarFeedback({
        cliente: ia().withOptions({ timeout: 180_000, maxRetries: 1 }),
        modelo: MODELO, analise: prova.analise, barema: prova.barema,
        questoes: respostas.map(r => ({ numero: r.numero, correcao: r.correcao as CorrecaoQuestao, notaFinal: Number(r.nota_final), comentarioProfessor: r.comentario_final })),
      });
    } catch (e) {
      console.error('Falha na devolutiva:', e instanceof Error ? e.message : 'erro');
      return apiError('A IA não conseguiu escrever a devolutiva. Tente novamente.', 502);
    }
    // Mantém o token (e o link) se a devolutiva for refeita.
    const { data, error: upError } = await db().from('feedbacks')
      .upsert({ submissao_id: submissionId, conteudo, publicado: false }, { onConflict: 'submissao_id' })
      .select('submissao_id, token, publicado').single();
    if (upError) throw upError;
    return Response.json({ feedback: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const POST = professorRoute(handlePOST);
