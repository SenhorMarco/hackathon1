import 'server-only';
import type { Imagem } from '@/lib/ai/json';
import { documentImages } from '@/lib/uploads/header';
import { BUCKET_PROVAS, db } from './server';

const mimeOf = (path: string) => path.endsWith('.pdf') ? 'application/pdf' : path.endsWith('.png') ? 'image/png' : 'image/jpeg';

/** Baixa os arquivos do Storage e devolve todas as páginas como imagens para a IA. */
export async function imagensDosArquivos(paths: string[]): Promise<Imagem[]> {
  return (await imagensComOrigem(paths)).map(i => i.imagem);
}

/** Como imagensDosArquivos, mas guarda de qual arquivo veio cada imagem (para saber a questão). */
export async function imagensComOrigem(paths: string[]): Promise<{ imagem: Imagem; path: string }[]> {
  const imagens: { imagem: Imagem; path: string }[] = [];
  for (const path of paths) {
    const { data, error } = await db().storage.from(BUCKET_PROVAS).download(path);
    if (error || !data) throw new Error('Arquivo indisponível no armazenamento.');
    const paginas = await documentImages(new Uint8Array(await data.arrayBuffer()), mimeOf(path));
    imagens.push(...paginas.map(base64 => ({ imagem: { tipo: 'image/png' as const, base64 }, path })));
  }
  // Envio por questão pode ter uma foto por questão: o limite acompanha uma prova de até 20 questões.
  if (imagens.length > 20) throw new Error('A prova do aluno tem mais de vinte páginas ou fotos.');
  return imagens;
}
