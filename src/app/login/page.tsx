"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserAuth } from '@/lib/auth/browser';
import './login.css';
export default function Login() {
 const router=useRouter();
 const [mode,setMode]=useState<'login'|'signup'|'reset'>('login');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function submit(event:React.FormEvent<HTMLFormElement>) {
  event.preventDefault();setBusy(true);setMessage('');
  const form=new FormData(event.currentTarget), email=String(form.get('email')).trim(),password=String(form.get('password')||'');
  try {
   const client=browserAuth();
   if(mode==='reset') {
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/auth/callback?next=/conta/senha'});
    if(error) throw error;setMessage('Se houver uma conta para este e-mail, você receberá as instruções.');
   } else if(mode==='signup') {
    const {data,error}=await client.auth.signUp({email,password,options:{data:{nome:String(form.get('nome')).trim(),papel:form.get('papel')},emailRedirectTo:location.origin+'/auth/callback'}});
    if(error) throw error;
    if(data.session) {router.replace('/');router.refresh();}else setMessage('Confira seu e-mail para confirmar a conta. Depois, entre com sua senha.');
   } else {
    const {error}=await client.auth.signInWithPassword({email,password});
    if(error) throw error;router.replace('/');router.refresh();
   }
  } catch {setMessage(mode==='login'?'Não foi possível entrar. Confira e-mail, senha e a confirmação do e-mail.':'Não foi possível concluir. Confira os dados ou tente novamente mais tarde.');}
  finally {setBusy(false);}
 }
 return <main className="auth-page"><section className="auth-card"><a href="/login" className="auth-brand">aula clara</a><h1>{mode==='login'?'Bem-vindo de volta':mode==='signup'?'Crie sua conta':'Recupere sua senha'}</h1><p>Seu espaço para aprender e ensinar.</p><form onSubmit={submit}>
 {mode==='signup'&&<><label>Nome completo<input name="nome" required minLength={2} maxLength={100} autoComplete="name"/></label><label>Tipo de conta<select name="papel"><option value="aluno">Aluno</option><option value="professor">Professor</option></select></label></>}
 <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
 {mode!=='reset'&&<label>Senha<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode==='signup'?'new-password':'current-password'}/></label>}
 {message&&<p role="status">{message}</p>}<button className="auth-primary" disabled={busy}>{busy?'Aguarde…':mode==='login'?'Entrar':mode==='signup'?'Criar conta':'Enviar instruções'}</button></form>
 <button className="auth-link" onClick={()=>{setMode(mode==='signup'?'login':'signup');setMessage('')}}>{mode==='signup'?'Já tenho uma conta':'Criar conta de aluno ou professor'}</button><button className="auth-link" onClick={()=>{setMode(mode==='reset'?'login':'reset');setMessage('')}}>{mode==='reset'?'Voltar ao login':'Esqueci minha senha'}</button></section></main>;
}
