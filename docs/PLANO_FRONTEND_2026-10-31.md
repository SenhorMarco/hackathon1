# Fechamento do frontend do professor — 31/10/2026

## Fontes e estado do repositório

- [Kanban LEPV](https://app.notion.com/p/544cdd631211837a9be901bd60f33a8a): leitura de todos os 39 cartões, com 16 Feito, 7 Fazendo e 16 A fazer. Esses números descrevem o quadro consultado; não medem cobertura do código.
- [Regras RN01–RN20](https://github.com/SenhorMarco/hackathon1/blob/main/docs/REGRAS_DE_NEGOCIO.md): branch `docs/regras-de-negocio` mesclada e publicada na `main` no commit `93b6245`, por autorização do usuário.
- Base da implementação: `b010cd7`, atualizada do GitHub por fast-forward. Os documentos locais idênticos aos da branch foram preservados em `tmp/regras-antes-merge` antes da mesclagem.
- O checkpoint atual está na branch `feat/revisao-individual-mvp`. O agente principal fará o commit e, depois da validação, o push/merge. Este documento não afirma que já foi publicado ou implantado. A área do aluno e o envio/prazos continuam com o colega; nenhum arquivo dessa área foi alterado neste trabalho.

## Decisão de prioridade

1. **Revisão individual e liberação do professor.** O cartão [Integrar a tela de grupos](https://app.notion.com/p/e79cdd631211834e883a81ff5a2dc202) está Fazendo. Sua descrição antiga falava em aprovar grupos, mas a atualização do próprio cartão e RN15–RN16 exigem revisão individual. Esta entrega implementa esse fluxo.
2. **Dados reais nos resultados.** “Notas e resultados” usava `Exam.responses`, vazio nas provas carregadas do servidor. O [relatório simples](https://app.notion.com/p/085cdd631211833f8bed815ffd6903cd), embora P1 no quadro, precisa de dados confiáveis antes de novos gráficos. A tabela e o CSV agora usam o endpoint real de revisão e somente notas validadas.
3. **Envio pelo aluno, prazo e substituição.** O cartão [Acesso do aluno e envio da própria prova](https://app.notion.com/p/40acdd631211817fb89ecb1fc5412d0e) já está Fazendo. Login e consulta de devolutivas existem; envio e substituição ainda não estavam na main consultada. O colega deve coordenar permissões e identidade no servidor com RN04–RN07. Nenhum arquivo da área do aluno foi alterado nesta entrega.
4. **Pendências e versionamento.** Preservar transcrições não associadas, permitir associação manual segura e vincular a devolutiva aos dados revisados. Permanecem mudanças de barema e atualização pós-publicação.
5. **Polimento e entrega.** Teste integrado no deploy com contas e arquivos de teste, após integrar o trabalho dos colegas. Vídeo e README vêm depois do fluxo demonstrável.

## Implementado e validado localmente

### Revisão — RN03, RN09, RN14–RN16

- Respostas aparecem mesmo sem agrupamento. É possível trocar de questão mesmo quando a primeira não tem respostas.
- Filtros por abordagem e por pendências, contagem de validações, transcrição, passos sugeridos, referência, barema e links dos arquivos originais.
- Nota e feedback individuais; aceitar a sugestão não exige editar artificialmente o campo. Campo vazio não vira zero, decimal com vírgula é aceito, teto é conferido no cliente e no servidor.
- Leitura incerta começa sem nota preenchida e exige declaração explícita de conferência do arquivo antes da validação. A sinalização da IA é preservada.
- Agrupamento é opcional e preserva notas individuais existentes. Aprovação automática de grupo foi retirada da interface e o endpoint legado retorna 409, orientando revisão individual. Aprovação em lote não foi implementada.
- Respostas e arquivos continuam acessíveis após publicação, em modo de consulta.

### Completude, devolutiva e liberação — RN18

- A interface, a geração de devolutiva e a liberação conferem cada questão esperada por submissão: resposta única, aluno confirmado, pré-correção concluída, nota dentro do limite e comentário revisado não vazio.
- Ausência, duplicação ou questão fora do barema bloqueiam liberação. A nota total só aparece quando a prova está completa e validada.
- Devolutiva gerada exige revisão/aprovação humana do texto por aluno. O snapshot SHA-256 abrange barema, análise, aluno, arquivos e respostas (transcrição, nota e comentário); é conferido novamente depois da chamada de IA. Mudança durante a geração resulta em `409` e o texto não é salvo.
- GET/PUT permitem reler e editar o texto com versão otimista do conteúdo. A aprovação grava a revisão do snapshot. A liberação confere que a devolutiva está completa, foi aprovada e ainda corresponde aos dados atuais.
- Reassociar ou registrar uma resposta invalida a devolutiva existente. É necessário gerar, revisar e aprovar o novo texto antes de liberar.
- A liberação permanece explícita e por prova/turma, preservando o contrato existente. Alunos cadastrados que não enviaram não são incluídos; todas as submissões recebidas, inclusive sem aluno confirmado, são verificadas.
- Não se libera enquanto há rascunhos individuais não salvos na tela. Erros permitem tentar novamente sem substituir as notas por zeros.
- A checagem do snapshot e as mutações são operações entre rotas, não uma transação única do banco. Ainda existe uma janela de concorrência entre operações simultâneas; transação no banco é trabalho futuro. Não afirmar que a corrida está eliminada.

### Pendências de identificação — transcrição, associação e completude

- `correctionRows` preserva todas as transcrições da IA, inclusive número zero, questão fora do barema e números repetidos. Associações válidas e únicas mantêm seu número; linhas incertas recebem chaves técnicas negativas únicas, sem virar questões visíveis ou receber nota final.
- A interface lista respostas não associadas com transcrição e acesso ao arquivo. O professor escolhe uma questão livre. O endpoint de associação manual só aceita respostas pendentes, rejeita questão ocupada e não substitui outra linha; limpa nota e comentário e marca a leitura como incerta para exigir nova revisão.
- Quando não há transcrição aproveitável, o endpoint de cadastro manual permite ao professor registrar texto após conferir o arquivo e escolher a questão. Cria a resposta sem nota, não sobrescreve uma resposta existente e bloqueia cadastro enquanto houver associação não resolvida nessa submissão.
- Não há migração adicional de banco para essas capacidades. A rota de registro manual confirma se todas as questões esperadas agora existem e só então marca a submissão como pré-corrigida.

### Resultados — RN20

- Aba de resultados e página de relatórios consultam `/api/exams/:id/review`, com seleção da prova.
- Tabela, soma e CSV utilizam notas validadas; pendências aparecem como “Pendente”.
- Média somente das provas completas, com denominador e indicação de cobertura parcial. Resultado validado e resultado liberado têm rótulos distintos.
- CSV escapa aspas e neutraliza valores textuais que poderiam ser interpretados como fórmulas.

## Pendências que impedem declarar o MVP inteiro concluído

- [Associação manual e leitura](https://app.notion.com/p/40acdd631211817c9694f10d4bc0861a): preservação de transcrições sem número/fora do barema/duplicadas, associação manual com nova revisão e cadastro manual de transcrição após conferência estão implementados. A prova continua bloqueada até todas as questões terem resposta única e validada.
- [Alterações de barema](https://app.notion.com/p/40acdd63121181cbbf15da06f45b0259): faltam versões e sinalização persistida de sugestões desatualizadas, preservando a decisão sobre notas já validadas.
- [Atualização após divulgação](https://app.notion.com/p/40acdd63121181d6a5aaeb01f7b91fb5): servidor ainda bloqueia edição após liberação. Falta implementar revisão/versionamento e indicação de atualização ao aluno (RN19).
- [Barema fornecido](https://app.notion.com/p/40acdd63121181b89b66d94b2b5f84e0): integrar arquivo do professor à análise, além do editor de critérios existente.
- [Bloqueio de liberação](https://app.notion.com/p/40acdd6312118146be3cebed84a9363f): completude, aprovação textual e snapshot de origem (barema, análise, arquivos e notas/comentários) são verificados. Continua faltando transação real que feche a janela de concorrência entre rotas; não afirmar que revisões simultâneas são atomicamente serializadas.
- RN17 continua pendente: alterações de barema não disparam invalidação/aviso completo das sugestões e correções potencialmente afetadas.
- RN19 continua pendente: edição de uma nota após publicação e indicação de atualização na devolutiva do aluno ainda não estão implementadas; atualmente as respostas publicadas são somente leitura.
- Envio próprio do aluno e controle de prazo continuam em trabalho do colega, sem alteração nesta entrega.
- A aprovação de novos critérios para caminhos alternativos continua dependendo da política de revisão do barema. A tela sinaliza a alternativa e mostra o critério sugerido, sem prometer aprovação automática.
- Gráficos longitudinais e comparação de dificuldade prevista × observada ficam após esses P0. Não usar estatísticas vazias ou sugestões fixas como evidência pedagógica real.

## Verificação

Executar na raiz:

```sh
npm run typecheck
npm run lint
node scripts/testar-revisao.mjs
node --experimental-vm-modules scripts/testar-revisao-api.mjs
node scripts/testar-pendencias.mjs
node scripts/testar-workspace.mjs
npm run build
```

O teste de navegador está em `scripts/testar-revisao-browser.mjs`; requer Playwright, Chromium/Chrome e esbuild. Aceita `PLAYWRIGHT_MODULE`, `ESBUILD_MODULE` (nomes de módulos ou URLs `file://`) e `BROWSER_CHANNEL=chrome`. Usa o componente real com API simulada, sem dados de produção. Cobre desktop e celular, navegação com questão vazia, validação individual, leitura incerta, filtros, CSV, liberação, consulta após publicação e falha/repetição de carregamento. Capturas locais ficam em `tmp/review-qa/`.

O teste `testar-pendencias.mjs` verifica que transcrições identificadas continuam intactas e que número zero, fora do barema e duplicatas recebem chaves negativas únicas sem nota final. O teste de handlers usa banco em memória e não substitui a validação integrada no Supabase nem os testes de autorização em `scripts/testar-contas.mjs`. O build local também não comprova deploy.

Neste Windows, a primeira tentativa de Turbopack falhou ao iniciar worker de CSS dentro do sandbox. Após permitir processos locais e remover somente `.next/cache/turbopack`, o build padrão passou; não foi alterado o compilador nem a configuração de produção.
