import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { account } from '@/lib/auth/server';
import { carregarPortal } from '@/lib/aluno/portal';
import AccountMenu from '@/components/account-menu';
import AlunoPortal from '@/components/aluno-portal';

async function Content() {
  const user = await account();
  if (!user) redirect('/login');
  if (user.papel !== 'aluno') redirect('/professor/dashboard');
  const turmas = await carregarPortal(user);
  return <><AccountMenu name={user.nome} /><AlunoPortal nome={user.nome} email={user.email} turmas={turmas} /></>;
}

export default function Page() {
  return <Suspense fallback={<p style={{ padding: 32 }}>Carregando suas turmas e provas…</p>}><Content /></Suspense>;
}
