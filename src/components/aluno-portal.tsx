'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { ProvaDoAluno, SituacaoProva, TurmaDoAluno } from '@/lib/aluno/portal';
import styles from './aluno-portal.module.css';

const situacoes: Record<SituacaoProva, { rotulo: string; tom: string }> = {
  aguardando_envio: { rotulo: 'Envio pendente', tom: styles.amber },
  enviada: { rotulo: 'Enviada', tom: styles.green },
  em_correcao: { rotulo: 'Em correção', tom: styles.purple },
  devolutiva: { rotulo: 'Devolutiva disponível', tom: styles.green },
  encerrada: { rotulo: 'Correção liberada', tom: styles.neutral },
  prazo_encerrado: { rotulo: 'Prazo encerrado', tom: styles.neutral },
};

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

const data = (iso: string | null, comHora = false) => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleString('pt-BR', comHora ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'long' });
};

function CartaoProva({ prova }: { prova: ProvaDoAluno }) {
  const s = situacoes[prova.situacao];
  const progresso = prova.questoes ? `${prova.questoesEnviadas} de ${prova.questoes} questões com foto` : null;
  return <article className={styles.prova}>
    <div className={styles.provaTopo}>
      <div>
        <h3>{prova.titulo}</h3>
        <p className={styles.muted}>
          {prova.data && <>Aplicada em {data(prova.data)}</>}
          {prova.prazo && <> · Envio até {data(prova.prazo, true)}</>}
          {progresso && <> · {progresso}</>}
        </p>
      </div>
      <span className={`${styles.badge} ${s.tom}`}>{s.rotulo}</span>
    </div>
    {prova.corrigidas > 0 && <div className={styles.nota}>
      <strong>{fmt(prova.pontos)}<span> / {fmt(prova.pontosPossiveis)}</span></strong>
      <p>{prova.questoes && prova.corrigidas < prova.questoes ? `${prova.corrigidas} de ${prova.questoes} questões corrigidas até agora. Abra a prova para ver a nota e o comentário de cada uma.` : 'Todas as questões corrigidas. Abra a prova para ver a nota e o comentário de cada uma.'}</p>
    </div>}
    {prova.envio && !prova.questoes && <p className={styles.envio}>Você enviou {prova.envio.arquivos.join(", ") || "sua prova"} em {data(prova.envio.enviadoEm, true)}.</p>}
    <div className={styles.acoes}>
      {prova.devolutiva && <Link className={styles.botao} href={`/aluno/${prova.devolutiva}`}>Ver minha nota e devolutiva</Link>}
      <Link className={prova.devolutiva ? styles.botaoSecundario : styles.botao} href={`/aluno/provas/${prova.id}`}>{prova.podeEnviar ? (prova.envio ? "Abrir prova e revisar envio" : "Abrir prova e enviar respostas") : "Abrir prova"}</Link>
    </div>
  </article>;
}

export default function AlunoPortal({ nome, email, turmas }: { nome: string; email: string; turmas: TurmaDoAluno[] }) {
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? '');
  const turma = turmas.find(t => t.id === turmaId);
  const primeiroNome = nome.split(' ')[0];

  if (!turmas.length) return <main className={styles.page}>
    <header className={styles.header}><p className={styles.eyebrow}>ÁREA DO ALUNO</p><h1>Olá, {primeiroNome}.</h1></header>
    <section className={styles.vazio}>
      <h2>Você ainda não está em nenhuma turma.</h2>
      <p>Peça ao seu professor para cadastrar você na turma usando o e-mail <strong>{email}</strong>. Depois, recarregue esta página.</p>
    </section>
  </main>;

  const grupos: { titulo: string; filtro: (p: ProvaDoAluno) => boolean }[] = [
    { titulo: 'Para enviar', filtro: p => p.situacao === 'aguardando_envio' },
    { titulo: 'Enviadas', filtro: p => p.situacao === 'enviada' || p.situacao === 'em_correcao' },
    { titulo: 'Corrigidas', filtro: p => p.situacao === 'devolutiva' || p.situacao === 'encerrada' },
    { titulo: 'Encerradas sem envio', filtro: p => p.situacao === 'prazo_encerrado' },
  ];
  const pendentes = turma?.provas.filter(p => p.situacao === 'aguardando_envio').length ?? 0;

  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.eyebrow}>ÁREA DO ALUNO</p>
      <h1>Olá, {primeiroNome}.</h1>
      <p className={styles.muted}>Escolha a turma para ver as provas, enviar suas respostas e acompanhar as devolutivas.</p>
    </header>

    <nav className={styles.turmas} aria-label="Minhas turmas">
      {turmas.map(t => {
        const pend = t.provas.filter(p => p.situacao === 'aguardando_envio').length;
        return <button key={t.id} className={t.id === turmaId ? `${styles.turma} ${styles.ativa}` : styles.turma} aria-pressed={t.id === turmaId} onClick={() => setTurmaId(t.id)}>
          <strong>{t.nome}</strong>
          <span>{[t.disciplina, t.turno].filter(Boolean).join(' · ')}</span>
          {pend > 0 && <span className={`${styles.badge} ${styles.amber}`}>{pend} para enviar</span>}
        </button>;
      })}
    </nav>

    {turma && <>
      <section className={styles.resumo}>
        <div><small>PROFESSOR</small><strong>{turma.professor}</strong></div>
        <div><small>DISCIPLINA</small><strong>{turma.disciplina || '—'}</strong></div>
        <div><small>PROVAS PARA ENVIAR</small><strong>{pendentes}</strong></div>
      </section>
      {!turma.provas.length && <section className={styles.vazio}><p>Ainda não há provas liberadas nesta turma.</p></section>}
      {grupos.map(g => {
        const lista = turma.provas.filter(g.filtro);
        if (!lista.length) return null;
        return <section key={g.titulo} className={styles.grupo}>
          <h2>{g.titulo} <span className={styles.contagem}>{lista.length}</span></h2>
          {lista.map(p => <CartaoProva key={p.id} prova={p} />)}
        </section>;
      })}
    </>}
  </main>;
}
