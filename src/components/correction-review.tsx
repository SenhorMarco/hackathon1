'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnaliseProva, Barema } from '@/lib/ai/schemas';
import type { Grupo, Resposta, Submissao } from '@/lib/db/types';
import { csvCell, finalTotal, isValidated, reviewIssues } from '@/lib/review';
import FeedbackEditor from './feedback-editor';
import ManualAnswer from './manual-answer';

type Submission = Pick<Submissao, 'id' | 'aluno_id' | 'status' | 'erro' | 'nome_lido' | 'arquivo_paths' | 'arquivo_nomes'>;
type Review = {
  status: string; analise: AnaliseProva | null; barema: Barema | null;
  submissoes: Submission[]; respostas: Resposta[]; grupos: Grupo[];
  alunos: { id: string; nome: string }[];
  feedbacks: { submissao_id: string; token: string; publicado: boolean; atualizado: boolean; revisado: boolean }[];
};
type Draft = { nota: string; comentario: string; conferida: boolean };
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

export default function CorrectionReview({ examId, resultsOnly = false, onReleased }: { examId: string; resultsOnly?: boolean; onReleased?: () => void }) {
  const base = `/api/exams/${examId}`;
  const [data, setData] = useState<Review | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState('');
  const [number, setNumber] = useState<number | null>(null);
  const [group, setGroup] = useState('all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [associations, setAssociations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => setData(await api(`${base}/review`)), [base]);
  useEffect(() => {
    let active = true;
    api(`${base}/review`).then(result => { if (active) setData(result); }, e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base]);

  async function task(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a operação.'); await load().catch(() => {}); }
    finally { setProgress(''); lock.current = false; setBusy(false); }
  }

  if (!data) return <section aria-busy={!error}>{error ? <><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={() => task(load)}>Tentar novamente</button></> : <p role="status">Carregando correção…</p>}</section>;

  const questions = data.barema?.questoes ?? [];
  const current = questions.find(q => q.numero === number) ?? questions[0];
  const reference = data.analise?.questoes.find(q => q.numero === current?.numero);
  const released = data.status === 'corrigida';
  const confirmed = data.submissoes.filter(s => s.aluno_id);
  const pending = confirmed.filter(s => s.status !== 'corrigida');
  const issues = reviewIssues(data.barema, data.submissoes, data.respostas);
  const missingFeedback = confirmed.filter(s => !data.feedbacks.some(f => f.submissao_id === s.id && f.atualizado));
  const unreviewedFeedback = confirmed.filter(s => !data.feedbacks.some(f => f.submissao_id === s.id && f.revisado));
  const unidentified = data.respostas.filter(answer => !questions.some(q => q.numero === answer.numero));
  const name = (id: string | null) => data.alunos.find(a => a.id === id)?.nome || 'Aluno sem confirmação';
  const groups = data.grupos.filter(g => g.numero === current?.numero);
  const answers = data.respostas.filter(r => r.numero === current?.numero);
  const validated = data.respostas.filter(r => isValidated(r, questions.find(q => q.numero === r.numero)?.valorTotal ?? -1)).length;
  const visible = answers.filter(r => (group === 'all' || (group === 'none' ? !groups.some(g => g.id === r.grupo_id) : r.grupo_id === group)) && (!pendingOnly || !isValidated(r, current?.valorTotal ?? 0)));
  const maximum = questions.reduce((sum, q) => sum + q.valorTotal, 0);
  const totals = confirmed.map(s => finalTotal(data.barema, s, data.respostas)).filter((total): total is number => total !== null);

  const correct = (submissions: Submission[]) => task(async () => {
    const failures: string[] = [];
    for (const [i, submission] of submissions.entries()) {
      setProgress(`Pré-corrigindo ${name(submission.aluno_id)} · ${i + 1} de ${submissions.length}. Aguarde a análise da IA.`);
      try { await api(`${base}/submissions/${submission.id}/correct`, { method: 'POST' }); }
      catch (e) { failures.push(`${name(submission.aluno_id)}: ${e instanceof Error ? e.message : 'falha'}`); }
    }
    setDrafts({});
    if (failures.length) throw new Error(failures.join(' · '));
    setNotice('Sugestões prontas. Confira cada resposta e valide a nota e o feedback.');
  });

  const cluster = () => task(async () => {
    if (!current) return;
    setProgress(`Organizando as respostas da Q${current.numero} por abordagem…`);
    const result = await api(`${base}/groups`, { method: 'POST', body: JSON.stringify({ numero: current.numero }) });
    setGroup('all');
    setNotice(result.alerta ? 'Grupos criados com alertas. Confira as respostas individualmente.' : 'Abordagens organizadas. A validação continua individual.');
  });

  const save = (answer: Resposta, draft: Draft) => task(async () => {
    const score = Number(draft.nota.replace(',', '.'));
    if (!draft.nota.trim() || !Number.isFinite(score) || score < 0 || score > (current?.valorTotal ?? 0)) throw new Error(`Informe uma nota entre 0 e ${fmt(current?.valorTotal ?? 0)}.`);
    if (!draft.comentario.trim()) throw new Error('Revise e preencha o feedback desta resposta.');
    if (!answer.correcao.legivel && !draft.conferida) throw new Error('Confira a resposta no arquivo original antes de validar a leitura.');
    await api(`${base}/answers/${answer.id}`, { method: 'PATCH', body: JSON.stringify({ nota: score, comentario: draft.comentario.trim(), leituraConferida: draft.conferida }) });
    setDrafts(previous => { const next = { ...previous }; delete next[answer.id]; return next; });
    setNotice('Resposta validada. As demais respostas mantêm suas próprias notas e feedbacks.');
  });

  const feedback = () => task(async () => {
    const list = missingFeedback.length ? missingFeedback : confirmed;
    for (const [i, submission] of list.entries()) {
      setProgress(`Preparando devolutiva de ${name(submission.aluno_id)} · ${i + 1} de ${list.length}…`);
      await api(`${base}/submissions/${submission.id}/feedback`, { method: 'POST' });
    }
    setNotice('Devolutivas preparadas a partir das notas e comentários validados. A liberação exige sua confirmação.');
  });

  function exportCsv() {
    const rows = [['Aluno', ...questions.map(q => `Q${q.numero} (validada)`), 'Total validado', 'Situação'], ...data!.submissoes.map(s => {
      const total = finalTotal(data!.barema, s, data!.respostas);
      return [name(s.aluno_id), ...questions.map(q => {
        const answer = data!.respostas.find(r => r.submissao_id === s.id && r.numero === q.numero);
        return isValidated(answer, q.valorTotal) ? fmt(Number(answer!.nota_final)) : 'Pendente';
      }), total === null ? 'Pendente' : fmt(total), total === null ? 'Em revisão' : released ? 'Liberado' : 'Validado · não liberado'];
    })];
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `notas-${examId}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="correction-review" aria-busy={busy}>
    <div className="section-heading"><div><h2>{resultsOnly ? 'Notas e resultados' : 'Cada resposta merece seu olhar.'}</h2><p>{resultsOnly ? 'Notas validadas pelo professor. Questões pendentes não entram no total.' : 'A IA sugere. Você revisa a resposta, ajusta a nota e o feedback e valida individualmente.'}</p></div>{resultsOnly && <button className="button secondary" disabled={!data.submissoes.length} onClick={exportCsv}>Exportar notas validadas</button>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {(notice || progress) && <p className="notice compact" role="status">{progress || notice}</p>}
    <div className="review-summary"><span><strong>{validated}</strong> / {data.submissoes.length * questions.length} respostas validadas</span><span><strong>{totals.length}</strong> / {data.submissoes.length} provas completas</span><span className={`badge ${released ? 'green' : 'amber'}`}>{released ? 'Resultados liberados' : 'Resultados em revisão'}</span></div>
    {!data.submissoes.length && <div className="empty"><h3>Aguardando as provas dos alunos</h3><p>Use a aba Respostas para receber os arquivos e confirmar os alunos.</p></div>}
    {!resultsOnly && <>
      {!!unidentified.length && <div className="panel submission-list"><h3>Pendências de associação · {unidentified.length}</h3><p>Confira o arquivo e indique a questão de cada resposta. Nenhuma nota será validada automaticamente.</p>{unidentified.map(answer => {
        const submission = data.submissoes.find(s => s.id === answer.submissao_id);
        const available = questions.filter(q => !data.respostas.some(r => r.submissao_id === answer.submissao_id && r.numero === q.numero));
        return <article className="review-card" key={answer.id}><h4>{name(submission?.aluno_id ?? null)}</h4><p className="review-transcription">{answer.correcao.transcricao || 'Transcrição não disponível. Confira o arquivo original.'}</p>{submission?.arquivo_paths.map((_, i) => <a key={i} className="text-button" href={`${base}/submissions/${answer.submissao_id}/file?index=${i}`} target="_blank" rel="noopener noreferrer">Abrir {submission.arquivo_nomes[i] || `página ${i + 1}`}</a>)}<label>Questão desta resposta<select aria-label={`Associar resposta de ${name(submission?.aluno_id ?? null)}`} disabled={busy || released} value={associations[answer.id] ?? ''} onChange={event => setAssociations(previous => ({ ...previous, [answer.id]: event.target.value }))}><option value="">Selecione a questão</option>{available.map(q => <option key={q.numero} value={q.numero}>Q{q.numero}</option>)}</select></label><button className="button secondary" disabled={busy || released || !associations[answer.id]} onClick={() => task(async () => { const target = Number(associations[answer.id]); await api(`${base}/answers/${answer.id}/associate`, { method: 'POST', body: JSON.stringify({ numero: target }) }); setNumber(target); setGroup('all'); setNotice('Questão associada. Confira o arquivo e valide a nota e o feedback individualmente.'); })}>Associar questão</button>{!available.length && <p className="form-error">Todas as questões já têm uma resposta. Confira se há leitura duplicada antes de continuar.</p>}</article>;
      })}</div>}
      {!!data.submissoes.length && <details className="panel submission-list" open={pending.length > 0 || confirmed.length !== data.submissoes.length}>
        <summary>Pré-correção · {confirmed.length - pending.length} de {data.submissoes.length} provas analisadas</summary>
        {data.submissoes.map(s => <div key={s.id} className="submission-row"><div><strong>{name(s.aluno_id)}</strong><p>{!s.aluno_id ? 'Confirme o aluno na aba Respostas.' : s.status === 'corrigida' ? 'Sugestões disponíveis para revisão' : s.status === 'erro' ? 'A análise falhou. Tente novamente.' : 'Aguardando pré-correção'}</p>{s.erro && <p className="form-error">{s.erro}</p>}</div>{!released && s.aluno_id && s.status !== 'corrigida' && <button className="button secondary" disabled={busy} onClick={() => correct([s])}>Pré-corrigir</button>}</div>)}
        {!released && pending.length > 0 && <button className="button primary" disabled={busy || !questions.length} onClick={() => correct(pending)}>Pré-corrigir {pending.length} prova(s)</button>}
      </details>}
      {!!questions.length && <>
        <div className="correction-toolbar">
          <label>Questão<select aria-label="Questão" value={current?.numero ?? ''} disabled={busy} onChange={e => { setNumber(Number(e.target.value)); setGroup('all'); }}>{questions.map(q => <option key={q.numero} value={q.numero}>Q{q.numero} · {data.respostas.filter(r => r.numero === q.numero && isValidated(r, q.valorTotal)).length}/{data.submissoes.length} validadas</option>)}</select></label>
          <label>Abordagem<select aria-label="Abordagem" value={group} onChange={e => setGroup(e.target.value)}><option value="all">Todas as abordagens</option><option value="none">Sem grupo</option>{groups.map(g => <option key={g.id} value={g.id}>{g.rotulo}</option>)}</select></label>
          <label className="review-check"><input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} />Somente pendentes</label>
        </div>
        <details className="solution-reference"><summary>Q{current.numero} · Referência e barema · {fmt(current.valorTotal)} pontos</summary><p>{reference?.enunciado}</p><p>{reference?.resolucao.respostaFinal}</p><ul>{current.criterios.map(c => <li key={c.id}>{c.descricao} · {fmt(c.pontos)} pt</li>)}</ul></details>
        {!released && answers.length > 0 && !answers.some(r => r.nota_final !== null) && <div className="submission-actions"><button className="button secondary" disabled={busy} onClick={cluster}>Organizar Q{current.numero} por abordagem</button><p className="muted">Opcional. Você pode revisar respostas sem agrupamento.</p></div>}
        {confirmed.filter(s => !answers.some(r => r.submissao_id === s.id)).map(s => <div className="notice" key={s.id}><div className="submission-content"><p><strong>{name(s.aluno_id)} · Q{current.numero} sem resposta identificada.</strong> Confira o arquivo. A questão permanece pendente; ausência de leitura não é nota zero.</p>{s.arquivo_paths.map((_, i) => <a className="text-button" key={i} href={`${base}/submissions/${s.id}/file?index=${i}`} target="_blank" rel="noopener noreferrer">Abrir {s.arquivo_nomes[i] || `página ${i + 1}`}</a>)}{!released && <ManualAnswer key={`${s.id}-${current.numero}`} examId={examId} submissionId={s.id} number={current.numero} disabled={busy || unidentified.some(answer => answer.submissao_id === s.id)} onSaved={() => { void load().catch(e => setError(e.message)); }} />}</div></div>)}
        {!visible.length && <div className="empty"><h3>{answers.length ? 'Nenhuma resposta neste filtro' : 'Ainda não há respostas para esta questão'}</h3><p>{answers.length ? 'Selecione outra abordagem ou desmarque “Somente pendentes”.' : 'Selecione outra questão ou conclua a pré-correção.'}</p></div>}
        {visible.map(answer => {
          const correction = answer.correcao;
          const submission = data.submissoes.find(s => s.id === answer.submissao_id);
          const approach = groups.find(g => g.id === answer.grupo_id);
          const approved = isValidated(answer, current.valorTotal);
          const draft = drafts[answer.id] ?? { nota: answer.nota_final !== null ? String(answer.nota_final) : correction.legivel && correction.origem !== 'professor' ? String(correction.notaSugerida) : '', comentario: answer.comentario_final ?? correction.justificativa, conferida: approved };
          const change = (value: Partial<Draft>) => setDrafts(previous => ({ ...previous, [answer.id]: { ...draft, ...value } }));
          return <article className="panel review-card" key={answer.id} aria-label={`Resposta de ${name(submission?.aluno_id ?? null)}, Q${answer.numero}`}>
            <div className="review-head"><div><h3>{name(submission?.aluno_id ?? null)}</h3><p className="muted">{approach?.rotulo ?? 'Sem grupo'} · Q{answer.numero}</p></div><span className={`badge ${approved ? 'green' : 'amber'}`}>{drafts[answer.id] ? 'Alterações não salvas' : approved ? 'Validada' : 'Pendente de revisão'}</span></div>
            <div className="submission-actions">{submission?.arquivo_paths.map((_, i) => <a key={i} className="text-button" href={`${base}/submissions/${answer.submissao_id}/file?index=${i}`} target="_blank" rel="noopener noreferrer">Abrir {submission.arquivo_nomes[i] || `página ${i + 1}`}</a>)}</div>
            {!correction.legivel && <p className={approved ? 'muted' : 'form-error'}>{approved ? 'A IA sinalizou leitura incerta. O professor conferiu o arquivo e validou esta resposta.' : 'Leitura incerta. Confira o arquivo original; não atribua zero automaticamente.'}</p>}
            {correction.metodo === 'alternativo' && <div className="alternative"><div><strong>Possível solução alternativa</strong><p>{correction.descricaoMetodo}</p>{approach?.criterio_sugerido && <p>Critério sugerido: {approach.criterio_sugerido.descricao} · {fmt(approach.criterio_sugerido.pontos)} pt. Confira a adequação ao barema antes de validar.</p>}</div></div>}
            <p className="review-transcription"><strong>{correction.origem === 'professor' ? 'Transcrição conferida pelo professor' : 'Transcrição da IA'}</strong><br />{correction.transcricao || 'Não disponível. Confira o arquivo.'}</p>
            {correction.origem !== 'professor' && <details className="review-reasoning"><summary>Análise sugerida pela IA · {fmt(correction.notaSugerida)} / {fmt(current.valorTotal)}</summary><p>{correction.descricaoMetodo}</p><ol>{correction.passos.map((step, i) => <li key={i}>{step.correto ? '✓' : '✗'} {step.descricao} — {step.comentario}</li>)}</ol><p>{correction.justificativa}</p></details>}
            {released ? <div className="notice"><p><strong>Nota validada: {fmt(Number(answer.nota_final))} / {fmt(current.valorTotal)}</strong><br />{answer.comentario_final}</p></div> : <fieldset disabled={busy} className="exam-editor">
              <div className="review-fields"><label>Nota final · máximo {fmt(current.valorTotal)}<input inputMode="decimal" value={draft.nota} onChange={e => change({ nota: e.target.value })} /></label><label>Feedback ao aluno<textarea maxLength={2000} value={draft.comentario} onChange={e => change({ comentario: e.target.value })} /></label></div>
              {!correction.legivel && <label className="review-check"><input type="checkbox" checked={draft.conferida} onChange={e => change({ conferida: e.target.checked })} />Conferi a resposta no arquivo e resolvi a pendência de leitura.</label>}
              <div className="review-footer"><small>A validação se aplica somente a esta resposta.</small><button className="button primary" disabled={approved && !drafts[answer.id]} onClick={() => save(answer, draft)}>{approved ? 'Salvar revisão individual' : 'Validar resposta'}</button></div>
            </fieldset>}
          </article>;
        })}
      </>}
    </>}
    {resultsOnly && !!data.submissoes.length && <>
      <p className="notice">{totals.length ? `Média das ${totals.length} provas completas e validadas: ${fmt(totals.reduce((a, b) => a + b, 0) / totals.length)} / ${fmt(maximum)}.` : 'A média estará disponível após a validação completa de pelo menos uma prova.'} {totals.length < data.submissoes.length ? 'Cobertura parcial da turma.' : ''}</p>
      <div className="panel table-wrap"><table><caption className="review-caption">Somente notas validadas · {released ? 'resultados liberados' : 'ainda não liberados'}</caption><thead><tr><th>Aluno</th>{questions.map(q => <th key={q.numero}>Q{q.numero} / {fmt(q.valorTotal)}</th>)}<th>Total / {fmt(maximum)}</th><th>Situação</th></tr></thead><tbody>{data.submissoes.map(s => {
        const total = finalTotal(data.barema, s, data.respostas);
        return <tr key={s.id}><th scope="row">{name(s.aluno_id)}</th>{questions.map(q => { const answer = data.respostas.find(r => r.submissao_id === s.id && r.numero === q.numero); return <td key={q.numero}>{isValidated(answer, q.valorTotal) ? fmt(Number(answer!.nota_final)) : 'Pendente'}</td>; })}<td>{total === null ? 'Pendente' : fmt(total)}</td><td>{total === null ? 'Em revisão' : released ? 'Liberado' : 'Validado · não liberado'}</td></tr>;
      })}</tbody></table></div>
    </>}
    {!!data.submissoes.length && <div className="panel submission-list">
      <h3>Devolutivas e liberação</h3>
      {!released && <>
        {!!issues.length && <div className="notice"><div><strong>Antes de liberar</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div></div>}
        {!!Object.keys(drafts).length && <p className="form-error">Salve as revisões individuais antes de preparar ou liberar as devolutivas.</p>}
        <p>{missingFeedback.length} de {confirmed.length} devolutivas ainda precisam ser preparadas.</p>
        <p>{unreviewedFeedback.length} texto(s) aguardam revisão e aprovação do professor.</p>
        {confirmed.map(s => data.feedbacks.some(f => f.submissao_id === s.id && f.atualizado) && <div className="submission-row" key={s.id}><div className="submission-content"><strong>{name(s.aluno_id)} · {data.feedbacks.find(f => f.submissao_id === s.id)?.revisado ? 'Texto aprovado' : 'Texto pendente de revisão'}</strong><FeedbackEditor examId={examId} submissionId={s.id} studentName={name(s.aluno_id)} disabled={busy || !!issues.length || !!Object.keys(drafts).length} onSaved={() => { void load().catch(e => setError(e.message)); }} /></div></div>)}
        <div className="submission-actions"><button className="button secondary" disabled={busy || !!issues.length || !!Object.keys(drafts).length} onClick={feedback}>{missingFeedback.length ? 'Preparar devolutivas' : 'Refazer devolutivas'}</button><button className="button primary" disabled={busy || !!issues.length || !!missingFeedback.length || !!unreviewedFeedback.length || !!Object.keys(drafts).length} onClick={() => task(async () => { await api(`${base}/release`, { method: 'POST' }); onReleased?.(); setNotice('Resultados liberados. Os alunos já podem consultar suas devolutivas.'); })}>Liberar resultados aos alunos</button></div>
      </>}
      {released && <><p>Resultados liberados pelo professor. Compartilhe cada link somente com o respectivo aluno.</p>{confirmed.map(s => {
        const item = data.feedbacks.find(f => f.submissao_id === s.id && f.publicado);
        if (!item) return <p key={s.id}>{name(s.aluno_id)} · Devolutiva indisponível.</p>;
        return <div className="submission-row" key={s.id}><div><strong>{name(s.aluno_id)}</strong><p><a className="text-button" href={`/aluno/${item.token}`} target="_blank" rel="noopener noreferrer">Abrir devolutiva</a></p></div><button className="button secondary" onClick={() => { const link = `${window.location.origin}/aluno/${item.token}`; navigator.clipboard.writeText(link).then(() => setNotice(`Link de ${name(s.aluno_id)} copiado.`), () => setNotice(`Copie o link: ${link}`)); }}>Copiar link</button></div>;
      })}</>}
    </div>}
  </section>;
}
