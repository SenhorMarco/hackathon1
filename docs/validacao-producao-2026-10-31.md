# Validação da produção e do upload em lote

Validação de 31/10/2026 em https://hackathon1-blond.vercel.app, com Supabase e IA reais e somente dados sintéticos. Nenhum registro existente foi apagado e nenhum SQL foi executado.

Cartão: [Upload em lote das provas dos alunos](https://app.notion.com/p/8e3cdd631211831fa3920107f81dfaa9), no workspace **Espaço de Luiz José**, responsável Ferreira, P0, Ordem 11. Foi priorizado por estar em Testando. Os demais cartões não foram iniciados.

## Repositório e deployment

- `main` limpa e sincronizada com `origin/main` no início da verificação: `1ddd4810679de1ef0170abdd594fb311ff4d2d47`.
- O GitHub informa sucesso do deployment Vercel desse commit: https://vercel.com/lqabt/hackathon1/6idCwwhD69qq68DHdgQkGEDnUXw7.
- A API administrativa da Vercel retorna `403 forbidden`, inclusive com o escopo de equipe da sessão existente. Não foi possível confirmar diretamente o vínculo entre o domínio e o SHA, nem consultar os ambientes das variáveis.
- O corpo de `/api/health` em produção passou de configuração incompleta para:

```json
{
  "status": "ok",
  "configuracao": { "banco": true, "ia": true },
  "banco": true,
  "arquivos": true,
  "observacao": "A chave de IA só é validada por uma análise real."
}
```

As operações reais comprovaram o uso de banco, Storage privado e IA pelo deployment atendendo o domínio. Isso não substitui a inspeção administrativa da configuração das variáveis em Production. Nenhum valor de chave foi incluído neste relatório.

## Quatro fluxos da entrega anterior

Identificados no pedido anterior e em `scripts/testar-fluxo-browser.mjs`: criar prova, ver análise, editar barema e enviar provas dos alunos.

| Fluxo | Resultado | Evidência |
| --- | --- | --- |
| Criar prova | Funcionando | Upload direto de 5.267.026 bytes, criação HTTP 201, leitura individual e listagem HTTP 200; download assinado HTTP 200 com SHA-256 idêntico ao original. |
| Ver análise | Funcionando | Análise real HTTP 200 às 09h23 de Brasília; uma questão extraída, resposta reconhecida como 5. Análise persistida relida na API e exibida no Chromium nesta verificação. |
| Editar barema | Funcionando | PUT HTTP 200; critério `AUDITORIA FERREIRA: critério sintético revisado e persistido` relido no banco pela API e na tela. Status persistido `barema_pronto`. |
| Enviar provas dos alunos | Funcionando | PDF e duas imagens agrupadas persistidos; leitura real do cabeçalho de PDF, confirmação manual e releitura. Nesta verificação, envio adicional de dois PDFs pela interface e confirmação dos casos abaixo. |

As duas chamadas de IA autorizadas no histórico já haviam sido executadas: análise às 12:22:58–12:23:16 UTC e cabeçalho às 12:23:17–12:23:25 UTC. Foram reutilizadas suas evidências e relidos os resultados; não foram repetidas. As duas leituras adicionais de cabeçalho foram autorizadas expressamente nesta conversa e iniciadas às 12:30:42 e 12:30:50 UTC. A aplicação pode tentar corrigir JSON inválido internamente; esses números contam invocações de endpoints, sem alegar medição das requisições faturadas pelo provedor.

## Critérios do cartão

- Dois PDFs legíveis no conjunto validado: o primeiro teve sugestão `ALUNO SINTETICO FERREIRA`; o segundo, `ALUNO SINTETICO FERREIRA DOIS`.
- Dois PDFs adicionais foram selecionados juntos em **Adicionar PDFs em lote**, produzindo dois envios independentes; um deles foi o caso sem nome.
- Antes da confirmação, os novos registros tinham `aluno_id: null`: a IA não escolheu o aluno automaticamente.
- Cada aluno foi selecionado e confirmado pela interface. As associações e sugestões foram relidas pela API e após recarga da página no Chromium.
- O PDF sem nome retornou `nome_lido: null`, sem erro de leitura. A tela exibiu **Não identificado**; o arquivo foi preservado e a confirmação manual funcionou.
- Os dois novos PDFs foram abertos pelos links da interface e baixados com HTTP 200. Seus hashes coincidiram com os bytes enviados.
- Nenhum erro de página foi observado. Uma ambiguidade entre o nome em `strong` e em `option` interrompeu o teste de leitura; o seletor do teste foi corrigido e a leitura foi retomada sem novas chamadas de IA ou uploads.

## Identificadores para conferir os dados

Prefixo: `AUDITORIA_FERREIRA_20261031_1793448067702`.

| Recurso | ID |
| --- | --- |
| Turma | `a06082c4-dd68-4e92-83ee-eee361cbef60` |
| Prova | `d9e6c859-fcd0-436f-9ad2-9a3f8a03c9f4` |
| PDF com primeiro nome | `25719b40-a016-490b-8e45-85e4d954ab10` |
| Duas imagens agrupadas | `84456e74-126f-4c11-95fd-c2461097cbab` |
| PDF com segundo nome | `16d4bf88-015d-4fae-93b2-f81cb58a2bb1` |
| PDF sem nome | `15afe8e5-3ab0-43f9-875c-7db48fc806b3` |

SHA-256 do segundo PDF: `22ade4951d26491ead2539ef4afadc8ec2e138e5481c679c97e3699c3c59bdcd`.

SHA-256 do PDF sem nome: `2c262a7c099f8c63333c0454d7dcc190c1d2aebbeeefabe3c9245075cab65a64`.

## Banco: alcance da inspeção

As sete tabelas foram acessíveis pelas operações reais e pela rota de revisão: `turmas`, `alunos`, `provas`, `submissoes`, `respostas`, `grupos` e `feedbacks`. Os campos utilizados pelos quatro fluxos, a referência estável de alunos, o barema JSON, os metadados dos arquivos e as associações foram exercitados. O health confirmou seu subconjunto de colunas e a existência do bucket privado `provas`; o download assinado funcionou e o acesso pelo caminho público foi rejeitado.

**Pendente por falta de acesso administrativo ao Supabase:** inspeção completa do catálogo, tipos, constraints, índices, RLS e políticas de todas as tabelas em comparação com `supabase/schema.sql`. O código usa service role, que ignora RLS; operações bem-sucedidas não comprovam as políticas. O `.env` local não contém as credenciais do banco. Não foi feita uma migração para contornar essa limitação.

## Verificações locais

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run build`: passou com Turbopack. A primeira tentativa no sandbox falhou ao abrir uma porta para processar CSS (`Operation not permitted`). A tentativa seguinte reutilizou o erro. Após mover a pasta `.next` para um backup em `/tmp`, o mesmo comando fora do sandbox compilou normalmente. Não houve troca de bundler ou alteração da configuração.
- `node scripts/testar-workspace.mjs`: seis testes passaram.
- `node scripts/testar-upload.mjs`: passou, incluindo leitura de cabeçalho PDF/imagem, retentativas, validação de turma, controle de versão e compensação após falha. Essa suíte usa serviços simulados; a evidência de produção está registrada separadamente acima.

Não foi encontrada falha de implementação nos critérios do cartão. Esta entrega registra a validação da implementação existente, principalmente dos commits `28c6863` e `aecf1e9`, sem reimplementá-la.

## Como testar

1. Para reler sem consumir IA, consulte `/api/exams/d9e6c859-fcd0-436f-9ad2-9a3f8a03c9f4` e `/api/exams/d9e6c859-fcd0-436f-9ad2-9a3f8a03c9f4/submissions`. Compare o critério e as sugestões/associações descritas acima. Os links `/submissions/ID/file?index=0`, sob a mesma prova, abrem os arquivos privados.
2. Para repetir o fluxo pela interface, crie uma turma e alunos fictícios, salve uma prova e abra **Respostas**. A turma da auditoria é vinculada ao localStorage do navegador de teste, portanto não aparece automaticamente em outro navegador.
3. Selecione dois PDFs em **Adicionar PDFs em lote**, clique em **Enviar 2 provas**, confira as sugestões e confirme os alunos manualmente. Recarregue, reabra a prova e confira os arquivos e associações.
4. Repita com um PDF sem nome. Confira **Não identificado**, confirme manualmente e abra o arquivo preservado.

Novos envios pela interface acionam a leitura de cabeçalho automaticamente e podem consumir créditos. A autorização desta execução foi limitada aos dois testes adicionais já realizados.
