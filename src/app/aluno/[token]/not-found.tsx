import styles from './aluno.module.css';

export default function NotFound() {
  return <main className={styles.page}>
    <section className={styles.card}>
      <h1>Devolutiva indisponível</h1>
      <p>Confira se o link está completo e se o professor já liberou sua correção.</p>
      <p>Se o problema continuar, peça o link ao professor.</p>
    </section>
  </main>;
}
