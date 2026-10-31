import 'server-only';
import { account } from '@/lib/auth/server';
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
  const user=await account();
  if(!data||!user||user.papel!=='professor')return null;
  const {data:room,error:roomError}=await db().from('turmas').select('id').eq('id',data.turma_id).eq('professor_id',user.id).maybeSingle();
  if(roomError)throw roomError;
  return room?data:null;
}
