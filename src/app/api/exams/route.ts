import { z } from 'zod';
import { BUCKET_PROVAS, db } from '@/lib/db/server';
import { apiError, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { detectProva, MAX_PROVA_BYTES, validateProva } from '@/lib/uploads/validation';

const fields = z.object({
  titulo: z.string().trim().min(1).max(100),
  data_avaliacao: z.iso.date(),
  turma_id: uuid,
  turma_nome: z.string().trim().min(1).max(40),
});

export async function GET(request: Request) {
  const turmaId = new URL(request.url).searchParams.get('turma_id');
  if (!uuid.safeParse(turmaId).success) return apiError('Informe uma turma válida.', 400);
  try {
    const { data, error } = await db().from('provas').select('*').eq('turma_id', turmaId).order('created_at', { ascending: false });
    if (error) throw error;
    return Response.json({ provas: data }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return apiError('Envie os dados como multipart/form-data.', 415);
  if (Number(request.headers.get('content-length')) > MAX_PROVA_BYTES + 1024 * 1024) return apiError('Envie um arquivo de até 20 MB.', 413);
  let form: FormData;
  try { form = await request.formData(); }
  catch { return apiError('Formulário de upload inválido.', 400); }
  const parsed = fields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return apiError('Informe título, data e turma válidos.', 400);
  const file = form.get('arquivo');
  if (!(file instanceof File)) return apiError('Envie o arquivo da prova.', 400);
  const invalid = validateProva(file);
  if (invalid) return apiError(invalid, file.size > MAX_PROVA_BYTES ? 413 : 400);
  const mime = await detectProva(file);
  if (!mime) return apiError('O conteúdo do arquivo não corresponde a um PDF, PNG ou JPEG válido.', 400);
  try {
    const client = db();
    const { turma_id, turma_nome, titulo, data_avaliacao } = parsed.data;
    // O UUID da turma é estável no navegador; novos envios reutilizam a turma.
    const { error: turmaError } = await client.from('turmas').upsert({ id: turma_id, nome: turma_nome }, { onConflict: 'id', ignoreDuplicates: true });
    if (turmaError) throw turmaError;
    const id = crypto.randomUUID();
    const extension = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
    const path = `${id}/original.${extension}`;
    const bucket = client.storage.from(BUCKET_PROVAS);
    const { error: uploadError } = await bucket.upload(path, file, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;
    // Compensação: uma falha no INSERT não deve deixar o arquivo órfão.
    try {
      const { data, error } = await client.from('provas').insert({ id, turma_id, titulo, data_avaliacao, arquivo_nome: file.name, arquivo_path: path, status: 'rascunho' }).select('*').single();
      if (error) throw error;
      return Response.json({ prova: data }, { status: 201, headers: privateHeaders });
    } catch (error) {
      const { error: cleanupError } = await bucket.remove([path]);
      if (cleanupError) console.error('Não foi possível remover o arquivo de um upload incompleto.');
      throw error;
    }
  } catch (error) { return serverError(error); }
}
