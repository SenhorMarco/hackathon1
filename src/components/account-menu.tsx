"use client";
import { useRouter } from 'next/navigation';
import { browserAuth } from '@/lib/auth/browser';
import { useState } from 'react';
export default function AccountMenu({name}:{name:string}) {
 const router=useRouter();
 const [error,setError]=useState('');
 return <div className="account-bar"><span>{name}</span><button onClick={async()=>{const {error}=await browserAuth().auth.signOut();if(error){setError('Não foi possível sair. Tente novamente.');return}try{Object.keys(localStorage).filter(key=>key.startsWith('aula-clara-v3')).forEach(key=>localStorage.removeItem(key));}catch{}router.replace('/login');router.refresh();}}>Sair</button>{error&&<span role="alert">{error}</span>}</div>;
}
