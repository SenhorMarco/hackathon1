'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnaliseProva, Barema, CorrecaoQuestao } from '@/lib/ai/schemas';
import type { Grupo, Resposta, Submissao } from '@/lib/db/types';

type SubmissaoResumo = Pick<Submissao, 'id' | 'aluno_id' | 'status' | 'erro' | 'nome_lido' | 'arquivo_paths' | 'arquivo_nomes'>;
type FeedbackResumo = { submissao_id: string; token: string; publicado: boolean };
type Revisao = {
  status: string; analise: AnaliseProva | null; barema: Barema | null;
  submissoes: SubmissaoResumo[]; respostas: Resposta[]; grupos: Grupo[];
  alunos: { id: string; nome: string }[]; feedbacks: FeedbackResumo[];
};

const categorias: Record<Grupo['categoria'], { rotulo: string; tom: string }> = {
  correto: { rotulo: 'Correta', tom: 'green' },
  alternativo_valido: { rotulo: 'Solução alternativa', tom: 'purple' },
  parcial: { rotulo: 'Parcial', tom: 'amber' },
  erro: { rotulo: 'Erro', tom: 'red' },
  em_branco: { rotulo: 'Em branco', tom: 'neutral' },
};
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

export default function CorrectionReview({ examId }: { examId: string }) {
  const base = `/api/exams/${examId}`;
  const [dados, setDados] = useState<Revisao | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [progresso, setProgresso] = useState('');
  const [numero, setNumero] = useState<number | null>(null);
  const [edicao, setEdicao] = useState<Record<string, { nota: string; comentario: string }>>({});
  const [aberto, setAberto] = useState<string | null>(null);
  const ocupado = useRef(false);
  const [busy, setBusy] = useState(false);

  const aplicar = useCallback((data: Revisao) => {
    setDados(data);
    setNumero(atual => atual ?? data.barema?.questoes[0]?.numero ?? null);
  }, []);
  const carregar = useCallback(async () => aplicar(await api(`${base}/review`)), [base, aplicar]);
  useEffect(() => {
    let ativo = true;
    api(`${base}/review`).then(data => { if (ativo) aplicar(data); }, e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [base, aplicar]);

  async function tarefa(fn: () => Promise<void>) {
    if (ocupado.current) return;
    ocupado.current = true; setBusy(true); setErro(''); setAviso('');
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : 'Falha inesperada.'); }
    finally { setProgresso(''); ocupado.current = false; setBusy(false); await carregar().catch(() => {}); }
  }

  if (!dados) return <section aria-busy="true">{erro ? <p className="form-error" role="alert">{erro}</p> : <p role="status">Carregando correção…</p>}</section>;

  const nomeAluno = (id: string | null) => dados.alunos.find(a => a.id === id)?.nome || 'Aluno sem confirmação';
  const confirmadas = dados.submissoes.filter(s => s.aluno_id);
  const semAluno = dados.submissoes.length - confirmadas.length;
  const pendentes = confirmadas.filter(s => s.status !== 'corrigida');
  const liberada = dados.status === 'corrigida';
  const questoes = dados.barema?.questoes || [];
  const questao = questoes.find(q => q.numero === numero);
  const referencia = dados.analise?.questoes.find(q => q.numero === numero);
  const gruposDaQuestao = dados.grupos.filter(g => g.numero === numero);
  const respostasDaQuestao = dados.respostas.filter(r => r.numero === numero);
  const semGrupo = questoes.filter(q => dados.respostas.some(r => r.numero === q.numero && !r.grupo_id));
  const aprovadasTodas = dados.respostas.length > 0 && dados.respostas.every(r => r.nota_final !== null);
  const semDevolutiva = confirmadas.filter(s => !dados.feedbacks.some(f => f.submissao_id === s.id));

  const corrigir = (lista: SubmissaoResumo[]) => tarefa(async () => {
    const falhas: string[] = [];
    for (const [i, s] of lista.entries()) {
      setProgresso(`Corrigindo a prova de ${nomeAluno(s.aluno_id)} (${i + 1} de ${lista.length})… pode levar até um minuto por prova.`);
      try { await api(`${base}/submissions/${s.id}/correct`, { method: 'POST' }); }
      catch (e) { falhas.push(`${nomeAluno(s.aluno_id)}: ${e instanceof Error ? e.message : 'falha'}`); }
    }
    if (falhas.length) throw new Error(`Algumas provas não foram corrigidas. ${falhas.join(' · ')}`);
    setAviso('Pré-correção concluída. Agora agrupe as respostas.');
  });

  const agrupar = (nums: number[]) => tarefa(async () => {
    const alertas: string[] = [];
    for (const [i, n] of nums.entries()) {
      setProgresso(`Agrupando respostas da questão ${n} (${i + 1} de ${nums.length})…`);
      const r = await api(`${base}/groups`, { method: 'POST', body: JSON.stringify({ numero: n }) });
      if (r.alerta) alertas.push(`Q${n}`);
    }
    setAviso(alertas.length ? `Grupos criados. Confira com atenção: ${alertas.join(', ')}.` : 'Grupos criados. Revise e aprove cada grupo.');
  });

  const aprovarGrupo = (g: Grupo) => tarefa(async () => {
    const e = edicao[g.id];
    const nota = Number((e?.nota ?? String(g.nota_final ?? g.nota_sugerida)).replace(',', '.'));
    if (!Number.isFinite(nota)) throw new Error('Informe uma nota válida.');
    await api(`${base}/groups/${g.id}`, { method: 'PATCH', body: JSON.stringify({ nota, comentario: e?.comentario ?? g.comentario_final ?? g.comentario_sugerido }) });
    setAviso(`Grupo "${g.rotulo}" aprovado.`);
  });

  const ajustarResposta = (r: Resposta) => tarefa(async () => {
    const e = edicao[r.id];
    const nota = Number((e?.nota ?? '').replace(',', '.'));
    if (!e || !Number.isFinite(nota)) throw new Error('Informe a nota do ajuste.');
    await api(`${base}/answers/${r.id}`, { method: 'PATCH', body: JSON.stringify({ nota, comentario: e.comentario ?? r.comentario_final ?? '' }) });
    setAviso('Ajuste salvo para esta resposta.');
  });

  const gerarDevolutivas = (lista: SubmissaoResumo[]) => tarefa(async () => {
    for (const [i, s] of lista.entries()) {
      setProgresso(`Escrevendo a devolutiva de ${nomeAluno(s.aluno_id)} (${i + 1} de ${lista.length})…`);
      await api(`${base}/submissions/${s.id}/feedback`, { method: 'POST' });
    }
    setAviso('Devolutivas prontas. Libere quando quiser.');
  });

  const liberar = () => tarefa(async () => {
    await api(`${base}/release`, { method: 'POST' });
    setAviso('Correções liberadas. Envie a cada aluno o link da devolutiva.');
  });

  const campo = (id: string, chave: 'nota' | 'comentario', padrao: string) => edicao[id]?.[chave] ?? padrao;
  const editar = (id: string, chave: 'nota' | 'comentario', valor: string, padrao: { nota: string; comentario: string }) =>
    setEdicao(atual => ({ ...atual, [id]: { ...padrao, ...atual[id], [chave]: valor } }));

  return <section aria-busy={busy}>
    <div className="section-heading"><div><h2>Respostas parecidas. Uma revisão mais clara.</h2><p>A IA pré-corrige e agrupa. Você aprova cada grupo, ajusta o que precisar e libera.</p></div></div>
    {erro && <p className="form-error" role="alert">{erro}</p>}
    {aviso && <p className="notice compact" role="status">{aviso}</p>}
    {progresso && <p className="notice compact" role="status">{progresso}</p>}

    <div className="panel submission-list">
      <h3>1. Pré-correção · {confirmadas.length - pendentes.length} de {confirmadas.length} provas corrigidas</h3>
      {semAluno > 0 && <p className="muted">{semAluno} prova(s) sem aluno confirmado na aba Respostas não entram na correção.</p>}
      {confirmadas.map(s => <div key={s.id} className="submission-row"><div>
        <strong>{nomeAluno(s.aluno_id)}</strong>
        <p className="muted">{s.status === 'corrigida' ? 'Corrigida' : s.status === 'corrigindo' ? 'Em correção' : s.status === 'erro' ? 'Falhou' : 'Aguardando correção'}</p>
        {s.erro && <p className={s.status === 'erro' ? 'form-error' : 'muted'}>{s.status === 'erro' ? s.erro : `Pontos para revisar: ${s.erro}`}</p>}
      </div>{!liberada && <button className="button secondary" disabled={busy} onClick={() => corrigir([s])}>{s.status === 'corrigida' ? 'Corrigir de novo' : 'Corrigir'}</button>}</div>)}
      {!liberada && pendentes.length > 0 && <button className="button primary" disabled={busy} onClick={() => corrigir(pendentes)}>Corrigir {pendentes.length} prova(s) com IA</button>}
    </div>

    {dados.respostas.length > 0 && <div className="panel submission-list">
      <h3>2. Agrupamento</h3>
      <p className="muted">{semGrupo.length ? `Questões com respostas ainda sem grupo: ${semGrupo.map(q => `Q${q.numero}`).join(', ')}.` : 'Todas as respostas estão agrupadas.'}</p>
      {!liberada && <button className="button primary" disabled={busy} onClick={() => agrupar((semGrupo.length ? semGrupo : questoes).map(q => q.numero))}>{semGrupo.length ? 'Agrupar respostas' : 'Refazer todos os grupos'}</button>}
    </div>}

    {gruposDaQuestao.length > 0 || respostasDaQuestao.length > 0 ? <>
      <div className="correction-toolbar"><label>Questão<select value={numero ?? ''} onChange={e => setNumero(Number(e.target.value))}>{questoes.map(q => <option key={q.numero} value={q.numero}>Q{q.numero} · {dados.analise?.questoes.find(a => a.numero === q.numero)?.conteudo}</option>)}</select></label>
        {!liberada && numero !== null && <button className="button secondary" disabled={busy} onClick={() => agrupar([numero])}>Refazer grupos desta questão</button>}</div>
      {referencia && <div className="solution-reference"><strong>Referência · {fmt(questao?.valorTotal ?? 0)} pontos</strong><p>{referencia.resolucao.respostaFinal}</p></div>}
      {gruposDaQuestao.map(g => {
        const respostas = respostasDaQuestao.filter(r => r.grupo_id === g.id);
        const padrao = { nota: String(g.nota_final ?? g.nota_sugerida), comentario: g.comentario_final ?? g.comentario_sugerido };
        const cat = categorias[g.categoria];
        return <div className="panel review-card" key={g.id}>
          <div className="review-head"><div><strong>{g.rotulo}</strong><p className="muted">{g.descricao} · {respostas.length} resposta(s)</p></div>
            <span className={`badge ${g.aprovado ? 'green' : cat.tom}`}>{g.aprovado ? 'Aprovado' : cat.rotulo}</span></div>
          {g.criterio_sugerido && <div className="alternative"><div><strong>Critério sugerido para este caminho</strong><p>{g.criterio_sugerido.descricao} ({fmt(g.criterio_sugerido.pontos)} pt)</p></div></div>}
          <fieldset disabled={busy || liberada} className="exam-editor">
            <label>Nota do grupo (de 0 a {fmt(questao?.valorTotal ?? 0)})<input inputMode="decimal" value={campo(g.id, 'nota', padrao.nota)} onChange={e => editar(g.id, 'nota', e.target.value, padrao)} /></label>
            <label>Comentário para os alunos<textarea value={campo(g.id, 'comentario', padrao.comentario)} onChange={e => editar(g.id, 'comentario', e.target.value, padrao)} /></label>
            <button className="button primary" onClick={() => aprovarGrupo(g)}>{g.aprovado ? 'Salvar alterações do grupo' : 'Aprovar grupo'}</button>{' '}
            <button type="button" className="button secondary" onClick={() => setAberto(aberto === g.id ? null : g.id)}>{aberto === g.id ? 'Ocultar respostas' : 'Ver respostas'}</button>
          </fieldset>
          {aberto === g.id && respostas.map(r => {
            const c = r.correcao as CorrecaoQuestao;
            const sub = dados.submissoes.find(s => s.id === r.submissao_id);
            const pR = { nota: String(r.nota_final ?? c.notaSugerida), comentario: r.comentario_final ?? '' };
            return <div key={r.id} className="submission-row"><div className="submission-content">
              <strong>{nomeAluno(sub?.aluno_id ?? null)}</strong>{' '}
              {sub?.arquivo_paths.map((_, i) => <a key={i} className="text-button file-link" href={`${base}/submissions/${r.submissao_id}/file?index=${i}`} target="_blank" rel="noopener noreferrer">{sub.arquivo_nomes[i] || `Página ${i + 1}`}</a>)}
              {!c.legivel && <p className="form-error">A IA não conseguiu ler esta resposta com segurança. Confira o arquivo.</p>}
              <p><strong>Transcrição:</strong> {c.transcricao || '—'}</p>
              <p><strong>Método:</strong> {c.descricaoMetodo}</p>
              <ol>{c.passos.map((p, i) => <li key={i}>{p.correto ? '✓' : '✗'} {p.descricao} <span className="muted">— {p.comentario}</span></li>)}</ol>
              <p className="muted">{c.justificativa} · Nota sugerida: {fmt(c.notaSugerida)}{r.nota_final !== null ? ` · Nota atual: ${fmt(Number(r.nota_final))}` : ''}</p>
              {!liberada && <fieldset disabled={busy} className="exam-editor">
                <label>Ajustar só esta resposta<input inputMode="decimal" value={campo(r.id, 'nota', pR.nota)} onChange={e => editar(r.id, 'nota', e.target.value, pR)} /></label>
                <label>Comentário específico<textarea value={campo(r.id, 'comentario', pR.comentario)} onChange={e => editar(r.id, 'comentario', e.target.value, pR)} /></label>
                <button className="button secondary" onClick={() => ajustarResposta(r)}>Salvar ajuste</button>
              </fieldset>}
            </div></div>;
          })}
        </div>;
      })}
    </> : null}

    {dados.respostas.length > 0 && <div className="panel submission-list">
      <h3>3. Devolutivas e liberação</h3>
      {!aprovadasTodas && <p className="muted">Aprove todos os grupos de todas as questões para gerar as devolutivas.</p>}
      {aprovadasTodas && !liberada && <>
        <p className="muted">{semDevolutiva.length ? `${semDevolutiva.length} aluno(s) sem devolutiva.` : 'Todas as devolutivas estão prontas.'}</p>
        <button className="button secondary" disabled={busy} onClick={() => gerarDevolutivas(semDevolutiva.length ? semDevolutiva : confirmadas)}>{semDevolutiva.length ? 'Gerar devolutivas com IA' : 'Refazer devolutivas'}</button>{' '}
        <button className="button primary" disabled={busy || semDevolutiva.length > 0} onClick={liberar}>Liberar correções</button>
      </>}
      {liberada && <>
        <p>Correções liberadas. Links das devolutivas:</p>
        {confirmadas.map(s => { const f = dados.feedbacks.find(x => x.submissao_id === s.id); if (!f) return null;
          const link = `${typeof window === 'undefined' ? '' : window.location.origin}/aluno/${f.token}`;
          return <div key={s.id} className="submission-row"><div><strong>{nomeAluno(s.aluno_id)}</strong><p><a className="text-button" href={link} target="_blank" rel="noopener noreferrer">{link}</a></p></div>
            <button className="button secondary" onClick={() => navigator.clipboard.writeText(link).then(() => setAviso(`Link de ${nomeAluno(s.aluno_id)} copiado.`), () => setAviso(link))}>Copiar link</button></div>; })}
      </>}
    </div>}
  </section>;
}
