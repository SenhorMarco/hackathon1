'use client';
import { useState } from 'react';

export default function ManualAnswer({ examId, submissionId, number, disabled, onSaved }: { examId: string; submissionId: string; number: number; disabled: boolean; onSaved: () => void }) {
  const [text, setText] = useState('');
  const [situation, setSituation] = useState('transcrita');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <details className="manual-answer"><summary>Registrar resposta após conferir o arquivo</summary><form onSubmit={async event => {
    event.preventDefault(); if (busy || disabled || ['ausente', 'ilegivel'].includes(situation)) return; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/exams/${examId}/submissions/${submissionId}/answers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numero: number, transcricao: text, situacao: situation, arquivoConferido: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar a resposta.');
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a resposta.'); }
    finally { setBusy(false); }
  }}><fieldset className="exam-editor" disabled={busy || disabled}>
    <label>Situação da página · Q{number}<select value={situation} onChange={event => setSituation(event.target.value)}>
      <option value="transcrita">Resposta legível — transcrever</option><option value="em_branco">Página visivelmente em branco</option>
      <option value="ausente">Página ausente</option><option value="ilegivel">Não consigo ler a resposta</option>
    </select></label>
    {situation === 'transcrita' && <label>Transcrição conferida · Q{number}<textarea required maxLength={20000} value={text} onChange={event => setText(event.target.value)} /></label>}
    {['ausente', 'ilegivel'].includes(situation) ? <p role="status">A questão continua pendente. Solicite uma página legível ou confira outra imagem antes de registrar uma resposta. Ausência ou ilegibilidade não significa nota zero.</p> : <>
      <label className="review-check"><input type="checkbox" required />Conferi a página original e identifiquei esta questão.</label>
      <p>{situation === 'em_branco' ? 'O registro de página em branco ainda exige nota e comentário definidos pelo professor.' : 'O texto será registrado sem nota para revisão individual.'}</p>
      <button className="button secondary" type="submit">{busy ? 'Registrando…' : 'Registrar para revisão individual'}</button>
    </>}
  </fieldset>{error && <p className="form-error" role="alert">{error}</p>}</form></details>;
}
