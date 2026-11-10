# Leituras pendentes e duplicadas — 10/11/2026

**Status: implementado e aprovado no deploy.** Implementação `031f3ed`, publicada pela Vercel e integrada à main. Nenhuma migração adicional de banco foi necessária.

## O que mudou

- O professor pode comparar uma leitura duplicada com a resposta já identificada da mesma entrega, conferir o arquivo e justificar sua desconsideração. Conteúdo claramente externo à prova também pode ser desconsiderado explicitamente.
- A linha, a transcrição, o arquivo e as demais notas permanecem preservados. A decisão registra motivo, autoria e data em `correcao.resolucaoLeitura` e `historicoLeitura`. Não há exclusão permanente da leitura por essa ação.
- Leituras desconsideradas deixam de bloquear a revisão e não entram em total, média, CSV ou texto da devolutiva. O histórico continua no cálculo da versão da revisão.
- A decisão pode ser reaberta antes da publicação; a leitura volta à fila e a devolutiva anterior fica desatualizada. Solicitações antigas são rejeitadas e repetir a mesma decisão não duplica o histórico nem remove um texto novo preparado posteriormente.
- A associação a uma questão livre continua disponível. Após associar, o professor deve conferir a leitura antes de validar a nota; nenhuma nota sugerida da questão incerta é reaproveitada.
- O registro manual distingue resposta legível, página visivelmente em branco, página ausente e leitura ilegível. Ausência/ilegibilidade continuam pendentes. Página em branco é registrada sem nota e só recebe zero por ação explícita do professor.
- A conferência humana de uma leitura incerta passa a ser persistida junto da validação, mantendo a indicação anterior. Isso é compatível com a validação existente no banco.
- Uma nova pré-correção não sobrescreve notas, transcrições manuais ou decisões de leitura já registradas. A substituição autorizada de arquivo continua invalidando a correção anterior pelo fluxo existente.

## Verificação local

- TypeScript e lint dos arquivos alterados aprovados.
- Testes de revisão, handlers, pendências e dashboard aprovados, incluindo resolução, reversão, versões antigas, identidade do alvo da duplicata, idempotência, preservação e invalidação da devolutiva.
- O dashboard ignora apenas marcadores de resolução completos em linhas técnicas; metadados incompletos e qualquer resposta associada positivamente continuam sujeitos às verificações normais.
- Build de produção com `next build --webpack` aprovado. O build local com Turbopack ficou sem avançar e foi interrompido; o deploy padrão da Vercel foi publicado com sucesso.
- A interface real foi exercitada no navegador com API e dados simulados: comparação da duplicata, justificativa/conferência obrigatórias, associação manual, consulta da leitura preservada, reabertura e ausência de ação de registro para página ausente. Evidência local: `tmp/leituras-ui-2026-11-10/02-pendencia-reaberta.jpg`.
- O roteiro HTTP antigo com Supabase simulado (`testar-contas.mjs`) não foi considerado aprovado neste build: a sessão artificial recebeu 401 onde o teste esperava 403. O build foi feito com configuração pública real; essa limitação do roteiro não substitui a verificação de autenticação real abaixo, que retornou os códigos esperados.

## Verificação real no deploy

Execução `TESTE_LEITURAS_1794333232023`, das **14:53:52 às 14:54:52**, horário de Brasília, contra `https://hackathon1-blond.vercel.app` e seu Supabase. Foram usadas uma turma, uma prova de quatro questões, duas contas sintéticas e um PNG de teste; **zero chamadas de IA**. Dez verificações foram aprovadas:

1. Usuário anônimo recebeu 401 e conta de aluno recebeu 403 ao tentar decidir uma leitura.
2. A revisão retornou a versão da leitura, e a publicação inicial ficou bloqueada pelas pendências.
3. A duplicata foi desconsiderada e continuou no banco com texto e notas nulas; a nota 2 da Q1 e seu comentário ficaram intactos. O arquivo foi conferido byte a byte. A repetição não duplicou o histórico.
4. Versão antiga, nova pré-correção sobre decisões humanas e registro manual enquanto existiam pendências receberam 409.
5. Conteúdo externo à prova foi desconsiderado explicitamente. A leitura desconhecida foi associada à Q3; sua validação exigiu conferência humana e preservou a indicação anterior de leitura incerta.
6. A Q2 ilegível permaneceu sem nota até a conferência explícita do professor. A validação confirmada foi persistida com sucesso.
7. Reabrir a duplicata restaurou os bloqueios. Página ausente, texto vazio e situação ilegível não foram aceitos como resposta em branco. Novo arquivamento gerou o terceiro evento do histórico.
8. Q4 visivelmente em branco foi registrada com nota e comentário nulos. Tentativa de criar outra resposta foi recusada. Zero só foi salvo na validação explícita seguinte.
9. Uma devolutiva sintética preparada manualmente, baseada na revisão atual e aprovada pela API, permitiu a publicação após todas as questões serem validadas.
10. A conta do aluno abriu a devolutiva publicada, sem aviso de correção incompleta nem texto externo arquivado. A publicação impediu reabrir a leitura.

O roteiro completo está em `scripts/testar-leituras-deploy.mjs`. A [evidência resumida](evidencias/leituras-deploy-2026-11-10.json) foi versionada sem credenciais, tokens, identificadores de contas ou caminhos privados. O relatório integral local permanece em `tmp/TESTE_LEITURAS_1794333232023/resultado.json`. Fixtures foram mantidas para auditoria e seus prazos encerrados; nenhum dado de prova existente foi alterado.

## Limites do resultado

O teste real verifica o fluxo de revisão com dados sintéticos e um arquivo de teste; não mede acurácia da leitura óptica ou da correção pedagógica da IA. A captura visual foi feita com dependências simuladas, enquanto a validação real foi por HTTP autenticado.

A atomicidade da liberação entre rotas concorrentes permanece no cartão próprio de publicação. Revisão do barema após início da correção e alteração de resultados após divulgação continuam em RN17/RN19. Este trabalho não conclui esses cartões.
