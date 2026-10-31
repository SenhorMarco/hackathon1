import { ia, MODELO } from '@/lib/ai/client';
import { corrigirAluno } from '@/lib/ai/correcao';
import { logFalhaIA, motivoFalhaIA } from '@/lib/ai/erros';
import type { CorrecaoAluno } from '@/lib/ai/schemas';
import { ErroRevisaoIA } from '@/lib/ai/validacao';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { imagensDosArquivos } from '@/lib/db/files';
import { db } from '@/lib/db/server';
import { findSubmission } from '@/lib/db/submissions';
export const maxDuration = 300;

/**
 * Pré-corrige a prova de um aluno. Uma submissão por chamada: o navegador
 * percorre a lista em sequência, o que respeita o limite de chamadas
 * simultâneas da Featherless e o tempo máximo de uma função na Vercel.
 */
export async function POST(_request: Request, context: { params: Promise<{ examId: string; submissionId: string }> }) {
  const { examId, submissionId } = await context.params;
  if (![examId, submissionId].every(id => uuid.safeParse(id).success)) return apiError('Submissão inválida.', 400);
  try {
    const prova = await findProva(examId);
    const submissao = await findSubmission(examId, submissionId);
    if (!prova || !submissao) return apiError('Prova ou submissão não encontrada.', 404);
    if (!prova.analise || !prova.barema) return apiError('Analise a prova e confirme o barema antes de corrigir.', 409);
    if (!submissao.aluno_id) return apiError('Confirme o aluno desta prova antes de corrigir.', 409);
    if (prova.status === 'corrigida') return apiError('As correções desta prova já foram liberadas.', 409);

    await db().from('submissoes').update({ status: 'corrigindo', erro: null }).eq('id', submissionId);
    if (prova.status !== 'corrigindo') await db().from('provas').update({ status: 'corrigindo' }).eq('id', examId);

    let correcao: CorrecaoAluno;
    let alerta: string | null = null;
    try {
      const imagens = await imagensDosArquivos(submissao.arquivo_paths);
      correcao = await corrigirAluno({
        cliente: ia().withOptions({ timeout: 240_000, maxRetries: 1 }),
        modelo: MODELO,
        analise: prova.analise,
        barema: prova.barema,
        resposta: `As imagens são as ${imagens.length} página(s) da prova respondida por um aluno, na ordem. Pré-corrija cada questão do barema.`,
        imagens,
        maxTokens: 12000,
      });
    } catch (error) {
      if (error instanceof ErroRevisaoIA && error.resultado) {
        // Resultado utilizável, mas com inconsistências: segue para o professor com o alerta.
        correcao = error.resultado as CorrecaoAluno;
        alerta = error.motivos.join('; ');
      } else {
        logFalhaIA('correção', error);
        const mensagem = `A IA não conseguiu corrigir esta prova: ${motivoFalhaIA(error)}`;
        const { data } = await db().from('submissoes').update({ status: 'erro', erro: mensagem }).eq('id', submissionId).select('*').single();
        return Response.json({ submissao: data, error: mensagem }, { status: 502, headers: privateHeaders });
      }
    }

    // Só questões que existem no barema viram respostas.
    const numeros = new Set(prova.barema.questoes.map((q: { numero: number }) => q.numero));
    const linhas = correcao.questoes.filter(q => numeros.has(q.numero)).map(q => ({
      submissao_id: submissionId, prova_id: examId, numero: q.numero, correcao: q,
      grupo_id: null, nota_final: null, comentario_final: null,
    }));
    // Uma nova correção substitui a anterior e desfaz grupos e notas aprovadas.
    const { error: delError } = await db().from('respostas').delete().eq('submissao_id', submissionId);
    if (delError) throw delError;
    if (linhas.length) {
      const { error } = await db().from('respostas').insert(linhas);
      if (error) throw error;
    }
    const { data, error } = await db().from('submissoes')
      .update({ status: 'corrigida', correcao, nome_lido: submissao.nome_lido ?? correcao.nomeLido, erro: alerta })
      .eq('id', submissionId).select('*').single();
    if (error) throw error;
    return Response.json({ submissao: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}
