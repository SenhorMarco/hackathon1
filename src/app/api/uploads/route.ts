import { account, professorRoute } from '@/lib/auth/server';
import { z } from 'zod';
import { BUCKET_PROVAS, db } from '@/lib/db/server';
import { apiError, findProva, privateHeaders, serverError } from '@/lib/db/api';
import { FileMetadata, signUpload } from '@/lib/uploads/direct';
import { validateProva } from '@/lib/uploads/validation';
const Input = z.object({ purpose: z.enum(['exam', 'submission']), examId: z.uuid().optional(), id: z.uuid().optional(), files: z.array(FileMetadata).min(1).max(10) });
async function handlePOST(request: Request) {
  const parsed = Input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Dados de upload inválidos. Aceitamos PDF, PNG e JPEG de até 20 MB.', 400);
  const { purpose, files } = parsed.data;
  if ((purpose === 'exam' && files.length !== 1) || (files.length > 1 && files.some(f => f.type === 'application/pdf')) || files.reduce((sum, f) => sum + f.size, 0) > 40 * 1024 * 1024) return apiError('Envie um PDF por aluno ou até dez imagens somando 40 MB.', 400);
  for (const f of files) {
    // Valida extensão/MIME sem alocar os bytes do arquivo no servidor.
    const invalid = validateProva({ name: f.name, type: f.type, size: f.size } as File);
    if (invalid) return apiError(invalid, 400);
  }
  try {
    const examId = purpose === 'submission' ? parsed.data.examId : null;
    if (purpose === 'submission' && (!examId || !await findProva(examId))) return apiError('Prova não encontrada.', 404);
    const id = (purpose === 'submission' ? parsed.data.id : null) || crypto.randomUUID();
    const attempt = crypto.randomUUID();
    const entries = files.map((f, i) => ({ ...f, path: `${purpose === 'exam' ? id : `${examId}/submissoes/${id}`}/${attempt}/${i + 1}.${f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : 'jpg'}` }));
    const uploads = [];
    for (const entry of entries) {
      const { data, error } = await db().storage.from(BUCKET_PROVAS).createSignedUploadUrl(entry.path);
      if (error) throw error;
      uploads.push({ url: data.signedUrl });
    }
    const ticket = signUpload({ userId:(await account())!.id, id, purpose, examId: examId || null, expires: Date.now() + 30 * 60 * 1000, files: entries });
    return Response.json({ uploads, ticket }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}

export const POST = professorRoute(handlePOST);
