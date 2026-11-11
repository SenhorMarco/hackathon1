# Publicação transacional no deploy — 11/11/2026

**Status: migração inicial aplicada e implementação publicada; ajuste de conflito precisa ser reaplicado para concluir o teste integrado.** Implementação `fafef63`, integrada à main e publicada na Vercel. A chamada de leitura a `snapshot_publicacao` passou a retornar 200. Não havia commits novos da equipe ao integrar a branch.

## Problema encontrado e correção

O roteiro `scripts/testar-publicacao-deploy.mjs`, com dois alunos e duas questões, passou pelos bloqueios de acesso, cobertura incompleta, nota acima do teto, feedback ausente, aprovação parcial e hash antigo de devolutiva. A execução `TESTE_PUBLICACAO_1794438181004` parou ao testar um snapshot antigo diretamente na RPC: o conflito esperado não foi retornado. Uma chamada de diagnóstico somente com snapshot diferente excedeu 45 segundos.

A versão inicial usava `40001` para sinalizar esse conflito de negócio. A [documentação oficial do Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) registra que esse código provoca repetição de transações em versões do PostgREST e recomenda `PT409` para um conflito HTTP 409. A migração foi corrigida para `PT409`, a API passou a reconhecer esse código e os testes foram atualizados. A comparação dos dados e as garantias de transação foram preservadas.

Os testes completos de PostgreSQL nativo com três conexões e o roteiro local da API passaram novamente com `PT409`. Os clientes do novo teste de deploy ganharam limite de 45 segundos e registro da etapa anterior às RPCs. A versão corrigida ainda precisa ser aplicada no banco; não foi feita uma nova tentativa deliberada de conflito contra a função antiga.

**Ainda não certificados por esta execução:** publicação conjunta dos dois alunos, repetição, isolamento cruzado da devolutiva e bloqueios pós-publicação no novo roteiro. A regressão de leitura abaixo já publicou uma prova de um aluno com sucesso, mas não substitui esses cenários. A prova sintética da execução interrompida teve o prazo encerrado, sem publicar resultados.

## Para retomar

1. Executar novamente todo o arquivo atualizado `supabase/publicacao.sql` no SQL Editor do mesmo projeto. Ele pode ser reaplicado e preserva os dados.
2. Executar `supabase/diagnostico-publicacao.sql`, que somente lista chamadas de publicação ainda ativas. Se houver linhas, verificar os PIDs e horários antes de encerrar qualquer processo; não reiniciar o projeto nem encerrar sessões indiscriminadamente. O Supabase alerta que uma transação já presa em repetição pode continuar mesmo após corrigir a função.
3. Repetir `node scripts/testar-publicacao-deploy.mjs https://hackathon1-blond.vercel.app --criar-dados-sinteticos` e registrar o resultado. Manter o card Testando até aprovação.

## Regressão após a atualização

Os testes foram executados contra `https://hackathon1-blond.vercel.app`, com contas, turmas, provas e arquivos sintéticos. Não houve chamadas de IA nem alterações em provas anteriores à campanha.

- **Leituras: dez verificações aprovadas**, das 19:56:49 às 19:57:32, horário de Brasília. Cobrem autenticação, preservação e desconsideração reversível de duplicatas, associação, conferência de leitura incerta, ausência versus branco sem nota automática, versões antigas, aprovação da devolutiva, publicação e acesso do aluno. Execução `TESTE_LEITURAS_1794437809682`.
- **Prazos e envios: seis verificações aprovadas**, das 19:57:47 às 19:58:53. Incluem upload preparado antes e confirmado após o prazo, preservação dos dados recusados, exceção isolada entre alunos, dois primeiros envios concorrentes, substituições concorrentes, edição concorrente de prazo e negação da RPC à conta de aluno. Execução `TESTE_PRAZOS_FINAL_1794437867726`.

As fixtures foram preservadas para auditoria, com seus prazos encerrados. Os relatórios completos ficam em `tmp/<execução>/resultado.json`, ignorados pelo Git. A [evidência resumida versionada](evidencias/publicacao-deploy-2026-11-11.json) inclui apenas verificações, horários e contagens, sem contas, tokens, chaves ou caminhos privados.

## Limites

Os testes autenticados por HTTP certificam os fluxos exercitados no deploy, sem avaliar acurácia pedagógica ou leitura óptica da IA. A falha sintética e a espera por locks com três conexões foram verificadas no PostgreSQL local, conforme [relatório técnico](TESTE_PUBLICACAO_2026-11-10.md); não se instalam triggers de falha no banco de produção.

RN17 (mudanças no barema após começar a correção) e RN19 (reabertura e mudanças após divulgação) continuam em cartões separados. A campanha geral também mantém seus testes pendentes de substituição por questão após validação, notas parciais vistas pelo aluno, agrupamento e IA com digitalizações.
