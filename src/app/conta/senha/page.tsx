"use client";
import {useState} from 'react';
import { useRouter } from 'next/navigation';
import {browserAuth} from '@/lib/auth/browser';
import '../../login/login.css';
export default function Password(){const router=useRouter();const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);return <main className="auth-page"><form className="auth-card" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const password=String(new FormData(e.currentTarget).get('password'));const {error}=await browserAuth().auth.updateUser({password});if(error)throw error;router.replace('/');router.refresh();}catch{setMessage('Não foi possível alterar a senha. Solicite um novo link.')}finally{setBusy(false)}}}><h1>Nova senha</h1><label>Senha<input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required/></label><button disabled={busy} className="auth-primary">Salvar senha</button><p role="status">{message}</p><a href="/login">Voltar ao login</a></form></main>}
