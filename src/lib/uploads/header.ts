import 'server-only';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { join } from 'node:path';

/** Renderiza só a primeira página e envia apenas sua metade superior à IA. */
export async function headerImage(bytes: Uint8Array, mime: string): Promise<string> {
  if (mime !== 'application/pdf') {
    const image = await loadImage(Buffer.from(bytes));
    const width = Math.min(1600, image.width);
    const height = Math.max(1, Math.round(image.height * width / image.width / 2));
    if (height > 4000) throw new Error('Imagem com proporções incompatíveis.');
    const canvas = createCanvas(width, height);
    canvas.getContext('2d').drawImage(image, 0, 0, image.width, image.height / 2, 0, 0, width, height);
    return canvas.toBuffer('image/png').toString('base64');
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = join(process.cwd(), 'node_modules', 'pdfjs-dist');
  const task = getDocument({ data: bytes, standardFontDataUrl: join(root, 'standard_fonts/'), cMapUrl: join(root, 'cmaps/'), cMapPacked: true });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const original = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1600 / original.width, 2200 / original.height);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise;
    const header = createCanvas(canvas.width, Math.max(1, Math.ceil(canvas.height / 2)));
    header.getContext('2d').drawImage(canvas, 0, 0);
    return header.toBuffer('image/png').toString('base64');
  } finally { await task.destroy(); }
}

/** Renderiza a prova completa. Nunca trunca silenciosamente um PDF maior. */
export async function documentImages(bytes: Uint8Array, mime: string): Promise<string[]> {
  if (mime !== 'application/pdf') {
    const image = await loadImage(Buffer.from(bytes));
    const scale = Math.min(1, 1600 / image.width, 2200 / image.height);
    const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return [canvas.toBuffer('image/png').toString('base64')];
  }
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = join(process.cwd(), 'node_modules', 'pdfjs-dist');
  const task = getDocument({ data: bytes, standardFontDataUrl: join(root, 'standard_fonts/'), cMapUrl: join(root, 'cmaps/'), cMapPacked: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 10) throw new Error('A análise aceita até dez páginas.');
    const images: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, 1600 / original.width, 2200 / original.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise;
      images.push(canvas.toBuffer('image/png').toString('base64'));
      page.cleanup();
    }
    return images;
  } finally { await task.destroy(); }
}
