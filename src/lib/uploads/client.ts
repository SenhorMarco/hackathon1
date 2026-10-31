import { validateProva } from './validation';
export async function uploadDirect(files: File[], purpose: 'exam' | 'submission', examId?: string, id?: string): Promise<string> {
  const metadata = files.map(file => {
    const invalid = validateProva(file);
    if (invalid) throw new Error(invalid);
    const type = file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : /\.png$/i.test(file.name) ? 'image/png' : 'image/jpeg');
    return { name: file.name, type, size: file.size };
  });
  const response = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose, examId, id, files: metadata }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível preparar o envio.');
  for (const [i, file] of files.entries()) {
    const uploaded = await fetch(result.uploads[i].url, { method: 'PUT', headers: { 'Content-Type': metadata[i].type }, body: file });
    if (!uploaded.ok) throw new Error('O envio do arquivo falhou. Confira a conexão e tente novamente.');
  }
  return result.ticket;
}
