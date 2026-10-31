import 'server-only';
import { z } from 'zod';
import { db } from './server';

export const uuid = z.uuid();
export const privateHeaders = { 'Cache-Control': 'no-store' };

export function apiError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: privateHeaders });
}

export function serverError(error: unknown) {
  // Nunca devolve detalhes do provedor, caminhos ou credenciais ao navegador.
  console.error('Falha na API de provas:', error instanceof Error ? error.name : 'erro de persistência');
  return apiError('Não foi possível acessar as provas. Confira a configuração do Supabase e tente novamente.', 500);
}

export async function findProva(id: string) {
  const { data, error } = await db().from('provas').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
