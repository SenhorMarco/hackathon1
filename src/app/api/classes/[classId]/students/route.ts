import {z} from 'zod';
import {account,professorRoute} from '@/lib/auth/server';
import {db} from '@/lib/db/server';
export const POST=professorRoute(async(request:Request,context:{params:Promise<{classId:string}>})=>{
 const user=(await account())!,{classId}=await context.params;
 if(!z.uuid().safeParse(classId).success)return Response.json({error:'Turma inválida.'},{status:400});
 const {data:room,error:roomError}=await db().from('turmas').select('id').eq('id',classId).eq('professor_id',user.id).maybeSingle();
 if(roomError)throw roomError;if(!room)return Response.json({error:'Turma não encontrada.'},{status:404});
 const parsed=z.object({name:z.string().trim().min(3).max(100),email:z.email().max(254)}).safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Dados inválidos.'},{status:400});
 const id=crypto.randomUUID();const {error}=await db().from('alunos').insert({id,referencia_local:id,turma_id:classId,nome:parsed.data.name,email:parsed.data.email.toLowerCase()});
 if(error)throw error;return Response.json({id,...parsed.data},{status:201});
});
