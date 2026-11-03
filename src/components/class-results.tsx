'use client';
import { useState } from 'react';
import type { Exam } from '@/lib/data';
import CorrectionReview from './correction-review';

export default function ClassResults({ exams }: { exams: Exam[] }) {
  const [selected, setSelected] = useState('');
  const available = exams.filter(exam => exam.persisted);
  const current = available.find(exam => exam.id === selected) ?? available[0];
  if (!current) return <div className="empty"><h3>Nenhum resultado disponível</h3><p>Cadastre uma prova e revise as respostas para acompanhar os resultados.</p></div>;
  return <>
    <label>Prova do relatório<select value={current.id} onChange={event => setSelected(event.target.value)}>{available.map(exam => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</select></label>
    <CorrectionReview key={current.id} examId={current.id} resultsOnly />
  </>;
}
