import 'server-only';
import { createHash } from 'node:crypto';
import type { Prova } from './types';
export function revisionFor(prova: Pick<Prova, 'analise' | 'barema' | 'status'>) {
  return createHash('sha256').update(JSON.stringify([prova.analise || null, prova.barema || null, prova.status])).digest('hex');
}
export function serializeProva(prova: Prova) { return { ...prova, revisao: revisionFor(prova) }; }
