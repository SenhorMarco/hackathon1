# Auditoria do MVP — atualização de 04/11/2026

**Escopo:** inspeção do código em `9671668` e execução assistida no deploy `https://hackathon1-blond.vercel.app`. O commit exato servido pelo deploy não foi identificado. O fluxo principal professor → aluno → correção → liberação → devolutiva foi concluído no deploy em prova sintética. Isso não cobre todos os requisitos nem todos os cenários de borda. Os itens abaixo distinguem lacunas verificáveis no código de observações no ambiente real.

## Lacunas confirmadas no código

1. **RN01 — barema fornecido pelo professor não está integrado ao fluxo.** Existe helper para sugerir/analisar barema (`src/lib/ai/barema.ts`, `gerarBarema`), mas não há chamadas a `gerarBarema` no restante de `src`; a rota de análise usa `gerarJson` diretamente e grava `barema_origem: 'sugerido'` (`src/app/api/exams/[examId]/analyze/route.ts:15, 33, 66`). A criação de prova recebe somente o arquivo da prova (`src/app/api/exams/route.ts:10-15, 47-51`). Portanto, a crítica/melhoria de um barema já existente não está ligada à API/UI atual.

2. **RN05 — professor não consegue definir prazo de envio pela aplicação.** A criação da prova não aceita `prazo_envio` (`src/app/api/exams/route.ts:10-15`); a regra de prazo só lê o campo opcional existente e fecha o envio quando expirado (`src/lib/aluno/portal.ts:49-53, 62-70`). Não foi encontrado fluxo de escrita para essa coluna.

3. **RN06/RN07 — exceção ou reabertura individual após o prazo não existe.** O aluno é bloqueado pelo estado global da prova e pelo prazo global (`src/app/api/aluno/provas/[provaId]/envio/route.ts:60-63, 84-87`). Não foi encontrado endpoint ou campo para professor autorizar substituição excepcional por aluno. Substituição normal apaga respostas anteriores e a correção armazenada (`envio/route.ts:27-38`), mas isso não implementa exceção após o prazo.

4. **RN08 — leitura duplicada pode deixar correção travada sem recuperação.** Respostas não identificadas/duplicadas são preservadas para associação humana (`src/lib/correction-rows.ts:3-15`), mas a interface só oferece associação a questões ainda sem resposta (`src/components/correction-review.tsx:136-137`). Se todas as questões já estiverem ocupadas, a UI informa que há duplicata; não há ação para descartar/remover a linha duplicada. A revisão exige exatamente uma linha por questão (`src/lib/review.ts:15-25`), então esse caso não pode ser concluído pelo fluxo disponível sem nova pré-correção, que substitui todas as linhas (`src/app/api/exams/[examId]/submissions/[submissionId]/correct/route.ts:71-79`).

5. **RN17 — alterações no barema após início da correção não são permitidas.** A rota de barema rejeita edição fora dos estados `rascunho`, `analisada` e `barema_pronto` (`src/app/api/exams/[examId]/rubric/route.ts:18-23`); a pré-correção move a prova para `corrigindo` (`src/app/api/exams/[examId]/submissions/[submissionId]/correct/route.ts:31-32`). Não há caminho para avisar sobre respostas validadas afetadas e deixar o professor decidir se reavalia.

6. **RN19 — nota/feedback não podem ser alterados depois da liberação.** A edição da resposta rejeita provas `corrigida` (`src/app/api/exams/[examId]/answers/[answerId]/route.ts:19`), e a edição de devolutiva rejeita prova ou texto publicado (`src/app/api/exams/[examId]/submissions/[submissionId]/feedback/route.ts:97-100`). Assim, falta o fluxo para corrigir resultado já divulgado e indicar a alteração ao aluno.

