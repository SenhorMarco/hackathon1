import { professorRoute } from '@/lib/auth/server';
import { BUCKET_PROVAS, db } from '@/lib/db/server';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';

async function handleGET(_request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Identificador de prova inválido.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova?.arquivo_path) return apiError('Arquivo não encontrado.', 404);
    const { data, error } = await db().storage.from(BUCKET_PROVAS).createSignedUrl(prova.arquivo_path, 60);
    if (error) throw error;
    return new Response(null, { status: 302, headers: { ...privateHeaders, Location: data.signedUrl } });
  } catch (error) { return serverError(error); }
}

export const GET = professorRoute(handleGET);
