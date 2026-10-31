import 'server-only';
import type { Imagem } from '@/lib/ai/json';
import { documentImages } from '@/lib/uploads/header';
import { BUCKET_PROVAS, db } from './server';

const mimeOf = (path: string) => path.endsWith('.pdf') ? 'application/pdf' : path.endsWith('.png') ? 'image/png' : 'image/jpeg';

/** Baixa os arquivos do Storage e devolve todas as páginas como imagens para a IA. */
export async function imagensDosArquivos(paths: string[]): Promise<Imagem[]> {
  const imagens: Imagem[] = [];
  for (const path of paths) {
    const { data, error } = await db().storage.from(BUCKET_PROVAS).download(path);
    if (error || !data) throw new Error('Arquivo indisponível no armazenamento.');
    const paginas = await documentImages(new Uint8Array(await data.arrayBuffer()), mimeOf(path));
    imagens.push(...paginas.map(base64 => ({ tipo: 'image/png' as const, base64 })));
  }
  if (imagens.length > 10) throw new Error('A prova do aluno tem mais de dez páginas.');
  return imagens;
}
