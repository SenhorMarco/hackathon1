import {Suspense} from 'react';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {account} from '@/lib/auth/server';
import {db} from '@/lib/db/server';
import AccountMenu from '@/components/account-menu';
async function Content(){
 const user=await account();if(!user)redirect('/login');if(user.papel!=='aluno')redirect('/professor/dashboard');
 const {data:students,error}=await db().from('alunos').select('id,nome,turmas(nome)').eq('email',user.email.toLowerCase());if(error)throw error;
 const {data:submissions,error:se}=await db().from('submissoes').select('id,provas(titulo)').in('aluno_id',students.map(s=>s.id));if(se)throw se;
 const {data:feedbacks,error:fe}=await db().from('feedbacks').select('submissao_id,token').in('submissao_id',submissions.map(s=>s.id)).eq('publicado',true);if(fe)throw fe;
 return <><AccountMenu name={user.nome}/><main className="student-home"><h1>Meu aprendizado</h1><p>As devolutivas aparecem aqui após a publicação pelo professor. Peça que ele cadastre você na turma usando o e-mail {user.email}.</p>{!students.length&&<p>Você ainda não está vinculado a nenhuma turma.</p>}{submissions.map(s=>{const feedback=feedbacks.find(f=>f.submissao_id===s.id);return <article key={s.id}><h2>{(s.provas as unknown as {titulo:string})?.titulo||'Prova'}</h2>{feedback?<Link href={'/aluno/'+feedback.token}>Ver minha devolutiva</Link>:<p>Aguardando publicação do professor.</p>}</article>})}</main></>;
}
export default function Page(){return <Suspense fallback={<p>Carregando suas provas…</p>}><Content/></Suspense>}
