'use client';

import { useState } from 'react';
import type { FeedbackAluno } from '@/lib/ai/schemas';

type Props = {
  examId: string;
  submissionId: string;
  studentName: string;
  disabled?: boolean;
  onSaved: () => void;
};

type FeedbackResponse = {
  feedback: {
    conteudo: FeedbackAluno;
    revisao: string;
    revisado: boolean;
    publicado: boolean;
  };
};

export default function FeedbackEditor({ examId, submissionId, studentName, disabled = false, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<FeedbackAluno | null>(null);
  const [revision, setRevision] = useState('');
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const url = `/api/exams/${encodeURIComponent(examId)}/submissions/${encodeURIComponent(submissionId)}/feedback`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a devolutiva.');
    return data as T;
  }

  async function openEditor(discardDraft = false) {
    setOpen(true);
    if ((!discardDraft && content) || loading) return;
    if (discardDraft) setContent(null);
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const data = await request<FeedbackResponse>(url);
      setContent(data.feedback.conteudo);
      setRevision(data.feedback.revisao ?? '');
      setPublished(data.feedback.publicado);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a devolutiva.');
    } finally {
      setLoading(false);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content || published || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await request<unknown>(url, { method: 'PUT', body: JSON.stringify({ conteudo: content, revisao: revision }) });
      setNotice('Devolutiva aprovada e salva.');
      setContent(null);
      setOpen(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a devolutiva.');
    } finally {
      setSaving(false);
    }
  }

  function patchQuestion(index: number, patch: Partial<FeedbackAluno['questoes'][number]>) {
    setContent(current => current && ({
      ...current,
      questoes: current.questoes.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question),
    }));
  }

  const locked = disabled || published || loading || saving;

  return (
    <section className="feedback-editor">
      <button className="button secondary" type="button" disabled={disabled || loading} onClick={() => void openEditor()}>
        {loading ? 'Carregando devolutiva…' : `Revisar devolutiva de ${studentName}`}
      </button>
      {notice && <p className="notice" role="status">{notice}</p>}
      {open && <div className="panel submission-list" aria-busy={loading || saving}>
        <div className="section-heading">
          <div><h2>Devolutiva para {studentName}</h2><p>Revise o texto antes de aprová-lo.</p></div>
          <button className="button secondary" type="button" onClick={() => setOpen(false)}>Fechar editor</button>
        </div>
        {published && <div className="notice" role="status">Esta devolutiva já foi publicada e não pode mais ser editada.</div>}
        {loading ? <p role="status">Carregando devolutiva…</p> : content && <form onSubmit={save}>
          <fieldset disabled={locked} className="exam-editor">
            <div className="submission-list">
              <label>Resumo da devolutiva<textarea rows={3} value={content.resumo} onChange={event => setContent({ ...content, resumo: event.target.value })} /></label>
            </div>
            {content.questoes.map((question, index) => <section className="panel submission-list" key={`${question.numero}-${index}`}>
              <h3>Questão {question.numero}</h3>
              <div className="review-fields">
                <label>Acertos<textarea rows={3} value={question.acertos} onChange={event => patchQuestion(index, { acertos: event.target.value })} /></label>
                <label>Erro<textarea rows={3} value={question.erro} onChange={event => patchQuestion(index, { erro: event.target.value })} /></label>
                <label>Por que isso é um erro<textarea rows={3} value={question.porque} onChange={event => patchQuestion(index, { porque: event.target.value })} /></label>
                <label>Dica<textarea rows={3} value={question.dica} onChange={event => patchQuestion(index, { dica: event.target.value })} /></label>
              </div>
              {question.exercicios.map((exercise, exerciseIndex) => <div className="review-fields" key={exerciseIndex}>
                <label>Exercício {exerciseIndex + 1} — enunciado<textarea rows={3} value={exercise.enunciado} onChange={event => patchQuestion(index, { exercicios: question.exercicios.map((item, i) => i === exerciseIndex ? { ...item, enunciado: event.target.value } : item) })} /></label>
                <label>Exercício {exerciseIndex + 1} — resposta<textarea rows={3} value={exercise.resposta} onChange={event => patchQuestion(index, { exercicios: question.exercicios.map((item, i) => i === exerciseIndex ? { ...item, resposta: event.target.value } : item) })} /></label>
              </div>)}
            </section>)}
            <div className="submission-list">
              <label>Próximos passos (um item por linha)<textarea rows={5} value={content.proximosPassos.join('\n')} onChange={event => setContent({ ...content, proximosPassos: event.target.value.split('\n') })} /></label>
            </div>
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          {error && <button className="button secondary" type="button" disabled={loading || saving} onClick={() => { setError(''); void openEditor(true); }}>Descartar rascunho e recarregar</button>}
          <div className="modal-actions">
            <button className="button primary" type="submit" disabled={locked || !content}>{saving ? 'Salvando…' : 'Aprovar texto da devolutiva'}</button>
          </div>
        </form>}
        {error && !content && <><p className="form-error" role="alert">{error}</p><button className="button secondary" type="button" disabled={loading} onClick={() => { setError(''); void openEditor(true); }}>Tentar novamente</button></>}
      </div>}
    </section>
  );
}