7. **Upload parcial de fotos invalida a submissão inteira.** Uma troca de fotos por questão preserva os arquivos das demais questões (`src/app/api/aluno/provas/[provaId]/envio/route.ts:104-106`), mas `salvarArquivos` apaga todas as respostas da submissão e limpa toda a correção (`envio/route.ts:27-38`). O comportamento parece mais amplo do que a troca de uma questão; verificar se é a decisão desejada, pois invalida sugestões/validações de páginas não substituídas.

## Verificações ponta a ponta

- [x] Concluir análise real da prova e confirmar estado/barema gravados, inclusive após recarregar a página.
- [x] Envio autenticado do aluno e vínculo das duas fotos às questões corretas foram confirmados após recarregar o portal.
- [x] Executar pré-correção por IA, validar respostas uma a uma, revisar devolutiva, liberar e conferir nota/devolutiva na conta do aluno.
- [ ] Demonstrar caso de resposta duplicada sem questão livre e confirmar se existe recuperação operacional além de reprocessar a submissão.
- [ ] Substituir foto de uma questão após validação e confirmar quais respostas e devolutivas ficam invalidadas.
- [x] Confirmar pelo professor que cada validação atualiza a contagem; a liberação ficou bloqueada enquanto Q2 estava pendente e também enquanto faltava revisar a devolutiva. Liberação explícita concluiu o fluxo.
- [x] Confirmar no relatório final nota validada e liberada. A divergência observada no dashboard está registrada abaixo.
- [ ] Testar prazo e exceção individual quando houver interface de configuração/autorização; hoje esses controles não estão implementados no código.
- [ ] Testar se o aluno vê a nota e o comentário de Q1 antes da liberação geral (o estado parcial foi visto pelo professor; a conta de aluno só foi conferida após liberação).
- [ ] Testar resposta ilegível/ausente, duplicidade sem questão livre, substituição de foto depois da validação, concorrência e isolamento real entre múltiplas contas.
- [ ] Executar agrupamento por abordagem (funcionalidade opcional, não exercitada nesta sessão).

## Evidência de execução no deploy

