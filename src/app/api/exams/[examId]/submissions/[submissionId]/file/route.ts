import { professorRoute } from '@/lib/auth/server';
import { db, BUCKET_PROVAS } from '@/lib/db/server';
import { apiError, privateHeaders, serverError, uuid } from '@/lib/db/api';
import { findSubmission } from '@/lib/db/submissions';
async function handleGET(request: Request, context: { params: Promise<{ examId: string; submissionId: string }> }) {
  const { examId, submissionId } = await context.params;
  const index = Number(new URL(request.url).searchParams.get('index') || '0');
  if (![examId, submissionId].every(id => uuid.safeParse(id).success) || !Number.isInteger(index) || index < 0) return apiError('Arquivo inválido.', 400);
  try {
    const submission = await findSubmission(examId, submissionId);
    const path = submission?.arquivo_paths[index];
    if (!path) return apiError('Arquivo não encontrado.', 404);
    const { data, error } = await db().storage.from(BUCKET_PROVAS).createSignedUrl(path, 60);
    if (error) throw error;
    return new Response(null, { status: 302, headers: { ...privateHeaders, Location: data.signedUrl } });
  } catch (error) { return serverError(error); }
}

export const GET = professorRoute(handleGET);
