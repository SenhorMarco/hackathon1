import type { Metadata } from 'next';
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from 'next/font/google';
import './globals.css';
import './login/login.css';

// Títulos com personalidade; texto em uma fonte desenhada para leitura fácil.
const titulo = Bricolage_Grotesque({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-titulo', display: 'swap' });
const texto = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-texto', display: 'swap' });

export const metadata: Metadata = { title: 'Gaider | Espaço do professor', description: 'Gerencie turmas, provas e correções.' };
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="pt-BR" className={`${titulo.variable} ${texto.variable}`}><body>{children}</body></html>}
