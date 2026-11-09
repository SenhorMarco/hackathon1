# Teste de prazos no deploy — 09/11/2026

**Status: aprovado no deploy, incluindo os cenários adicionais.** O deploy testado contém a funcionalidade do commit `eedc958` e a correção de interface `e380e53`. A migração foi verificada: health do endpoint real confirmou campos disponíveis, função do servidor disponível e bloqueio de RPC anônima. Foram conferidos configuração pelo professor, primeiro envio bloqueado na interface, envio/substituição com exceção, revogação, upload atravessando o prazo, isolamento entre contas e concorrência. A conclusão e a evidência automatizada estão no final deste relatório.

## Preparação

- Na turma sintética existente `TESTE MVP 03-11-2026`, foram criadas duas provas novas: `TESTE PRAZOS — bloqueada — 09/11` e `TESTE PRAZOS — exceção — 09/11`.
- Foi enviada a prova `prova.png` sem executar análise por IA. O arquivo foi aceito e a prova permaneceu em rascunho, disponível no portal para o teste de envio do aluno.
- A prova já publicada com nota 10/10 foi mantida sem alterações.

## Resultados confirmados

- **Prova A — prazo encerrado sem exceção:** prazo geral configurado para 08/11/2026 às 12:00, fuso `America/Sao_Paulo`; zero exceções. Após salvar e reabrir, a configuração persistiu.
- **Prova B — exceção individual:** mesmo prazo geral expirado; exceção de envio para o aluno de teste configurada até 10/11/2026 às 18:00, fuso `America/Sao_Paulo`. A configuração foi salva.
- Ao navegar entre provas, apareceram painéis de prazo duplicados por compartilhamento incorreto de estado entre componentes. As chaves dos componentes foram corrigidas no `workspace.tsx`; a correção foi enviada no commit `e380e53`, publicado com sucesso pela Vercel.
- Depois de recarregar e alternar entre B e A, a interface mostrou um único painel por prova, o prazo correspondente à prova A e zero exceções. A evidência local da exceção salva está em `tmp/deploy-prazos-2026-11-09/02-excecao-salva.jpg`.
- Na conta do aluno, A apareceu em Encerradas sem envio com prazo de 08/11 às 12h. Ao abrir a prova, o portal informou “Esta prova não está mais recebendo envios” e não ofereceu upload. Evidência: `tmp/deploy-prazos-2026-11-09/03-primeiro-envio-bloqueado.jpg`. Isso confirma o bloqueio na interface para o primeiro envio; a tentativa direta contra o servidor ainda não foi feita.
- B apareceu em Para enviar com prazo efetivo até 10/11 às 18h. O aluno enviou `resposta-q1.png` com sucesso (“Arquivo enviado”) e depois substituiu por `resposta-q2.png` (“Foto substituída”). Após a substituição, o portal passou a listar apenas a imagem da Q2. O caminho de upload/RPC real aceitou ambas as ações. Evidência: `tmp/deploy-prazos-2026-11-09/04-envio-e-substituicao-permitidos.jpg`.
- A prova B continua em rascunho, sem análise por IA, portanto esses envios testam recebimento e substituição de arquivo, não correção.
- **Revogação:** com a primeira aba do aluno preservada sem recarregar, o professor removeu a exceção de B na segunda aba e salvou. A interface confirmou “Prazos salvos.”, mantendo o prazo geral vencido e sem prazo individual. Evidência: `tmp/deploy-prazos-2026-11-09/05-excecao-revogada.jpg`.
- Após retornar à conta de aluno na segunda aba, a primeira ainda mostrava o prazo individual antigo, `resposta-q1.png` selecionada e o botão Substituir. Ao acioná-lo, a solicitação real foi recusada no preparo do envio com “Esta prova não está recebendo envios.” Evidência: `tmp/deploy-prazos-2026-11-09/06-servidor-bloqueou-pagina-antiga.jpg`. A página antiga não contornou a regra do servidor.
- Ao recarregar a primeira aba, o prazo efetivo passou a 08/11 às 12h, apareceu “Esta prova não está mais recebendo envios.” e os controles de upload desapareceram. O arquivo persistido continuou sendo `resposta-q2.png`. A prova anterior publicada continuou aparecendo com devolutiva 10/10 no portal.

## Próximas verificações

- [x] Confirmar na interface do aluno que o primeiro envio para A, com prazo expirado, é bloqueado.
- [x] Confirmar que B aceita envio e substituição de arquivo dentro da exceção individual; a lista passou a mostrar somente o arquivo substituto.
- [x] Revogar a exceção de B e confirmar com a conta de aluno que o servidor bloqueia um envio iniciado pela página antiga ainda aberta, preservando o arquivo anterior.
- [x] Testar o instante final nas regras locais e, no deploy, um upload autorizado antes do prazo com confirmação depois dele.
- [x] Verificar isolamento das exceções entre múltiplas contas de aluno no deploy.
- [x] Verificar primeiros envios concorrentes, substituições com a mesma versão anterior e edição simultânea de prazos no banco/deploy reais.

