import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { account } from '@/lib/auth/server';
import { loadClasses } from '@/lib/auth/workspace';
import Workspace from './workspace';
import AccountMenu from './account-menu';
import CreateFirstClass from './create-first-class';
async function Content({view}:{view:'overview'|'exams'|'students'|'reports'}) {
 const user=await account();if(!user)redirect('/login');if(user.papel!=='professor')redirect('/aluno');
 const classes=await loadClasses(user.id);
 return <>{classes.length?<Workspace key={user.id} initialView={view} initialClasses={classes} accountId={user.id} accountName={user.nome}/>:<><AccountMenu name={user.nome}/><CreateFirstClass/></>}</>;
}
export default function ProfessorPage({view='overview'}:{view?:'overview'|'exams'|'students'|'reports'}) {return <Suspense fallback={<p>Carregando suas turmas…</p>}><Content view={view}/></Suspense>}
