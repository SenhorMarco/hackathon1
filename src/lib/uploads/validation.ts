export const MAX_PROVA_BYTES = 20 * 1024 * 1024;
export const PROVA_ACCEPT = '.pdf,.png,.jpg,.jpeg';

const formats = [
  { extensions: ['pdf'], mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { extensions: ['png'], mime: 'image/png', signature: [137, 80, 78, 71, 13, 10, 26, 10] },
  { extensions: ['jpg', 'jpeg'], mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
];

export function validateProva(file: File): string | null {
  if (!file.size) return 'O arquivo está vazio.';
  if (file.size > MAX_PROVA_BYTES) return 'Envie um arquivo de até 20 MB.';
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const format = formats.find(f => f.extensions.includes(extension || ''));
  if (!format || (file.type && file.type !== format.mime)) return 'Envie uma prova em PDF, PNG ou JPEG.';
  return null;
}

export async function detectProva(file: File): Promise<string | null> {
  if (validateProva(file)) return null;
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const format = formats.find(f => f.extensions.includes(extension || ''));
  return format?.signature.every((byte, i) => bytes[i] === byte) ? format.mime : null;
}
