import { z } from 'zod';
import { alunoRoute } from '@/lib/aluno/rota';
import { provaDoAluno } from '@/lib/aluno/portal';
import { BUCKET_PROVAS, db } from '@/lib/db/server';
import { privateHeaders } from '@/lib/db/api';

/** Abre uma foto enviada pelo próprio aluno (link assinado de 60 s). */
export const GET = alunoRoute(async (request: Request, context: { params: Promise<{ provaId: string }> }, conta) => {
  const { provaId } = await context.params;
  const index = Number(new URL(request.url).searchParams.get('index') || '0');
  if (!z.uuid().safeParse(provaId).success || !Number.isInteger(index) || index < 0) return Response.json({ error: 'Arquivo inválido.' }, { status: 400 });
  const acesso = await provaDoAluno(conta, provaId);
  if (!acesso) return Response.json({ error: 'Prova não encontrada.' }, { status: 404 });
  const { data: envio, error } = await db().from('submissoes').select('arquivo_paths').eq('prova_id', provaId).eq('aluno_id', acesso.aluno.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const path = envio?.arquivo_paths?.[index];
  if (!path) return Response.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  const { data, error: urlError } = await db().storage.from(BUCKET_PROVAS).createSignedUrl(path, 60);
  if (urlError) throw urlError;
  return new Response(null, { status: 302, headers: { ...privateHeaders, Location: data.signedUrl } });
});
