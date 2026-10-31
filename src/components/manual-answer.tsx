'use client';
import { useState } from 'react';

export default function ManualAnswer({ examId, submissionId, number, disabled, onSaved }: { examId: string; submissionId: string; number: number; disabled: boolean; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <details className="manual-answer"><summary>Registrar resposta após conferir o arquivo</summary><form onSubmit={async event => {
    event.preventDefault(); if (busy || disabled) return; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/exams/${examId}/submissions/${submissionId}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: number, transcricao: text, arquivoConferido: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar a resposta.');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a resposta.'); }
    finally { setBusy(false); }
  }}><fieldset className="exam-editor" disabled={busy || disabled}><label>Transcrição conferida · Q{number}<textarea required maxLength={20000} value={text} onChange={event => setText(event.target.value)} /></label><label className="review-check"><input type="checkbox" required />Conferi a página original e identifiquei esta questão.</label><p>Se a página estiver visivelmente em branco, registre isso explicitamente. Página ausente ou ilegível deve continuar pendente.</p><button className="button secondary" type="submit">{busy ? 'Registrando…' : 'Registrar para revisão individual'}</button></fieldset>{error && <p className="form-error" role="alert">{error}</p>}</form></details>;
}
