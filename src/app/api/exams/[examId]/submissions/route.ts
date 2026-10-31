import { db, BUCKET_PROVAS } from '@/lib/db/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { findSubmission } from '@/lib/db/submissions';
import { detectProva, MAX_PROVA_BYTES, validateProva } from '@/lib/uploads/validation';
const MAX_TOTAL = 40 * 1024 * 1024;
export async function GET(_request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  try {
    if (!await findProva(examId)) return apiError('Prova não encontrada.', 404);
    const { data, error } = await db().from('submissoes').select('*').eq('prova_id', examId).order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json({ submissoes: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Prova inválida.', 400);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return apiError('Envie multipart/form-data.', 415);
  if (Number(request.headers.get('content-length')) > MAX_TOTAL + 1024 * 1024) return apiError('O conjunto deve ter até 40 MB.', 413);
  const form = await request.formData().catch(() => null);
  if (!form) return apiError('Formulário inválido.', 400);
  const id = form.get('id');
  const files = form.getAll('arquivos');
  if (!uuid.safeParse(id).success || !files.length || files.length > 10 || !files.every(f => f instanceof File)) return apiError('Envie um PDF ou até dez imagens e um identificador válido.', 400);
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL) return apiError('O conjunto deve ter até 40 MB.', 413);
  const mimes: string[] = [];
  for (const file of files) {
    const invalid = validateProva(file);
    if (invalid) return apiError(invalid, file.size > MAX_PROVA_BYTES ? 413 : 400);
    const mime = await detectProva(file);
    if (!mime) return apiError('Conteúdo de arquivo inválido.', 400);
    mimes.push(mime);
  }
  if (files.length > 1 && mimes.includes('application/pdf')) return apiError('Cada PDF deve ser enviado como uma prova independente.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova?.turma_id) return apiError('Prova ou turma não encontrada.', 404);
    const existing = await findSubmission(examId, id as string);
    if (existing) return Response.json({ submissao: existing }, { headers: privateHeaders });
    const paths: string[] = [];
    const bucket = db().storage.from(BUCKET_PROVAS);
    // Diretório de tentativa separado: uma repetição concorrente não remove arquivos já confirmados.
    const attempt = crypto.randomUUID();
    try {
      for (const [i, file] of files.entries()) {
        const ext = mimes[i] === 'application/pdf' ? 'pdf' : mimes[i] === 'image/png' ? 'png' : 'jpg';
        const path = `${examId}/submissoes/${id}/${attempt}/${i + 1}.${ext}`;
        const { error } = await bucket.upload(path, file, { contentType: mimes[i], upsert: false });
        if (error) throw error;
        paths.push(path);
      }
      const { data, error } = await db().from('submissoes').insert({ id, prova_id: examId, aluno_id: null, arquivo_paths: paths, arquivo_nomes: files.map(f => f.name), status: 'enviada' }).select('*').single();
      if (error) throw error;
      return Response.json({ submissao: data }, { status: 201, headers: privateHeaders });
    } catch (error) {
      if (paths.length) {
        const { error: cleanupError } = await bucket.remove(paths);
        if (cleanupError) console.error('Falha ao limpar arquivos de submissão incompleta.');
      }
      throw error;
    }
  } catch (error) { return serverError(error); }
}
