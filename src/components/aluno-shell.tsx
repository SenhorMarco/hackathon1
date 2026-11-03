import Link from 'next/link';
import { BookOpen, ChevronRight, FileText, GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';
import AccountMenu from './account-menu';
import styles from './aluno-shell.module.css';

export default function AlunoShell({name, children, title = 'Minhas provas', professor = false}:{name:string;children:ReactNode;title?:string;professor?:boolean}) {
 const home = professor ? '/professor/dashboard' : '/aluno';
 return <div className={styles.app}>
  <aside className={styles.sidebar}>
   <Link href={home} className={styles.brand}><span className={styles.brandIcon}><BookOpen size={24}/></span><span>Gaider</span></Link>
   <div className={styles.label}>{professor ? 'ÁREA DO PROFESSOR' : 'ÁREA DO ALUNO'}</div>
   <div className={styles.school}><span className={styles.schoolIcon}><GraduationCap size={19}/></span><div><strong>{professor ? 'Professor' : 'Aluno'}</strong><small>Conta conectada</small></div></div>
   <div className={styles.navLabel}>PRINCIPAL</div>
   <nav><Link href={home} className={styles.navItem}><FileText size={19}/>{professor ? 'Voltar ao painel' : 'Minhas provas'}</Link></nav>
  </aside>
  <div className={styles.main}><header className={styles.topbar}><div className={styles.breadcrumb}><Link href={home}>{professor ? 'Painel' : 'Minhas provas'}</Link>{title !== 'Minhas provas' && <><ChevronRight size={14}/><strong>{title}</strong></>}</div><AccountMenu name={name} compact/></header>{children}<footer className={styles.footer}><BookOpen size={14}/> Gaider</footer></div>
 </div>;
}