Os testes locais de SQL não substituem a validação no deploy. O teste manual da página antiga foi recusado antes da autorização de upload; a automação descrita na conclusão complementa essa evidência com um upload já autorizado. Uma tentativa de captura da página inteira falhou; este relatório não a considera evidência. Nenhum e-mail pessoal ou token foi registrado. As imagens locais em `tmp` não são versionadas; este relatório registra os resultados reproduzidos.

## Testes adicionais automatizados locais — 09/11/2026

Os três cenários restantes foram exercitados localmente com a implementação real. Não foram encontradas falhas na funcionalidade; esta atualização acrescenta testes e documentação.

- **PGlite / SQL:** exceção de A não autoriza B da mesma turma. Transação iniciada antes do prazo e finalizada após ele é recusada; arquivo, respostas e feedback permanecem intactos. Migração reaplicável e demais verificações anteriores também passaram.
- **Handlers + PostgreSQL PGlite:** `testar-envio-prazos.mjs` executou os handlers reais, consulta de acesso do portal, assinatura/verificação dos tickets e RPC SQL. Autenticação e Storage foram simulados. Foram aprovados: ticket preparado e arquivo armazenado antes do fechamento com POST posterior recusado; B sem exceção impedido de enviar e de reutilizar ticket de A; B com acesso aberto ainda impedido de usar ticket de outra identidade; prazo vencendo durante a leitura do arquivo, depois da primeira checagem do POST; exceção revogada durante essa mesma etapa. Em todas as recusas, arquivo e correção anteriores foram preservados.
- **PostgreSQL nativo 18.6 / três conexões:** `testar-prazos-concorrencia.mjs` confirmou sobreposição real ao observar `wait_event_type = Lock` na segunda conexão antes de liberar a primeira. Primeiro envio simultâneo não duplicou submissão; substituições da mesma versão tiveram apenas uma vencedora; revogação concorrente foi respeitada; espera por bloqueio que atravessou o prazo terminou em recusa. As recusas preservaram os dados anteriores; somente a substituição aceita invalidou a correção antiga. O servidor temporário foi encerrado ao final.

Na conclusão dessa etapa local, a repetição no deploy aguardava as variáveis do Supabase. A configuração foi fornecida depois e a execução real foi concluída conforme abaixo.

## Conclusão dos testes reais no deploy — 09/11/2026

Execução `TESTE_PRAZOS_FINAL_1794236064439`, das **11:54:24 às 11:55:35**, horário de Brasília (`America/Sao_Paulo`), contra `https://hackathon1-blond.vercel.app` e seu Supabase real. Resultado: **seis verificações aprovadas**, sem chamadas de IA.

1. Arquivo foi autorizado e armazenado antes do encerramento. A confirmação com o mesmo ticket após o prazo recebeu HTTP 409; o caminho anterior, a resposta corrigida e o feedback foram mantidos.
2. Duas contas de aluno na mesma turma: A recebeu exceção e conseguiu enviar; B permaneceu bloqueado. Com o prazo aberto para ambos, B também foi impedido de reutilizar o ticket de A.
3. Dois primeiros envios HTTP simultâneos: um recebeu 201 e outro 409. Persistiu uma única submissão.
4. Duas chamadas concorrentes à RPC real com a mesma versão anterior: uma foi aceita, outra recusada com P0001. Persistiu somente a versão vencedora. Esse caso usa diretamente a função transacional do servidor, em vez de duas substituições pela interface.
5. Duas edições concorrentes de prazo com a mesma revisão: uma recebeu 200 e outra 409.
6. A conta de aluno autenticada não pôde executar a RPC diretamente: permissão negada, código 42501.

Foram criados um professor, dois alunos e três provas sintéticos nessa execução. As três provas foram encerradas ao final, sem exceções. Uma tentativa anterior criou outra turma sintética com uma prova também encerrada; os registros identificados foram mantidos para auditoria. As provas existentes não foram alteradas por essa automação.

Antes da execução aprovada, foram corrigidos dois problemas do próprio roteiro: senha sintética acima do limite aceito pelo Auth e resposta de teste sem os dados de legibilidade/barema exigidos pelo banco. O roteiro passou a gerar senha compatível, preparar uma correção legível com barema manual e informar a etapa/código de erro sem expor credenciais. Esses ajustes não alteraram o comportamento do aplicativo nem desativaram validações.

Evidência versionada sem credenciais, identificadores de contas ou caminhos de arquivos: [prazos-deploy-2026-11-09.json](evidencias/prazos-deploy-2026-11-09.json). Relatório completo local: `tmp/TESTE_PRAZOS_FINAL_1794236064439/resultado.json`. As variáveis de ambiente permanecem fora do Git.

O instante exato em milissegundos e a espera por bloqueio atravessando o prazo foram verificados localmente; no deploy, a confirmação ocorreu após o encerramento com uma margem de 1,5 segundo. Com os testes manuais, locais e automatizados reais acima, a tarefa de prazos e exceção individual pode ser concluída no kanban.
