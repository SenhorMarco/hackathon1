import 'server-only';
import { account } from '@/lib/auth/server';
import type { Conta } from './portal';

/** Protege rotas do aluno: exige conta de aluno e, em escrita, a mesma origem do site. */
export function alunoRoute<C>(handler: (request: Request, context: C, conta: Conta) => Promise<Response>) {
  return async (request: Request, context: C) => {
    try {
      const conta = await account();
      if (!conta) return Response.json({ error: 'Entre na sua conta.' }, { status: 401 });
      if (conta.papel !== 'aluno') return Response.json({ error: 'Acesso exclusivo de alunos.' }, { status: 403 });
      if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== new URL(request.url).origin) {
        return Response.json({ error: 'Origem inválida.' }, { status: 403 });
      }
      return await handler(request, context, conta);
    } catch (error) {
      console.error('Falha na rota do aluno:', error instanceof Error ? error.message : 'erro');
      return Response.json({ error: 'Não foi possível concluir o envio. Tente novamente.' }, { status: 500 });
    }
  };
}
