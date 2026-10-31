import 'server-only';
import { db } from '@/lib/db/server';
import { examFromProva } from '@/lib/exams';
import { serializeProva } from '@/lib/db/exams';
import type { ClassRoom } from '@/lib/data';
export async function loadClasses(userId:string):Promise<ClassRoom[]> {
 const {data:rooms,error}=await db().from('turmas').select('*').eq('professor_id',userId).order('created_at');
 if(error)throw error;
 return Promise.all(rooms.map(async(room)=>{
  const [students,exams]=await Promise.all([db().from('alunos').select('*').eq('turma_id',room.id),db().from('provas').select('*').eq('turma_id',room.id).order('created_at',{ascending:false})]);
  if(students.error||exams.error)throw students.error||exams.error;
  return {id:room.id,databaseId:room.id,name:room.nome,subject:room.disciplina,period:room.turno,color:'olive',students:students.data.map(s=>({id:s.referencia_local||s.id,name:s.nome,email:s.email||''})),exams:exams.data.map(p=>examFromProva(serializeProva(p)))};
 }));
}
