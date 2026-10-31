import { z } from 'zod';
import { alunoRoute } from '@/lib/aluno/rota';
import { provaDoAluno } from '@/lib/aluno/portal';
import { juntarFotos, questaoDoCaminho } from '@/lib/aluno/questoes';
import { BUCKET_PROVAS, db } from '@/lib/db/server';
import { privateHeaders } from '@/lib/db/api';
import { FileMetadata, readUpload, signUpload } from '@/lib/uploads/direct';
import { detectProva, validateProva } from '@/lib/uploads/validation';

const MAX_TOTAL = 40 * 1024 * 1024;
const Preparar = z.object({ files: z.array(FileMetadata).min(1).max(10), numero: z.number().int().positive().optional() });
type Contexto = { params: Promise<{ provaId: string }> };

const erro = (message: string, status: number) => Response.json({ error: message }, { status, headers: privateHeaders });
const extensao = (type: string) => type === 'application/pdf' ? 'pdf' : type === 'image/png' ? 'png' : 'jpg';

async function envioAtual(provaId: string, alunoId: string) {
  const { data, error } = await db().from('submissoes').select('*').eq('prova_id', provaId).eq('aluno_id', alunoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

function questoesDaProva(prova: { analise?: { questoes?: { numero: number }[] } | null }) {
  return new Set((prova.analise?.questoes || []).map(q => q.numero));
}

/** Grava a nova lista de arquivos; a correção anterior fica desatualizada (RN06, RN07). */
async function salvarArquivos(anterior: { id: string; arquivo_paths: string[] }, arquivos: { path: string; nome: string }[], nomeAluno: string) {
  const { error: delError } = await db().from('respostas').delete().eq('submissao_id', anterior.id);
  if (delError) throw delError;
  const { data, error } = await db().from('submissoes').update({
    arquivo_paths: arquivos.map(a => a.path), arquivo_nomes: arquivos.map(a => a.nome),
    status: 'enviada', correcao: null, erro: null, nome_lido: nomeAluno,
  }).eq('id', anterior.id).select('id, status, arquivo_paths, arquivo_nomes, created_at').single();
  if (error) throw error;
  const removidos = anterior.arquivo_paths.filter(p => !arquivos.some(a => a.path === p));
  if (removidos.length) await db().storage.from(BUCKET_PROVAS).remove(removidos);
  return data;
}

/**
 * PUT: prepara o envio (URLs assinadas para subir direto ao Storage). Com `numero`,
 * as fotos são da questão indicada; sem ele, é a prova inteira.
 * POST: confirma com o ticket. A submissão fica ligada ao aluno logado (RN04).
 * DELETE ?numero=N: remove as fotos de uma questão.
 */
export const PUT = alunoRoute(async (request: Request, context: Contexto, conta) => {
  const { provaId } = await context.params;
  if (!z.uuid().safeParse(provaId).success) return erro('Prova inválida.', 400);
  const parsed = Preparar.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return erro('Envie um PDF ou até dez fotos (PNG ou JPEG) de até 20 MB cada.', 400);
  const { files, numero } = parsed.data;
  if ((files.length > 1 && files.some(f => f.type === 'application/pdf')) || files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) {
    return erro('Envie um único PDF ou até dez fotos somando 40 MB.', 400);
  }
  for (const f of files) {
    const invalido = validateProva({ name: f.name, type: f.type, size: f.size } as File);
    if (invalido) return erro(invalido, 400);
  }
  const acesso = await provaDoAluno(conta, provaId);
  if (!acesso) return erro('Prova não encontrada nas suas turmas.', 404);
  if (!acesso.aceitaEnvio) return erro('Esta prova não está recebendo envios.', 409);
  if (numero !== undefined && !questoesDaProva(acesso.prova).has(numero)) return erro('Questão não encontrada nesta prova.', 400);

  // O mesmo id em todos os envios: o professor vê uma única submissão por aluno.
  const id = (await envioAtual(provaId, acesso.aluno.id))?.id || crypto.randomUUID();
  const tentativa = crypto.randomUUID();
  const pasta = numero !== undefined ? `q${numero}/${tentativa}` : tentativa;
  const entradas = files.map((f, i) => ({ ...f, path: `${provaId}/submissoes/${id}/${pasta}/${i + 1}.${extensao(f.type)}` }));
  const uploads = [];
  for (const e of entradas) {
    const { data, error } = await db().storage.from(BUCKET_PROVAS).createSignedUploadUrl(e.path);
    if (error) throw error;
    uploads.push({ url: data.signedUrl });
  }
  const ticket = signUpload({ userId: conta.id, id, purpose: 'submission', examId: provaId, expires: Date.now() + 30 * 60 * 1000, files: entradas });
  return Response.json({ uploads, ticket }, { headers: privateHeaders });
});

export const POST = alunoRoute(async (request: Request, context: Contexto, conta) => {
  const { provaId } = await context.params;
  if (!z.uuid().safeParse(provaId).success) return erro('Prova inválida.', 400);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return erro('Envie a confirmação em JSON.', 415);
  const acesso = await provaDoAluno(conta, provaId);
  if (!acesso) return erro('Prova não encontrada nas suas turmas.', 404);
  if (!acesso.aceitaEnvio) return erro('Esta prova não está recebendo envios.', 409);

  let recebido;
  try { recebido = await readUpload(request, 'submission', provaId); }
  catch (e) { return erro(e instanceof Error ? e.message : 'Envio inválido. Tente de novo.', 400); }
  const ticket = recebido.prepared!;
  for (const f of recebido.form.getAll('arquivos')) if (!(f instanceof File) || !await detectProva(f)) return erro('Conteúdo de arquivo inválido.', 400);

  const numero = questaoDoCaminho(ticket.files[0].path);
  const novos = ticket.files.map((f, i) => ({
    path: f.path,
    nome: numero !== null ? `Questão ${numero}${ticket.files.length > 1 ? ` (${i + 1})` : ''} · ${f.name}` : f.name,
  }));
  const anterior = await envioAtual(provaId, acesso.aluno.id);
  if (anterior && anterior.id !== ticket.id) return erro('O envio mudou. Recarregue a página e tente de novo.', 409);

  if (anterior) {
    const antigos = (anterior.arquivo_paths as string[]).map((path, i) => ({ path, nome: (anterior.arquivo_nomes as string[])[i] || path }));
    // Prova inteira substitui tudo; foto de questão substitui só aquela questão (e descarta um envio inteiro antigo).
    const arquivos = numero !== null ? juntarFotos(antigos, novos, numero) : novos;
    const envio = await salvarArquivos(anterior, arquivos, conta.nome);
    return Response.json({ envio, substituido: true }, { headers: privateHeaders });
  }

  const { data, error } = await db().from('submissoes').insert({
    id: ticket.id, prova_id: provaId, aluno_id: acesso.aluno.id,
    arquivo_paths: novos.map(n => n.path), arquivo_nomes: novos.map(n => n.nome), status: 'enviada', nome_lido: conta.nome,
  }).select('id, status, arquivo_paths, arquivo_nomes, created_at').single();
  if (error) throw error;
  return Response.json({ envio: data, substituido: false }, { status: 201, headers: privateHeaders });
});

export const DELETE = alunoRoute(async (request: Request, context: Contexto, conta) => {
  const { provaId } = await context.params;
  const numero = Number(new URL(request.url).searchParams.get('numero'));
  if (!z.uuid().safeParse(provaId).success || !Number.isInteger(numero) || numero < 1) return erro('Questão inválida.', 400);
  const acesso = await provaDoAluno(conta, provaId);
  if (!acesso) return erro('Prova não encontrada nas suas turmas.', 404);
  if (!acesso.aceitaEnvio) return erro('Esta prova não está recebendo envios.', 409);
  const anterior = await envioAtual(provaId, acesso.aluno.id);
  if (!anterior) return erro('Você ainda não enviou fotos desta prova.', 404);
  const antigos = (anterior.arquivo_paths as string[]).map((path, i) => ({ path, nome: (anterior.arquivo_nomes as string[])[i] || path }));
  const restantes = antigos.filter(a => questaoDoCaminho(a.path) !== numero);
  if (restantes.length === antigos.length) return erro('Esta questão não tem foto enviada.', 404);
  if (!restantes.length) {
    // Sem nenhuma foto, o envio deixa de existir para o professor.
    const { error } = await db().from('submissoes').delete().eq('id', anterior.id);
    if (error) throw error;
    await db().storage.from(BUCKET_PROVAS).remove(antigos.map(a => a.path));
    return Response.json({ envio: null }, { headers: privateHeaders });
  }
  const envio = await salvarArquivos(anterior, restantes, conta.nome);
  return Response.json({ envio }, { headers: privateHeaders });
});
