'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ProvaDoAluno, SituacaoProva, TurmaDoAluno } from '@/lib/aluno/portal';
import { PROVA_ACCEPT, validateProva } from '@/lib/uploads/validation';
import styles from './aluno-portal.module.css';

const situacoes: Record<SituacaoProva, { rotulo: string; tom: string }> = {
  aguardando_envio: { rotulo: 'Envio pendente', tom: styles.amber },
  enviada: { rotulo: 'Enviada', tom: styles.green },
  em_correcao: { rotulo: 'Em correção', tom: styles.purple },
  devolutiva: { rotulo: 'Devolutiva disponível', tom: styles.green },
  encerrada: { rotulo: 'Correção liberada', tom: styles.neutral },
  prazo_encerrado: { rotulo: 'Prazo encerrado', tom: styles.neutral },
};

const data = (iso: string | null, comHora = false) => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleString('pt-BR', comHora ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'long' });
};

async function pedir(url: string, init: RequestInit) {
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir o envio.');
  return corpo;
}

function CartaoProva({ prova }: { prova: ProvaDoAluno }) {
  const router = useRouter();
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState('');
  const [status, setStatus] = useState('');
  const [enviando, setEnviando] = useState(false);
  const s = situacoes[prova.situacao];

  function escolher(lista: File[]) {
    setErro(''); setStatus('');
    if (!lista.length) return setArquivos([]);
    const invalido = lista.map(validateProva).find(Boolean);
    const temPdf = lista.some(f => /\.pdf$/i.test(f.name));
    if (invalido) { setErro(invalido); return setArquivos([]); }
    if (temPdf && lista.length > 1) { setErro('Envie um único PDF ou até dez fotos das páginas.'); return setArquivos([]); }
    if (lista.length > 10) { setErro('Envie no máximo dez fotos.'); return setArquivos([]); }
    setArquivos(lista);
  }

  async function enviar() {
    if (!arquivos.length || enviando) return;
    setEnviando(true); setErro(''); setStatus('Preparando o envio…');
    try {
      const metadados = arquivos.map(f => ({ name: f.name, type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : /\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg'), size: f.size }));
      const base = `/api/aluno/provas/${prova.id}/envio`;
      const { uploads, ticket } = await pedir(base, { method: 'PUT', body: JSON.stringify({ files: metadados }) });
      for (const [i, f] of arquivos.entries()) {
        setStatus(`Enviando ${arquivos.length > 1 ? `página ${i + 1} de ${arquivos.length}` : 'o arquivo'}…`);
        const r = await fetch(uploads[i].url, { method: 'PUT', headers: { 'Content-Type': metadados[i].type }, body: f });
        if (!r.ok) throw new Error('O envio do arquivo falhou. Confira a conexão e tente de novo.');
      }
      setStatus('Confirmando…');
      const resultado = await pedir(base, { method: 'POST', body: JSON.stringify({ ticket }) });
      setArquivos([]);
      setStatus(resultado.substituido ? 'Envio substituído. O professor recebeu a nova versão.' : 'Prova enviada! Ela já aparece para o seu professor.');
      router.refresh();
    } catch (e) {
      setStatus(''); setErro(e instanceof Error ? e.message : 'Falha no envio.');
    } finally { setEnviando(false); }
  }

  return <article className={styles.prova}>
    <div className={styles.provaTopo}>
      <div>
        <h3>{prova.titulo}</h3>
        <p className={styles.muted}>
          {prova.data && <>Aplicada em {data(prova.data)}</>}
          {prova.prazo && <> · Envio até {data(prova.prazo, true)}</>}
        </p>
      </div>
      <span className={`${styles.badge} ${s.tom}`}>{s.rotulo}</span>
    </div>

    {prova.envio && <p className={styles.envio}>Você enviou {prova.envio.arquivos.join(', ') || 'sua prova'} em {data(prova.envio.enviadoEm, true)}.</p>}
    {prova.devolutiva && <Link className={styles.botao} href={`/aluno/${prova.devolutiva}`}>Ver minha nota e devolutiva</Link>}

    {prova.podeEnviar && <div className={styles.upload}>
      <label className={styles.arquivo}>
        <input type="file" accept={PROVA_ACCEPT} multiple disabled={enviando} onChange={e => { escolher(Array.from(e.target.files || [])); e.target.value = ''; }} />
        <strong>{arquivos.length ? arquivos.map(f => f.name).join(', ') : prova.envio ? 'Escolher arquivo para substituir o envio' : 'Escolher arquivo da prova'}</strong>
        <small>Um PDF ou até dez fotos das páginas, em ordem · até 20 MB cada</small>
      </label>
      {prova.envio && arquivos.length > 0 && <p className={styles.muted}>A nova versão substitui a anterior. Se o professor já tiver começado a correção, ela será refeita.</p>}
      <button className={styles.botao} disabled={!arquivos.length || enviando} onClick={enviar}>{enviando ? 'Enviando…' : prova.envio ? 'Substituir envio' : 'Enviar prova'}</button>
    </div>}

    {status && <p className={styles.ok} role="status">{status}</p>}
    {erro && <p className={styles.erro} role="alert">{erro}</p>}
  </article>;
}

export default function AlunoPortal({ nome, email, turmas }: { nome: string; email: string; turmas: TurmaDoAluno[] }) {
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? '');
  const turma = turmas.find(t => t.id === turmaId);
  const primeiroNome = nome.split(' ')[0];

  if (!turmas.length) return <main className={styles.page}>
    <header className={styles.header}><p className={styles.eyebrow}>MEU APRENDIZADO</p><h1>Olá, {primeiroNome}.</h1></header>
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
      <p className={styles.eyebrow}>MEU APRENDIZADO</p>
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
