import { professorRoute } from '@/lib/auth/server';
import { ia, MODELO } from '@/lib/ai/client';
import { logFalhaIA, motivoFalhaIA } from '@/lib/ai/erros';
import { gerarFeedback } from '@/lib/ai/feedback';
import type { CorrecaoQuestao } from '@/lib/ai/schemas';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { db } from '@/lib/db/server';
import { findSubmission } from '@/lib/db/submissions';
import { reviewIssues } from '@/lib/review';
import { contentRevision, feedbackReviewed, reviewRevision, validFeedback } from '@/lib/review-revision';
import { z } from 'zod';
import { FeedbackAluno } from '@/lib/ai/schemas';
export const maxDuration = 300;

/** Gera (ou refaz) a devolutiva de um aluno a partir das notas aprovadas. Não publica. */
async function handlePOST(_request: Request, context: { params: Promise<{ examId: string; submissionId: string }> }) {
  const { examId, submissionId } = await context.params;
  if (![examId, submissionId].every(id => uuid.safeParse(id).success)) return apiError('Submissão inválida.', 400);
  try {
    const prova = await findProva(examId);
    const submissao = await findSubmission(examId, submissionId);
    if (!prova?.analise || !prova.barema || !submissao) return apiError('Prova ou submissão não encontrada.', 404);
    if (prova.status === 'corrigida') return apiError('As correções desta prova já foram liberadas.', 409);
    const { data: respostas, error } = await db().from('respostas').select('submissao_id, numero, correcao, nota_final, comentario_final').eq('submissao_id', submissionId).order('numero');
    if (error) throw error;
    if (!respostas?.length) return apiError('Esta prova ainda não foi corrigida.', 409);
    const pendencias = reviewIssues(prova.barema, [submissao], respostas);
    if (pendencias.length) return apiError(pendencias.join(' '), 409);
    const revision = reviewRevision(prova, submissao, respostas);

    let conteudo;
    try {
      conteudo = await gerarFeedback({
        cliente: ia().withOptions({ timeout: 180_000, maxRetries: 1 }),
        modelo: MODELO, analise: prova.analise, barema: prova.barema,
        questoes: respostas.map(r => ({ numero: r.numero, correcao: r.correcao as CorrecaoQuestao, notaFinal: Number(r.nota_final), comentarioProfessor: r.comentario_final })),
      });
    } catch (e) {
      logFalhaIA('devolutiva', e);
      return apiError(`A IA não conseguiu escrever a devolutiva: ${motivoFalhaIA(e)}`, 502);
    }
    if (!validFeedback(conteudo, prova.barema)) return apiError('A devolutiva da IA não cobre todas as questões. Gere novamente.', 502);
    // A IA pode demorar: não salva um texto baseado em notas/arquivos alterados durante a geração.
    const [latestProva, latestSubmission, latestAnswers] = await Promise.all([
      findProva(examId), findSubmission(examId, submissionId),
      db().from('respostas').select('submissao_id, numero, correcao, nota_final, comentario_final').eq('submissao_id', submissionId),
    ]);
    if (latestAnswers.error) throw latestAnswers.error;
    if (!latestProva || !latestSubmission || latestProva.status === 'corrigida' || reviewRevision(latestProva, latestSubmission, latestAnswers.data || []) !== revision) return apiError('A revisão mudou durante a geração. Confira as respostas e gere novamente.', 409);
    // Mantém o token (e o link) se a devolutiva for refeita. Todo novo texto exige revisão humana.
    const { data, error: upError } = await db().from('feedbacks')
      .upsert({ submissao_id: submissionId, conteudo: { ...conteudo, __revisao: revision }, publicado: false }, { onConflict: 'submissao_id' })
      .select('submissao_id, token, publicado').single();
    if (upError) throw upError;
    return Response.json({ feedback: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const POST = professorRoute(handlePOST);

type Context = { params: Promise<{ examId: string; submissionId: string }> };
const Edit = z.object({ conteudo: FeedbackAluno, revisao: z.string().regex(/^[a-f0-9]{64}$/) });

async function currentFeedback(examId: string, submissionId: string) {
  const [prova, submissao, answers, feedback] = await Promise.all([
    findProva(examId), findSubmission(examId, submissionId),
    db().from('respostas').select('submissao_id, numero, correcao, nota_final, comentario_final').eq('submissao_id', submissionId),
    db().from('feedbacks').select('*').eq('submissao_id', submissionId).maybeSingle(),
  ]);
  if (answers.error || feedback.error) throw answers.error || feedback.error;
  return { prova, submissao, answers: answers.data || [], feedback: feedback.data };
}

async function handleGET(_request: Request, context: Context) {
  const { examId, submissionId } = await context.params;
  if (![examId, submissionId].every(id => uuid.safeParse(id).success)) return apiError('Submissão inválida.', 400);
  try {
    const { prova, submissao, answers, feedback } = await currentFeedback(examId, submissionId);
    if (!prova?.barema || !submissao || !feedback) return apiError('Gere a devolutiva antes de revisá-la.', 404);
    const revision = reviewRevision(prova, submissao, answers);
    if (feedback.conteudo?.__revisao !== revision) return apiError('A devolutiva está desatualizada. Gere novamente com a revisão atual.', 409);
    const content = FeedbackAluno.safeParse(feedback.conteudo);
    if (!content.success) return apiError('Devolutiva incompleta. Gere novamente.', 409);
    return Response.json({ feedback: { conteudo: content.data, revisao: contentRevision(feedback.conteudo), revisado: feedbackReviewed(feedback.conteudo, revision), publicado: feedback.publicado } }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

async function handlePUT(request: Request, context: Context) {
  const { examId, submissionId } = await context.params;
  if (![examId, submissionId].every(id => uuid.safeParse(id).success)) return apiError('Submissão inválida.', 400);
  const parsed = Edit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Devolutiva ou versão inválida.', 400);
  if (JSON.stringify(parsed.data.conteudo).length > 60000) return apiError('O texto da devolutiva excede o limite.', 400);
  try {
    const { prova, submissao, answers, feedback } = await currentFeedback(examId, submissionId);
    if (!prova?.barema || !submissao || !feedback) return apiError('Devolutiva não encontrada.', 404);
    if (prova.status === 'corrigida' || feedback.publicado) return apiError('A devolutiva já foi publicada.', 409);
    const revision = reviewRevision(prova, submissao, answers);
    if (reviewIssues(prova.barema, [submissao], answers).length || feedback.conteudo?.__revisao !== revision || contentRevision(feedback.conteudo) !== parsed.data.revisao) return apiError('A revisão ou a devolutiva mudou. Recarregue antes de aprovar o texto.', 409);
    if (!validFeedback(parsed.data.conteudo, prova.barema)) return apiError('Preencha o resumo e preserve exatamente as questões da prova.', 400);
    const { data, error } = await db().from('feedbacks').update({ conteudo: { ...parsed.data.conteudo, __revisao: revision, __aprovadoEm: new Date().toISOString() } })
      .eq('submissao_id', submissionId).eq('publicado', false).eq('conteudo', JSON.stringify(feedback.conteudo)).select('submissao_id').maybeSingle();
    if (error) throw error;
    if (!data) return apiError('A devolutiva mudou durante a gravação. Recarregue.', 409);
    return Response.json({ revisado: true }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const GET = professorRoute(handleGET);
export const PUT = professorRoute(handlePUT);
