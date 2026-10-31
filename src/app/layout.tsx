import type { Metadata } from 'next';
import './globals.css';
import './login/login.css';
export const metadata: Metadata = { title: 'Aula Clara | Espaço do professor', description: 'Gerencie turmas, provas e correções.' };
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>}
