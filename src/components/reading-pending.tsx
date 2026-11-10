'use client';

import { useRef, useState } from 'react';
import type { Resposta } from '@/lib/db/types';
import { isResolvedReading } from '@/lib/review';

type ReadingResolution = {
  acao: 'desconsiderar';
  tipo: 'duplicada' | 'fora_da_prova';
  motivo: string;
  professorId: string;
  em: string;
  revisaoAnterior: string;
  duplicadaDe?: string;
};

type ReadingAnswer = Resposta & {
  revisaoLeitura?: string;
  correcao: Resposta['correcao'] & { resolucaoLeitura?: ReadingResolution };
};

type Props = {
  examId: string;
  answer: Resposta;
  submission?: { arquivo_paths: string[]; arquivo_nomes: string[] };
  studentName: string;
  questions: { numero: number }[];
  answers: Resposta[];
  disabled: boolean;
  onSaved: (message: string) => Promise<void> | void;
};

async function post(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a pendência.');
}

export default function ReadingPending({ examId, answer: rawAnswer, submission, studentName, questions, answers, disabled, onSaved }: Props) {
  const answer = rawAnswer as ReadingAnswer;
  const resolution = answer.correcao.resolucaoLeitura;
  const [kind, setKind] = useState<'duplicada' | 'fora_da_prova'>('duplicada');
  const [duplicateId, setDuplicateId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const base = `/api/exams/${examId}/answers/${answer.id}/reading`;
  const transcricao = answer.correcao.transcricao?.trim() || 'Transcrição não disponível. Confira o arquivo original.';
  const candidates = answers.filter(candidate => {
    if (candidate.id === answer.id || candidate.submissao_id !== answer.submissao_id) return false;
    if (!questions.some(question => question.numero === candidate.numero)) return false;
    return (candidate.correcao as Resposta['correcao'] & { legivel?: boolean }).legivel === true;
  });
  const selectedTarget = candidates.find(candidate => candidate.id === duplicateId);
  const resolved = isResolvedReading(rawAnswer);
  const available = questions.filter(q => !answers.some(a => a.submissao_id === answer.submissao_id && a.numero === q.numero));

  async function save(body: Record<string, unknown>, message: string, url = base) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await post(url, body);
      await onSaved(message);
      setReason('');
      setConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a pendência.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const files = submission?.arquivo_paths ?? [];
  const fileNames = submission?.arquivo_nomes ?? [];

  return <section className="panel review-card" aria-label={`Leitura de ${studentName}`} aria-busy={busy}>
    <div className="review-head">
      <div><h3>{studentName}</h3><p className="muted">{resolved ? 'Leitura preservada para consulta' : 'Questão ainda não identificada'}</p></div>
      <span className={`badge ${resolved ? 'green' : 'amber'}`}>{resolved ? 'Leitura desconsiderada' : 'Leitura pendente'}</span>
    </div>
    <p className="review-transcription"><strong>Texto lido</strong><br />{transcricao}</p>
    {!!files.length && <div className="submission-actions">{files.map((_, index) => <a key={index} className="text-button" href={`/api/exams/${examId}/submissions/${answer.submissao_id}/file?index=${index}`} target="_blank" rel="noopener noreferrer">Abrir {fileNames[index] || `página ${index + 1}`}</a>)}</div>}

    {resolved && resolution ? <div className="notice">
      <p><strong>{resolution.tipo === 'duplicada' ? 'Resposta duplicada' : 'Trecho fora da prova'}</strong><br />{resolution.motivo}<br /><small>Decisão registrada em {new Date(resolution.em).toLocaleString('pt-BR')}</small></p>
      {resolution.tipo === 'duplicada' && resolution.duplicadaDe && <p>Resposta considerada: {answers.find(item => item.id === resolution.duplicadaDe)?.correcao.transcricao || `Q${answers.find(item => item.id === resolution.duplicadaDe)?.numero ?? '—'}`}</p>}
      <button className="button secondary" disabled={disabled || busy} onClick={() => save({ acao: 'reabrir', revisao: answer.revisaoLeitura ?? '' }, 'Pendência de leitura reaberta.')}>{busy ? 'Reabrindo…' : 'Reabrir pendência'}</button>
    </div> : <fieldset className="exam-editor" disabled={disabled || busy}>
      <p>Se a leitura estiver incerta, confira o arquivo. Ausência de texto ou imagem ilegível mantém a questão pendente e não justifica desconsiderá-la.</p>
      {available.length > 0 ? <>
        <label>Questão desta resposta<select aria-label={`Associar resposta de ${studentName}`} value={question} onChange={event => setQuestion(event.target.value)}>
          <option value="">Selecione a questão</option>{available.map(q => <option key={q.numero} value={q.numero}>Q{q.numero}</option>)}
        </select></label>
        <button className="button secondary" disabled={!question} onClick={() => save({ numero: Number(question) }, 'Questão associada. Confira o arquivo e valide nota e comentário.', `/api/exams/${examId}/answers/${answer.id}/associate`)}>Associar questão</button>
      </> : <p>Todas as questões já têm resposta. Compare a leitura abaixo antes de decidir se ela está duplicada.</p>}
      <label>O que aconteceu com esta leitura?<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
        <option value="duplicada">É uma leitura duplicada de resposta já identificada</option>
        <option value="fora_da_prova">O conteúdo está fora da prova</option>
      </select></label>
      {kind === 'duplicada' && <>
        <label>Resposta já identificada<select value={duplicateId} onChange={event => setDuplicateId(event.target.value)}>
          <option value="">Selecione a resposta para comparar</option>
          {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>Q{candidate.numero} · {candidate.correcao.transcricao?.slice(0, 100) || 'Transcrição sem texto'}</option>)}
        </select></label>
        {selectedTarget && <div className="notice"><strong>Texto da Q{selectedTarget.numero} para comparação</strong><p>{selectedTarget.correcao.transcricao || 'Transcrição não disponível.'}</p></div>}
        {!candidates.length && <p className="form-error">Não há outra resposta legível desta entrega para comparar. Confira os arquivos antes de associar.</p>}
      </>}
      {kind === 'fora_da_prova' && <p className="notice">Use esta opção apenas quando o arquivo mostrar claramente conteúdo que não faz parte da prova. Leitura ausente, incompleta ou ilegível continua pendente.</p>}
      <label>Justificativa da decisão<textarea maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Descreva o que conferiu no arquivo e por que esta leitura deve ser desconsiderada." /></label>
      <label className="review-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Conferi o arquivo original e confirmei esta decisão.</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="review-footer"><small>A decisão registra esta leitura sem remover ou alterar a resposta, os arquivos ou o texto.</small><button className="button secondary" disabled={!confirmed || reason.trim().length < 5 || (kind === 'duplicada' && !duplicateId)} onClick={() => save({ acao: 'desconsiderar', tipo: kind, ...(kind === 'duplicada' ? { duplicadaDe: duplicateId } : {}), motivo: reason.trim(), arquivoConferido: true, revisao: answer.revisaoLeitura ?? '' }, kind === 'duplicada' ? 'Leitura duplicada desconsiderada. A resposta continua registrada.' : 'Leitura fora da prova desconsiderada. A resposta continua registrada.')}>{busy ? 'Salvando…' : 'Desconsiderar esta leitura'}</button></div>
    </fieldset>}
    {error && resolved && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