- `/api/health` respondeu 200 e verificou banco/Storage.
- Acesso anônimo a `GET /api/exams` e chamadas anônimas a criação de turma/prova, liberação e envio do aluno retornaram 401.
- Login pela interface funcionou; foi criada turma sintética e enviado arquivo de prova com duas questões.
- A IA identificou as duas questões com pontuação máxima de 5 cada: equação `2x + 3 = 11` e área de retângulo de lados 3 cm e 4 cm. Respostas de referência corretas: `x = 4` e `12 cm²`.
- O professor alterou um critério da questão 1, confirmou o barema e recarregou a página. Turma, prova, estado Aguardando respostas e critério alterado permaneceram salvos.
- Sem submissões, a aba Correção informa Aguardando as provas dos alunos e não oferece liberação.
- A conta de aluno de teste foi cadastrada e vinculada à turma; o portal abriu a prova sintética `5360ce3d-b9de-41c9-8eae-e33af795a69a`.
- Envio pela interface: após `resposta-q1.png`, o portal indicou 1/2 questões enviadas; após `resposta-q2.png`, indicou 2/2 e Tudo enviado. O contador permaneceu em 0/2 corrigidas e a nota apareceu como `—`. Após recarregar, os dois arquivos continuaram salvos e vinculados às questões corretas. Evidência visual: `tmp/deploy-qa-2026-11-03/02-aluno-envio-completo.jpg`.
- Na sessão do professor, a submissão mostrou o aluno confirmado e as duas imagens. A IA transcreveu corretamente as respostas e sugeriu 5/5 em ambas. Uma tentativa de atribuir 6/5 foi rejeitada com a mensagem “Informe uma nota entre 0 e 5”. Q1 foi validada com nota 5 e comentário editado; a contagem mostrou 1/2 e Q2 pendente, com liberação bloqueada. Depois de validar Q2 com 5 e comentário editado, a tela mostrou 2/2 respostas e 1 prova completa, mas manteve a liberação bloqueada até a revisão da devolutiva.
- A IA gerou a devolutiva completa. O professor editou o resumo e a dica da Q2 e aprovou o texto; o indicador mostrou zero textos pendentes. O CSV baixado antes da liberação continha `5, 5, 10, Validado · não liberado`. Ao liberar, a interface confirmou sucesso; após recarregar, a prova apareceu como Concluída e o relatório mostrou 10/10 Liberado.
- Na conta do aluno, o portal mostrou 1 prova corrigida, devolutiva disponível e 10/10. A prova mostrou 2/2 corrigidas e 10/10, sem controles para enviar, remover ou substituir arquivos. A devolutiva apresentou os textos finais, incluindo as duas edições do professor, e os gabaritos dos exercícios estavam corretos. Evidências: `tmp/deploy-qa-2026-11-03/05-devolutiva-aluno.jpg` e `06-aluno-nota-final.jpg`.
- **Inconsistência transitória a investigar:** imediatamente após clicar em Liberar, a mensagem de sucesso e o cabeçalho Concluída apareceram, mas a tabela ainda indicava “não liberado” durante a observação. Após recarregar, relatório e portal mostraram o estado liberado corretamente. Não há evidência de falha persistente. Evidências: `03` (liberação) e `04` (dashboard), em `tmp/deploy-qa-2026-11-03/`.
- **Falha observada no dashboard:** após recarregar, o gráfico Média da turma mostrou 0,0 e o cartão de média mostrou `—`, apesar de o relatório da prova mostrar 10/10 liberado. O código de `HistoryChart` calcula a média a partir de `exam.responses` (`src/components/workspace.tsx:115`), enquanto a conversão de provas persistidas inicializa `responses: {}` (`src/lib/exams.ts:10`). Corrigir primeiro essa leitura de dados; o relatório detalhado consultado pelo professor apresentou o resultado correto.
- Dados sintéticos mantidos: turma `TESTE MVP 03-11-2026`, prova `TESTE MVP — Duas questões — 03/11`. Arquivos locais e evidência visual em `tmp/deploy-qa-2026-11-03/` (ignorado pelo Git).
- Nenhum e-mail pessoal ou senha do aluno foi registrado no relatório.

## Prioridades

1. **P0 — corrigir o dashboard:** carregar notas persistidas para média da turma e histórico, e conferir que os números coincidem com os relatórios. A exibição de zero como resultado real deve ser corrigida antes de confiar no painel para decisões pedagógicas.
2. **P0 — tratar as lacunas funcionais de RN01, RN05/RN06, RN08, RN17 e RN19 listadas acima.** Elas permanecem mesmo com o fluxo principal concluído.
3. **Investigar a atualização da tabela logo após liberação:** observação transitória; testar novamente antes de concluir que há defeito persistente.

A inspeção de código foi delegada a um subagente; as verificações HTTP e de navegador acima foram executadas pelo agente principal. A conclusão confirma o fluxo principal na prova sintética, não certifica o MVP inteiro. Nenhum arquivo de implementação foi alterado nesta auditoria.

## Correção posterior — média do painel

Em 04/11, a falha da média foi corrigida no commit `c93da05`. O carregamento inicial e a atualização da turma passam a trazer respostas completas e validadas do servidor. O painel distingue zero revisado de ausência de nota e informa a cobertura de alunos. A liberação também solicita atualização dos resultados do painel.

Build, TypeScript, lint e testes de revisão/dashboard passaram; os testes HTTP de permissões também passaram. Os testes de cálculo incluem média 10, zero real, notas ausentes, cobertura parcial, duplicatas, teto por questão e referência local de alunos.

Após a Vercel indicar publicação concluída, a conta de professor recarregou a mesma turma de teste: o cartão e o gráfico passaram a mostrar **10,0**, com **1/1 aluno**, em acordo com o relatório detalhado. Evidência local: `tmp/deploy-qa-2026-11-03/07-dashboard-media-corrigida.jpg`. A inconsistência transitória imediatamente após liberação permanece como investigação separada; não foi repetida nesta validação.
