"use client";
import { useRouter } from 'next/navigation';
import { browserAuth } from '@/lib/auth/browser';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import styles from './account-menu.module.css';
export default function AccountMenu({name, compact=false}:{name:string;compact?:boolean}) {
 const router=useRouter();
 const [error,setError]=useState('');
 const initials = name.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toLocaleUpperCase('pt-BR');
 return <div className={`${styles.account} ${compact ? styles.compact : styles.bar}`}><div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{initials || 'U'}</span><span className={styles.details}><strong title={name}>{name}</strong><small>Conta conectada</small></span></div><button className={styles.signout} type="button" aria-label="Sair da conta" onClick={async()=>{const {error}=await browserAuth().auth.signOut();if(error){setError('Não foi possível sair. Tente novamente.');return}try{Object.keys(localStorage).filter(key=>key.startsWith('aula-clara-v3')).forEach(key=>localStorage.removeItem(key));}catch{}router.replace('/login');router.refresh();}}><LogOut size={16} aria-hidden="true"/><span>Sair</span></button>{error&&<span className={styles.error} role="alert">{error}</span>}</div>;
}
