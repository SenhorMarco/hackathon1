import { professorRoute } from '@/lib/auth/server';
import { apiError } from '@/lib/db/api';

// RN15: grupos organizam a revisão; aprovação em lote não faz parte deste fluxo.
// Clientes antigos também precisam usar a validação individual por resposta.
async function handlePATCH() {
  return apiError('Revise e valide cada resposta individualmente. A aprovação automática de um grupo foi desativada.', 409);
}

export const PATCH = professorRoute(handlePATCH);
