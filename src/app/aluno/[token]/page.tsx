import { account } from '@/lib/auth/server';
import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Barema, FeedbackAluno } from '@/lib/ai/schemas';
import { db } from '@/lib/db/server';
import styles from './aluno.module.css';
import AlunoShell from '@/components/aluno-shell';

export const metadata = { title: 'Aula Clara | Sua devolutiva', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

async function Devolutiva({ params }: { params: Promise<{ token: string }> }) {
  // O link pode ser liberado ou retirado de publicação entre duas visitas.
  await connection();
  const user = await account();
  if (!user) redirect('/login');
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const { data: feedback, error: feedbackError } = await db().from('feedbacks').select('submissao_id, conteudo').eq('token', token).eq('publicado', true).maybeSingle();
  if (feedbackError) throw new Error('Não foi possível consultar a devolutiva.');
  if (!feedback) notFound();
  const { data: submissao, error: submissaoError } = await db().from('submissoes').select('prova_id, aluno_id').eq('id', feedback.submissao_id).maybeSingle();
  if (submissaoError) throw new Error('Não foi possível consultar a prova do aluno.');
  if (!submissao?.aluno_id) notFound();
  if (user.papel === 'aluno') {
    const { data: owner, error } = await db().from('alunos').select('id').eq('id', submissao.aluno_id).eq('email', user.email.toLowerCase()).maybeSingle();
    if (error) throw error;
    if (!owner) notFound();
  } else {
    const { data: owner, error } = await db().from('provas').select('turmas!inner(professor_id)').eq('id', submissao.prova_id).eq('turmas.professor_id', user.id).maybeSingle();
    if (error) throw error;
    if (!owner) notFound();
  }
  const [provaResult, alunoResult, respostasResult] = await Promise.all([
    db().from('provas').select('titulo, barema, status').eq('id', submissao.prova_id).maybeSingle(),
    db().from('alunos').select('nome').eq('id', submissao.aluno_id).maybeSingle(),
    db().from('respostas').select('numero, nota_final, comentario_final').eq('submissao_id', feedback.submissao_id).order('numero'),
  ]);
  if ([provaResult, alunoResult, respostasResult].some(result => result.error)) throw new Error('Não foi possível carregar a correção.');
  const { data: prova } = provaResult;
  const { data: aluno } = alunoResult;
  const respostas = respostasResult.data || [];
  if (!prova || !aluno || prova.status !== 'corrigida') notFound();
  const parsedFeedback = FeedbackAluno.safeParse(feedback.conteudo);
  const parsedBarema = Barema.safeParse(prova.barema);
  if (!parsedFeedback.success || !parsedBarema.success) throw new Error('A devolutiva salva está incompleta.');
  const conteudo = parsedFeedback.data;
  const valores = new Map(parsedBarema.data.questoes.map(q => [q.numero, q.valorTotal]));
  // Uma nota ainda não aprovada não pode aparecer como zero para o aluno.
  if (!valores.size || respostas.length !== valores.size || conteudo.questoes.length !== valores.size ||
    new Set(conteudo.questoes.map(q => q.numero)).size !== valores.size ||
    conteudo.questoes.some(q => !valores.has(q.numero)) ||
    respostas.some(r => !valores.has(r.numero) || r.nota_final === null || !Number.isFinite(Number(r.nota_final)))) {
    throw new Error('A correção ainda não está completa.');
  }
  const nota = respostas.reduce((s, r) => s + Number(r.nota_final), 0);
  const total = [...valores.values()].reduce((s, v) => s + v, 0);

  return <AlunoShell name={user.nome} title="Devolutiva" professor={user.papel === 'professor'}><main className={styles.page}>
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
  </main></AlunoShell>;
}

export default function Page({ params }: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={<main className={styles.page}><p className={styles.muted}>Carregando sua devolutiva…</p></main>}>
    <Devolutiva params={params} />
  </Suspense>;
}
