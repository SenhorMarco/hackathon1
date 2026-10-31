'use client';

import styles from './aluno.module.css';

export default function Error({ retry }: { retry: () => void }) {
  return <main className={styles.page}>
    <section className={styles.card} role="alert">
      <h1>Não foi possível carregar sua devolutiva</h1>
      <p>Tente novamente. Se o problema continuar, fale com seu professor.</p>
      <button className="button primary" onClick={retry}>Tentar novamente</button>
    </section>
  </main>;
}
