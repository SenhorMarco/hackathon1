import 'server-only';
import { db } from './server';
export async function findSubmission(provaId: string, id: string) {
  const { data, error } = await db().from('submissoes').select('*').eq('prova_id', provaId).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
