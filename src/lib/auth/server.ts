import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { db } from '@/lib/db/server';
export async function authClient() {
 const store = await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  cookies: { getAll: () => store.getAll(), setAll: values => { try { values.forEach(({name,value,options}) => store.set(name,value,options)); } catch { /* O proxy renova os cookies durante renderização. */ } } }
 });
}
export const account = cache(async () => {
 const client = await authClient();
 const {data:{user},error} = await client.auth.getUser();
 if(error || !user || !user.email_confirmed_at) return null;
 const {data:profile,error:profileError} = await db().from('perfis').select('id,nome,papel').eq('id',user.id).single();
 if(profileError) throw new Error('Execute a migração de contas no Supabase.');
 return {...profile, email:user.email!} as {id:string;nome:string;papel:'professor'|'aluno';email:string};
});
export function professorRoute<C>(handler:(request:Request,context:C)=>Promise<Response>) {
 return async (request:Request,context:C) => {
  try {
   const user = await account();
   if(!user) return Response.json({error:'Entre na sua conta.'},{status:401});
   if(user.papel !== 'professor') return Response.json({error:'Acesso exclusivo de professores.'},{status:403});
   if(!['GET','HEAD'].includes(request.method) && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({error:'Origem inválida.'},{status:403});
   const match = new URL(request.url).pathname.match(/^\/api\/exams\/([^/]+)/);
   if(match) {
    if(!/^[0-9a-f-]{36}$/i.test(match[1])) return Response.json({error:'Prova inválida.'},{status:400});
    const {data,error} = await db().from('provas').select('turmas!inner(professor_id)').eq('id',match[1]).eq('turmas.professor_id',user.id).maybeSingle();
    if(error) throw error;
    if(!data) return Response.json({error:'Prova não encontrada.'},{status:404});
   }
   return await handler(request,context);
  } catch { return Response.json({error:'Não foi possível acessar a conta. Confira a configuração e a migração do banco.'},{status:500}); }
 };
}
