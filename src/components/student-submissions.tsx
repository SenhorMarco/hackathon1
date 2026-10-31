'use client';
import { useEffect, useRef, useState } from 'react';
import type { Aluno, Submissao } from '@/lib/db/types';
import type { Student } from '@/lib/data';
import { uploadDirect } from '@/lib/uploads/client';
import { validateProva } from '@/lib/uploads/validation';

type Pending = { id: string; files: File[]; error?: string };
async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}
export default function StudentSubmissions({ examId, students }: { examId: string; students: Student[] }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [submissions, setSubmissions] = useState<Submissao[]>([]);
  const [roster, setRoster] = useState<Aluno[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState('');
  const [loading, setLoading] = useState(true);
  const running = useRef(false);
  const base = `/api/exams/${examId}`;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      jsonRequest(`${base}/students`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(students.map(s => ({ referencia_local: s.id, nome: s.name }))), signal: controller.signal }),
      jsonRequest(`${base}/submissions`, { signal: controller.signal }),
    ]).then(([people, saved]) => { setRoster(people.alunos); setSubmissions(saved.submissoes); })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar alunos e envios. Reabra esta aba para tentar novamente.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [base, students]);
  function add(files: File[], images: boolean) {
    if (running.current || !files.length) return;
    const invalid = files.map(validateProva).find(Boolean);
    if (invalid || files.some(f => images ? /\.pdf$/i.test(f.name) : !/\.pdf$/i.test(f.name))) { setError(invalid || (images ? 'Selecione apenas PNG ou JPEG.' : 'Selecione apenas PDFs.')); return; }
    if (images && (files.length > 10 || files.reduce((sum, f) => sum + f.size, 0) > 40 * 1024 * 1024)) { setError('Agrupe até dez imagens e 40 MB por aluno.'); return; }
    setError('');
    setQueue(current => [...current, ...(images ? [files] : files.map(f => [f])).map(group => ({ id: crypto.randomUUID(), files: group }))]);
  }
  function updateSaved(submission: Submissao) {
    setSubmissions(current => [submission, ...current.filter(s => s.id !== submission.id)]);
  }
  async function readName(id: string) {
    const data = await jsonRequest(`${base}/submissions/${id}/name`, { method: 'POST' });
    updateSaved(data.submissao);
  }
  async function uploadBatch() {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    for (const item of queue) {
      setActive(`Enviando ${item.files[0].name}…`);
      try {
        const ticket = await uploadDirect(item.files, 'submission', examId, item.id);
        const data = await jsonRequest(`${base}/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) });
        updateSaved(data.submissao);
        setQueue(current => current.filter(p => p.id !== item.id));
        setActive(`Lendo cabeçalho de ${item.files[0].name}…`);
        try { await readName(data.submissao.id); }
        catch { setError('Arquivo salvo. A leitura do cabeçalho falhou; selecione o aluno manualmente.'); }
      } catch (error) { setQueue(current => current.map(p => p.id === item.id ? { ...p, error: error instanceof Error ? error.message : 'Falha no envio.' } : p)); }
    }
    setActive(''); setBusy(false); running.current = false;
  }
  async function confirm(submission: Submissao) {
    const alunoId = choices[submission.id];
    if (!alunoId || running.current) return;
    running.current = true; setBusy(true); setError('');
    try {
      const data = await jsonRequest(`${base}/submissions/${submission.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aluno_id: alunoId }) });
      updateSaved(data.submissao);
      setChoices(current => { const next = { ...current }; delete next[submission.id]; return next; });
    } catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível confirmar o aluno.'); }
    finally { running.current = false; setBusy(false); }
  }
  async function retryName(id: string) {
    if (running.current) return;
    running.current = true; setBusy(true); setError('');
    try { await readName(id); } catch { setError('Não foi possível ler o cabeçalho. A seleção manual continua disponível.'); }
    finally { running.current = false; setBusy(false); }
  }
  return <section aria-busy={busy || loading}>
    <div className="section-heading"><div><h2>Provas dos alunos</h2><p>Cada PDF corresponde a um aluno. Selecione juntas as imagens de uma mesma prova, na ordem das páginas.</p></div></div>
    <div className="notice compact"><p>A IA sugere o nome do cabeçalho da primeira página. Confira o arquivo e confirme o aluno na lista; a sugestão nunca faz a associação automaticamente.</p></div>
    {loading && <p role="status">Carregando alunos e provas enviadas…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <fieldset disabled={busy || loading} className="submission-controls">
      <label>Adicionar PDFs em lote<input type="file" accept=".pdf" multiple onChange={e => { add(Array.from(e.target.files || []), false); e.target.value = ''; }}/><small>Um PDF por aluno · até 20 MB por arquivo</small></label>
      <label>Adicionar uma prova em imagens<input type="file" accept=".png,.jpg,.jpeg" multiple onChange={e => { add(Array.from(e.target.files || []), true); e.target.value = ''; }}/><small>Até dez imagens · 20 MB por imagem · 40 MB por prova</small></label>
    </fieldset>
    {!!queue.length && <div className="panel submission-list"><h3>{queue.length} provas na fila</h3>{queue.map(item => <div key={item.id} className="submission-row"><div><strong>{item.files.map(f => f.name).join(' · ')}</strong>{item.error && <p className="form-error" role="alert">{item.error}</p>}</div><button className="button secondary" disabled={busy} onClick={() => setQueue(current => current.filter(p => p.id !== item.id))}>Remover</button></div>)}<button className="button primary" disabled={busy || loading} onClick={uploadBatch}>Enviar {queue.length} provas</button></div>}
    {active && <p role="status">{active}</p>}
    <div className="panel submission-list"><h3>{submissions.length} provas recebidas</h3>{!submissions.length && !loading && <p>Nenhuma prova de aluno enviada.</p>}{submissions.map(submission => <div key={submission.id} className="submission-row"><div className="submission-content">
      <div>{submission.arquivo_paths.map((_, i) => <a className="text-button submission-file" key={i} href={`${base}/submissions/${submission.id}/file?index=${i}`} target="_blank" rel="noopener noreferrer">{submission.arquivo_nomes[i] || `Página ${i + 1}`}</a>)}</div>
      <p>Nome sugerido pela IA: <strong>{submission.nome_lido || 'Não identificado'}</strong></p>
      {submission.nome_leitura_erro && <p className="form-error">{submission.nome_leitura_erro}</p>}
      <p>{submission.aluno_id ? `Aluno confirmado: ${roster.find(a => a.id === submission.aluno_id)?.nome || 'Aluno cadastrado'}` : 'Aguardando confirmação do professor'}</p>
      <label>Aluno desta prova<select disabled={busy || !roster.length} value={choices[submission.id] ?? submission.aluno_id ?? ''} onChange={e => setChoices(current => ({ ...current, [submission.id]: e.target.value }))}><option value="">Selecione um aluno</option>{roster.map(student => <option key={student.id} value={student.id}>{student.nome}</option>)}</select></label>
      {!roster.length && <p>Cadastre alunos na turma e reabra esta aba para associar as provas.</p>}
      <div className="submission-actions"><button className="button primary" disabled={busy || !choices[submission.id]} onClick={() => confirm(submission)}>Confirmar aluno</button><button className="button secondary" disabled={busy} onClick={() => retryName(submission.id)}>Reler cabeçalho</button></div>
    </div></div>)}</div>
  </section>;
}
