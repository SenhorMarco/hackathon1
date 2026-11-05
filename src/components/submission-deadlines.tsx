'use client';

import { useCallback, useEffect, useState } from 'react';

type DeadlineData = {
  prazo: string | null;
  excecoes: Record<string, string>;
  alunos: { id: string; nome: string }[];
  revisao: string;
  status: string;
};

function toLocalInput(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Informe uma data e horário válidos.');
  if (toLocalInput(date.toISOString()) !== value) throw new Error('Esse horário local não existe ou não é válido. Confira a data e o fuso do navegador.');
  return date.toISOString();
}

export default function SubmissionDeadlines({ examId }: { examId: string }) {
  const url = `/api/exams/${encodeURIComponent(examId)}/deadlines`;
  const [data, setData] = useState<DeadlineData | null>(null);
  const [deadline, setDeadline] = useState('');
  const [exceptions, setExceptions] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState('');
  const [exceptionValue, setExceptionValue] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const request = useCallback(async (init?: RequestInit): Promise<DeadlineData> => {
    const response = await fetch(url, { ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 409 ? 'A configuração mudou. Recarregue para ver a versão atual.' : result.error || 'Não foi possível carregar os prazos.');
    return result as DeadlineData;
  }, [url]);

  const apply = useCallback((result: DeadlineData) => {
    setData(result);
    setDeadline(result.prazo ? toLocalInput(result.prazo) : '');
    setExceptions(Object.fromEntries(Object.entries(result.excecoes ?? {}).map(([id, value]) => [id, toLocalInput(value)])));
    setSelected(''); setExceptionValue(''); setNotice('');
  }, []);

  async function load() {
    setLoading(true); setError('');
    try { apply(await request()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os prazos.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    request().then(result => { if (active) apply(result); }, cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os prazos.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, apply]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || saving || data.status === 'corrigida') return;
    setSaving(true); setError(''); setNotice('');
    try {
      const isoExceptions: Record<string, string> = {};
      for (const [id, value] of Object.entries(exceptions)) {
        const iso = data.excecoes[id] && toLocalInput(data.excecoes[id]) === value ? data.excecoes[id] : toIso(value);
        if (!iso || (iso !== data.excecoes[id] && new Date(iso).getTime() <= Date.now())) throw new Error('Cada exceção precisa ter uma data e horário futuros.');
        isoExceptions[id] = iso;
      }
      const result = await request({ method: 'PUT', body: JSON.stringify({ prazo: data.prazo && toLocalInput(data.prazo) === deadline ? data.prazo : toIso(deadline), excecoes: isoExceptions, revisao: data.revisao }) });
      apply(result); setNotice('Prazos salvos.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar os prazos.');
    } finally { setSaving(false); }
  }

  if (loading && !data) return <section className="panel submission-list" aria-busy="true"><p role="status">Carregando prazos…</p></section>;
  if (!data) return <section className="panel submission-list"><h2>Prazos de envio</h2><p className="form-error" role="alert">{error}</p><button className="button secondary" type="button" onClick={() => void load()}>Tentar novamente</button></section>;

  const readonly = data.status === 'corrigida';
  return <section className="panel submission-list" aria-busy={saving || loading}>
    <div className="section-heading"><div><h2>Prazos de envio</h2><p>A exceção prorroga o prazo geral apenas para o aluno selecionado. Sem prazo definido, os envios ficam abertos até a publicação dos resultados.</p></div></div>
    {readonly && <p className="notice" role="status">Esta prova já foi corrigida; os prazos não podem mais ser alterados.</p>}
    <form onSubmit={save}>
      <fieldset className="exam-editor" disabled={readonly || saving || loading}>
        <label>Prazo geral <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} aria-describedby="deadline-timezone deadline-past" /></label>
        <small id="deadline-timezone">Horário exibido no fuso deste navegador: {Intl.DateTimeFormat().resolvedOptions().timeZone || 'fuso local'}.</small>
        <p id="deadline-past" className="muted">Um prazo geral no passado fecha os envios imediatamente.</p>
        <div className="submission-list"><h3>Exceções por aluno</h3><p>As exceções precisam estar no futuro e prorrogam o prazo apenas para o aluno selecionado.</p>
          {Object.entries(exceptions).map(([id, value]) => <div className="submission-row" key={id}><label>{data.alunos.find(aluno => aluno.id === id)?.nome ?? 'Aluno'} · novo prazo<input aria-label={`Novo prazo para ${data.alunos.find(aluno => aluno.id === id)?.nome ?? 'aluno'}`} type="datetime-local" value={value} onChange={e => setExceptions(current => ({ ...current, [id]: e.target.value }))} /></label><button className="button secondary" type="button" onClick={() => setExceptions(current => { const next = { ...current }; delete next[id]; return next; })}>Revogar exceção</button></div>)}
          <div className="submission-actions"><label>Adicionar exceção para <select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Selecione um aluno</option>{data.alunos.filter(aluno => !exceptions[aluno.id]).map(aluno => <option key={aluno.id} value={aluno.id}>{aluno.nome}</option>)}</select></label><label>Novo prazo individual <input aria-label="Novo prazo individual" type="datetime-local" value={exceptionValue} onChange={e => setExceptionValue(e.target.value)} /></label><button className="button secondary" type="button" disabled={!selected || !exceptionValue} onClick={() => { setExceptions(current => ({ ...current, [selected]: exceptionValue })); setSelected(''); setExceptionValue(''); }}>Adicionar/atualizar</button></div>
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      {error.includes('mudou') && <button className="button secondary" type="button" disabled={saving || loading} onClick={() => void load()}>Recarregar configuração</button>}
      <div className="modal-actions"><button className="button primary" type="submit" disabled={readonly || saving || loading}>{saving ? 'Salvando…' : 'Salvar prazos'}</button></div>
    </form>
    <p className="muted">Substituir arquivos invalida a correção anterior e exige nova avaliação.</p>
  </section>;
}
