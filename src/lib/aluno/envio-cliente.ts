import { validateProva } from '@/lib/uploads/validation';

async function pedir(url: string, init: RequestInit) {
  const r = await fetch(url, { ...init, headers: init.body ? { 'Content-Type': 'application/json' } : undefined });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir o envio.');
  return corpo;
}

const tipoDe = (f: File) => f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : /\.png$/i.test(f.name) ? 'image/png' : 'image/jpeg');

/** Valida a seleção: um PDF sozinho ou até dez imagens. Devolve a mensagem de erro, se houver. */
export function validarSelecao(arquivos: File[]): string | null {
  const invalido = arquivos.map(validateProva).find(Boolean);
  if (invalido) return invalido;
  if (arquivos.length > 1 && arquivos.some(f => /\.pdf$/i.test(f.name))) return 'Envie um único PDF ou até dez fotos.';
  if (arquivos.length > 10) return 'Envie no máximo dez fotos.';
  return null;
}

/** Sobe os arquivos direto ao Storage e confirma o envio. Com `numero`, as fotos são daquela questão. */
export async function enviarArquivos(provaId: string, arquivos: File[], progresso: (texto: string) => void, numero?: number) {
  const base = `/api/aluno/provas/${provaId}/envio`;
  const files = arquivos.map(f => ({ name: f.name, type: tipoDe(f), size: f.size }));
  progresso('Preparando o envio…');
  const { uploads, ticket } = await pedir(base, { method: 'PUT', body: JSON.stringify({ files, numero }) });
  for (const [i, f] of arquivos.entries()) {
    progresso(arquivos.length > 1 ? `Enviando foto ${i + 1} de ${arquivos.length}…` : 'Enviando…');
    const r = await fetch(uploads[i].url, { method: 'PUT', headers: { 'Content-Type': files[i].type }, body: f });
    if (!r.ok) throw new Error('O envio do arquivo falhou. Confira a conexão e tente de novo.');
  }
  progresso('Confirmando…');
  return pedir(base, { method: 'POST', body: JSON.stringify({ ticket }) });
}

export async function removerQuestao(provaId: string, numero: number) {
  return pedir(`/api/aluno/provas/${provaId}/envio?numero=${numero}`, { method: 'DELETE' });
}
