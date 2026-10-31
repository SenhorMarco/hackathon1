import { serializeProva } from '@/lib/db/exams';
import { apiError, findProva, privateHeaders, serverError, uuid } from '@/lib/db/api';

export async function GET(_request: Request, context: { params: Promise<{ examId: string }> }) {
  const { examId } = await context.params;
  if (!uuid.safeParse(examId).success) return apiError('Identificador de prova inválido.', 400);
  try {
    const prova = await findProva(examId);
    if (!prova) return apiError('Prova não encontrada.', 404);
    return Response.json({ prova: serializeProva(prova) }, { headers: privateHeaders });
  } catch (error) { return serverError(error); }
}
