import { z } from 'zod';
import { alunoRoute } from '@/lib/aluno/rota';
import { provaDoAluno } from '@/lib/aluno/portal';
import { BUCKET_PROVAS, db } from '@/lib/db/server';
import { privateHeaders } from '@/lib/db/api';
import { FileMetadata, readUpload, signUpload } from '@/lib/uploads/direct';
import { detectProva, validateProva } from '@/lib/uploads/validation';

const MAX_TOTAL = 40 * 1024 * 1024;
const Preparar = z.object({ files: z.array(FileMetadata).min(1).max(10) });
type Contexto = { params: Promise<{ provaId: string }> };

const erro = (message: string, status: number) => Response.json({ error: message }, { status, headers: privateHeaders });

async function envioAtual(provaId: string, alunoId: string) {
  const { data, error } = await db().from('submissoes').select('*').eq('prova_id', provaId).eq('aluno_id', alunoId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * PUT: prepara o envio do aluno (URLs assinadas para subir os arquivos direto ao Storage).
 * POST: confirma o envio com o ticket; cria a submissão já ligada ao aluno logado,
 * ou substitui a anterior enquanto o prazo estiver aberto (RN04, RN06).
 */
export const PUT = alunoRoute(async (request: Request, context: Contexto, conta) => {
  const { provaId } = await context.params;
  if (!z.uuid().safeParse(provaId).success) return erro('Prova inválida.', 400);
  const parsed = Preparar.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return erro('Envie um PDF ou até dez imagens (PNG ou JPEG) de até 20 MB cada.', 400);
  const { files } = parsed.data;
  if ((files.length > 1 && files.some(f => f.type === 'application/pdf')) || files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) {
    return erro('Envie um único PDF ou até dez imagens somando 40 MB.', 400);
  }
  for (const f of files) {
    const invalido = validateProva({ name: f.name, type: f.type, size: f.size } as File);
    if (invalido) return erro(invalido, 400);
  }
  const acesso = await provaDoAluno(conta, provaId);
  if (!acesso) return erro('Prova não encontrada nas suas turmas.', 404);
  if (!acesso.aceitaEnvio) return erro('Esta prova não está recebendo envios.', 409);

  // Substituição mantém o mesmo id: o professor vê um único envio por aluno.
  const id = (await envioAtual(provaId, acesso.aluno.id))?.id || crypto.randomUUID();
  const tentativa = crypto.randomUUID();
  const entradas = files.map((f, i) => ({ ...f, path: `${provaId}/submissoes/${id}/${tentativa}/${i + 1}.${f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : 'jpg'}` }));
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
  const arquivos = recebido.form.getAll('arquivos').filter((f): f is File => f instanceof File);
  for (const f of arquivos) if (!await detectProva(f)) return erro('Conteúdo de arquivo inválido.', 400);

  const paths = ticket.files.map(f => f.path);
  const nomes = ticket.files.map(f => f.name);
  const anterior = await envioAtual(provaId, acesso.aluno.id);
  if (anterior && anterior.id !== ticket.id) return erro('O envio mudou. Recarregue a página e tente de novo.', 409);

  if (anterior) {
    // Substituição: a correção anterior fica desatualizada e precisa ser refeita (RN06, RN07).
    const { error: delError } = await db().from('respostas').delete().eq('submissao_id', anterior.id);
    if (delError) throw delError;
    const { data, error } = await db().from('submissoes').update({
      arquivo_paths: paths, arquivo_nomes: nomes, status: 'enviada', correcao: null, erro: null, nome_lido: conta.nome,
    }).eq('id', anterior.id).select('id, status, arquivo_nomes, created_at').single();
    if (error) throw error;
    const antigos = (anterior.arquivo_paths as string[]).filter(p => !paths.includes(p));
    if (antigos.length) await db().storage.from(BUCKET_PROVAS).remove(antigos);
    return Response.json({ envio: data, substituido: true }, { headers: privateHeaders });
  }

  const { data, error } = await db().from('submissoes').insert({
    id: ticket.id, prova_id: provaId, aluno_id: acesso.aluno.id, arquivo_paths: paths, arquivo_nomes: nomes,
    status: 'enviada', nome_lido: conta.nome,
  }).select('id, status, arquivo_nomes, created_at').single();
  if (error) throw error;
  return Response.json({ envio: data, substituido: false }, { status: 201, headers: privateHeaders });
});
