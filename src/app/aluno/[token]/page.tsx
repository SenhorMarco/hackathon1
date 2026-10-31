import { account } from '@/lib/auth/server';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { BaremaQuestao, FeedbackAluno } from '@/lib/ai/schemas';
import { db } from '@/lib/db/server';
import styles from './aluno.module.css';

export const metadata = { title: 'Aula Clara | Sua devolutiva', robots: { index: false } };

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

async function Devolutiva({ params }: { params: Promise<{ token: string }> }) {
  const user=await account();if(!user)redirect('/login');
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const { data: feedback } = await db().from('feedbacks').select('submissao_id, conteudo, publicado').eq('token', token).maybeSingle();
  if (!feedback?.publicado) notFound();
  const { data: submissao } = await db().from('submissoes').select('prova_id, aluno_id').eq('id', feedback.submissao_id).single();
  if(!submissao)notFound();
  if(user.papel==='aluno'){
    const {data:owner}=await db().from('alunos').select('id').eq('id',submissao.aluno_id).eq('email',user.email.toLowerCase()).maybeSingle();
    if(!owner)notFound();
  }else{
    const {data:owner}=await db().from('provas').select('turmas!inner(professor_id)').eq('id',submissao.prova_id).eq('turmas.professor_id',user.id).maybeSingle();
    if(!owner)notFound();
  }
  const [{ data: prova }, { data: aluno }, { data: respostas }] = await Promise.all([
    db().from('provas').select('titulo, barema').eq('id', submissao!.prova_id).single(),
    db().from('alunos').select('nome').eq('id', submissao!.aluno_id).maybeSingle(),
    db().from('respostas').select('numero, nota_final, comentario_final').eq('submissao_id', feedback.submissao_id).order('numero'),
  ]);
  const conteudo = feedback.conteudo as FeedbackAluno;
  const valores = new Map<number, number>((prova?.barema?.questoes || []).map((q: BaremaQuestao) => [q.numero, q.valorTotal]));
  const nota = (respostas || []).reduce((s, r) => s + Number(r.nota_final ?? 0), 0);
  const total = [...valores.values()].reduce((s, v) => s + v, 0);

  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>DEVOLUTIVA DA PROVA</p>
      <h1>{prova?.titulo}</h1>
      <p className={styles.muted}>{aluno?.nome || 'Aluno'}</p>
      <div className={styles.score}><strong>{fmt(nota)}</strong><span>de {fmt(total)} pontos</span></div>
    </header>
    <section className={styles.card}><p>{conteudo.resumo}</p></section>
    {conteudo.questoes.map(q => {
      const r = respostas?.find(x => x.numero === q.numero);
      return <section key={q.numero} className={styles.card}>
        <div className={styles.questionTop}><h2>Questão {q.numero}</h2><span className={styles.pill}>{fmt(Number(r?.nota_final ?? 0))} / {fmt(valores.get(q.numero) ?? 0)}</span></div>
        {r?.comentario_final && <p className={styles.teacher}><strong>Comentário do professor:</strong> {r.comentario_final}</p>}
        {q.acertos && <p><strong>O que você fez bem:</strong> {q.acertos}</p>}
        {q.erro && <p><strong>Onde errou:</strong> {q.erro}</p>}
        {q.porque && <p><strong>Por quê:</strong> {q.porque}</p>}
        {q.dica && <p><strong>Dica:</strong> {q.dica}</p>}
        {q.exercicios.length > 0 && <div className={styles.exercises}><strong>Para praticar</strong>
          <ol>{q.exercicios.map((e, i) => <li key={i}>{e.enunciado}<details><summary>Ver resposta</summary>{e.resposta}</details></li>)}</ol></div>}
      </section>;
    })}
    {conteudo.proximosPassos.length > 0 && <section className={styles.card}><h2>Próximos passos</h2><ol>{conteudo.proximosPassos.map((p, i) => <li key={i}>{p}</li>)}</ol></section>}
    <p className={styles.footer}>Correção feita pelo seu professor, com apoio de IA. Em caso de dúvida, fale com ele.</p>
  </main>;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<main className={styles.page}><p className={styles.muted}>Carregando sua devolutiva…</p></main>}>
    <Devolutiva params={params} />
  </Suspense>;
}
