# Teste de prazos no deploy — 09/11/2026

**Status: em andamento.** O deploy testado contém a funcionalidade do commit `eedc958`. A migração foi verificada: health do endpoint real confirmou campos disponíveis, função do servidor disponível e bloqueio de RPC anônima. A configuração do professor e o primeiro envio bloqueado para A, mais envio/substituição aceitos para B, foram conferidos na sessão de aluno. Revogação e bloqueio de solicitação iniciada por página antiga seguem pendentes.

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
- A prova B continua em rascunho, sem análise por IA, portanto esses envios testam recebimento e substituição de arquivo, não correção. Uma aba antiga ainda mostrava Q1 selecionada e o botão Substituir; a ação não foi acionada nessa aba.

## Próximas verificações

- [x] Confirmar na interface do aluno que o primeiro envio para A, com prazo expirado, é bloqueado.
- [x] Confirmar que B aceita envio e substituição de arquivo dentro da exceção individual; a lista passou a mostrar somente o arquivo substituto.
- [ ] Retornar à sessão do professor, revogar a exceção de B e confirmar com a conta de aluno que o servidor bloqueia um envio iniciado pela página antiga ainda aberta.
- [ ] Testar o limite exato do prazo, incluindo envio que cruza o horário de encerramento.
- [ ] Verificar isolamento das exceções entre múltiplas contas de aluno.

Testes locais de SQL cobriram regras de prazo; não são evidência de validação da interface nem dos envios reais acima. Uma tentativa de captura da página inteira falhou; este relatório não a considera evidência. Nenhum e-mail pessoal ou token foi registrado. O relatório não declara todos os casos aprovados enquanto os testes do portal do aluno estiverem pendentes.
