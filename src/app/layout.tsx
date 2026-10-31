import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Aula Clara | Espaço do professor', description: 'Cada resposta, uma nova oportunidade de ensinar. Gerencie turmas, provas e correções assistidas.' };
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>}
