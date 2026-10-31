import {z} from 'zod';
import {account,professorRoute} from '@/lib/auth/server';
import {db} from '@/lib/db/server';
const input=z.object({name:z.string().trim().min(1).max(40),subject:z.string().trim().min(1).max(60),period:z.enum(['Manhã','Tarde','Noite'])});
export const POST=professorRoute(async(request:Request)=>{
 const user=(await account())!;const parsed=input.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Dados inválidos.'},{status:400});
 const {data,error}=await db().from('turmas').insert({nome:parsed.data.name,disciplina:parsed.data.subject,turno:parsed.data.period,professor_id:user.id}).select('*').single();
 if(error)throw error;
 return Response.json({id:data.id,databaseId:data.id,name:data.nome,subject:data.disciplina,period:data.turno,color:'olive',students:[],exams:[]},{status:201});
});
