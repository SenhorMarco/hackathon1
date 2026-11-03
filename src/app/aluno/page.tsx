import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { account } from '@/lib/auth/server';
import { carregarPortal } from '@/lib/aluno/portal';
import AlunoShell from '@/components/aluno-shell';
import AlunoPortal from '@/components/aluno-portal';

async function Content() {
  const user = await account();
  if (!user) redirect('/login');
  if (user.papel !== 'aluno') redirect('/professor/dashboard');
  const turmas = await carregarPortal(user);
  return <AlunoShell name={user.nome}><AlunoPortal nome={user.nome} email={user.email} turmas={turmas} /></AlunoShell>;
}

export default function Page() {
  return <Suspense fallback={<p style={{ padding: 32 }}>Carregando suas turmas e provas…</p>}><Content /></Suspense>;
}
