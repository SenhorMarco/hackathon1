import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { AnaliseProva, Barema } from '@/lib/ai/schemas';
import { account } from '@/lib/auth/server';
import { provaDoAluno } from '@/lib/aluno/portal';
import { questaoDoCaminho } from '@/lib/aluno/questoes';
import { db } from '@/lib/db/server';
import AccountMenu from '@/components/account-menu';
import AlunoProva, { type QuestaoParaEnvio } from '@/components/aluno-prova';

export const metadata = { title: 'Aula Clara | Enviar prova', robots: { index: false } };

async function Conteudo({ params }: { params: Promise<{ provaId: string }> }) {
  await connection();
  const user = await account();
  if (!user) redirect('/login');
  if (user.papel !== 'aluno') redirect('/professor/dashboard');
  const { provaId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(provaId)) notFound();
  const acesso = await provaDoAluno(user, provaId);
  if (!acesso) notFound();
  const { prova, aluno, aceitaEnvio } = acesso;

  const { data: envio, error } = await db().from('submissoes').select('id, status, arquivo_paths, arquivo_nomes, created_at').eq('prova_id', provaId).eq('aluno_id', aluno.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const { data: devolutiva } = envio ? await db().from('feedbacks').select('token').eq('submissao_id', envio.id).eq('publicado', true).maybeSingle() : { data: null };

  const paths: string[] = envio?.arquivo_paths || [];
  const nomes: string[] = envio?.arquivo_nomes || [];
  const arquivos = paths.map((path, index) => ({ index, nome: nomes[index] || `Arquivo ${index + 1}`, numero: questaoDoCaminho(path) }));
  const analise = prova.analise as AnaliseProva | null;
  const barema = prova.barema as Barema | null;
  const questoes: QuestaoParaEnvio[] = (analise?.questoes || []).map(q => ({
    numero: q.numero,
    enunciado: q.enunciado,
    conteudo: q.conteudo,
    valor: barema?.questoes.find(b => b.numero === q.numero)?.valorTotal ?? null,
    fotos: arquivos.filter(a => a.numero === q.numero).map(({ index, nome }) => ({ index, nome })),
  }));

  return <>
    <AccountMenu name={user.nome} />
    <AlunoProva
      prova={{ id: prova.id, titulo: prova.titulo, data: prova.data_avaliacao ?? null, prazo: typeof prova.prazo_envio === 'string' ? prova.prazo_envio : null }}
      aceitaEnvio={aceitaEnvio}
      questoes={questoes}
      arquivosInteiros={arquivos.filter(a => a.numero === null).map(({ index, nome }) => ({ index, nome }))}
      emCorrecao={!!envio && ['corrigindo', 'corrigida'].includes(envio.status)}
      devolutiva={devolutiva?.token ?? null}
    />
  </>;
}

export default function Page({ params }: { params: Promise<{ provaId: string }> }) {
  return <Suspense fallback={<p style={{ padding: 32 }}>Carregando a prova…</p>}><Conteudo params={params} /></Suspense>;
}
