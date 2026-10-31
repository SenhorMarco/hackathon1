import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BUCKET_PROVAS, db } from '@/lib/db/server';
import { detectProva, MAX_PROVA_BYTES } from './validation';

export const FileMetadata = z.object({ name: z.string().min(1).max(255), type: z.enum(['application/pdf', 'image/png', 'image/jpeg']), size: z.number().int().positive().max(MAX_PROVA_BYTES) });
const Ticket = z.object({ id: z.uuid(), purpose: z.enum(['exam', 'submission']), examId: z.uuid().nullable(), expires: z.number(), files: z.array(FileMetadata.extend({ path: z.string() })).min(1).max(10) });
export type UploadTicket = z.infer<typeof Ticket>;
function signature(payload: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('Serviço de arquivos não configurado.');
  return createHmac('sha256', key).update(payload).digest('base64url');
}
export function signUpload(ticket: UploadTicket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
function verifyUpload(value: unknown, purpose: UploadTicket['purpose'], examId: string | null) {
  if (typeof value !== 'string' || value.length > 20000) throw new Error('Autorização de upload inválida.');
  const [payload, mac] = value.split('.');
  const expected = Buffer.from(signature(payload || ''));
  const actual = Buffer.from(mac || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Autorização de upload inválida.');
  const ticket = Ticket.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
  if (ticket.purpose !== purpose || ticket.examId !== examId || ticket.expires < Date.now()) throw new Error('O upload expirou ou pertence a outra prova. Envie novamente.');
  return ticket;
}
export async function readUpload(request: Request, purpose: UploadTicket['purpose'], examId: string | null = null): Promise<{ form: FormData; prepared: UploadTicket | null }> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return { form: await request.formData(), prepared: null };
  const body = await request.json();
  const prepared = verifyUpload(body.ticket, purpose, examId);
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) if (key !== 'ticket' && typeof value === 'string') form.set(key, value);
  if (purpose === 'submission') form.set('id', prepared.id);
  for (const metadata of prepared.files) {
    const { data, error } = await db().storage.from(BUCKET_PROVAS).download(metadata.path);
    if (error || !data) throw new Error('O arquivo não chegou ao armazenamento. Tente novamente.');
    if (data.size !== metadata.size) throw new Error('Tamanho do arquivo recebido diferente do informado.');
    const file = new File([data], metadata.name, { type: metadata.type });
    if (await detectProva(file) !== metadata.type) throw new Error('Conteúdo do arquivo recebido inválido.');
    form.append(purpose === 'exam' ? 'arquivo' : 'arquivos', file);
  }
  return { form, prepared };
}
