export type DeadlineConfig = { status: string; prazo_envio?: string | null; excecoes_envio?: Record<string, string> | null };
export const STATUS_RECEBE_ENVIO = ['rascunho', 'analisada', 'barema_pronto', 'corrigindo'];

export function effectiveDeadline(prova: DeadlineConfig, alunoId: string): string | null {
  if (!prova.prazo_envio) return null;
  const exception = prova.excecoes_envio?.[alunoId];
  return exception && Date.parse(exception) > Date.parse(prova.prazo_envio) ? exception : prova.prazo_envio;
}

/** O instante do encerramento já está fechado; publicação sempre encerra envios. */
export function acceptsSubmission(prova: DeadlineConfig, alunoId: string, now = Date.now()): boolean {
  const deadline = effectiveDeadline(prova, alunoId);
  return STATUS_RECEBE_ENVIO.includes(prova.status) && (deadline === null || Date.parse(deadline) > now);
}
