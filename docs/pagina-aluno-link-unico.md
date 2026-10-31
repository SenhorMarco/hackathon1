# Página do aluno por link único

Cartão: [Página do aluno por link único](https://app.notion.com/p/b7ecdd6312118291aa7081062fbf4601), responsável Ferreira, P0, Ordem 21. Status alterado para Fazendo antes do trabalho e Testando durante a validação.

## Comportamento

O professor gera as devolutivas, aprova as notas e usa **Liberar correções** na aba **Correção**. A tela fornece um link `/aluno/TOKEN` para cada aluno. O aluno abre o link em outro navegador, sem login. Quem possui esse link consegue ler a devolutiva; ele deve ser compartilhado somente com o destinatário.

A implementação existente foi mantida, incluindo a geração do token no banco, sua preservação ao refazer a devolutiva e os links exibidos ao professor. O carregamento da página foi corrigido para:

- Consultar somente a devolutiva publicada correspondente ao token e aguardar a requisição atual, sem congelar o estado de publicação na página estática.
- Conferir a submissão, o aluno e a prova relacionada antes de renderizar; a prova deve estar liberada (`corrigida`).
- Tratar erros do banco explicitamente. Uma falha operacional mostra uma mensagem genérica com **Tentar novamente**, sem detalhes do provedor.
- Validar o formato da devolutiva e do barema e conferir a presença das notas finais. Uma nota pendente não é transformada em zero.
- Mostrar **Devolutiva indisponível** para tokens inválidos, inexistentes, não publicados ou com vínculos ausentes, sem informar se há dados daquele aluno.
- Desabilitar indexação e envio do endereço como referência de navegação, e acomodar nomes longos no celular.

Foi corrigida também a regra CSS do Turbopack: o loader global transformava `aluno.module.css` em CSS comum, retirando o mapa de classes usado pela página. A condição exclui `*.module.css` dessa regra, permitindo o processamento nativo de CSS Modules pelo Next.js. O bundler padrão continua sendo Turbopack.

O layout de devolutiva, as notas finais, os comentários explícitos do professor e os exercícios existentes foram preservados. A tarefa não inclui mudanças nos prompts, na geração de feedback com IA, na tela de grupos ou no esquema do banco.

## Validação local

```bash
npm run lint
npm run typecheck
npm run build
PLAYWRIGHT_MODULE=/caminho/absoluto/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/caminho/dos/browsers \
node scripts/testar-pagina-aluno.mjs
```

A suíte inicia o Next.js compilado e um serviço HTTP que simula o Supabase; nenhuma chamada de IA é realizada. Exercita:

1. Tokens malformados, inexistentes e não publicados sem dados pessoais.
2. Liberação pela rota real da aplicação, mantendo o mesmo token.
3. Nome, nota final de 1,5/2, comentário explícito do professor e exercício expansível, sem cookies de login.
4. Dois alunos em contextos independentes de navegador, sem misturar os conteúdos.
5. Retirada de publicação após uma visita bem-sucedida, sem continuar exibindo a correção.
6. Submissão inexistente e aluno não associado.
7. Erro de banco com mensagem genérica e recuperação pelo botão.
8. JSON incompleto e nota pendente, sem apresentar uma nota zero inventada.
9. Largura de celular e nome longo sem transbordamento horizontal.

Como a página usa streaming com Suspense, um estado indisponível pode chegar com HTTP 200 depois que a estrutura inicial foi enviada. O teste confere a interface efetivamente renderizada e a ausência dos dados, sem usar somente o status HTTP como evidência.

## Validação com Supabase real

Validação concluída em 31/10/2026, das 10h02m21s às 10h02m34s de Brasília, no domínio https://hackathon1-blond.vercel.app, com Supabase real. As credenciais foram fornecidas no `.env`, sem exposição ou inclusão no Git. Antes de gravar, a autenticação foi confirmada e o registro sintético da auditoria anterior foi comparado ao domínio para conferir que ambos usavam o mesmo banco.

O roteiro abaixo foi executado com sucesso. Não exige IA nem consome créditos de IA. Cria duas provas, dois alunos e devolutivas manuais sintéticas para testar exclusivamente leitura/publicação. Esses registros **permanecem no banco**, identificados pelo prefixo `VALIDACAO_LINK_ALUNO_`; nenhum registro existente é removido. O teste aceita `.env` ou `.env.local` (este tem preferência quando existe).

```bash
PLAYWRIGHT_MODULE=/caminho/absoluto/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/caminho/dos/browsers \
node scripts/testar-pagina-aluno-real.mjs https://seu-deploy --criar-dados-sinteticos
```

O Supabase configurado deve ser o mesmo usado pelo domínio informado. O relatório com os identificadores e links sintéticos fica em `/tmp/hackathon-student-page-real.json` (ou no caminho definido por `REPORT_PATH`). O teste verifica persistência da publicação, token estável, dois navegadores independentes sem login, notas e comentários finais, recarga e retirada de publicação.

### Evidências da execução real

Prefixo dos registros: `VALIDACAO_LINK_ALUNO_1793451741528`. Resultado: **passou**, com zero chamadas de IA. Código de referência na main: `8164087`, com deployment confirmado como bem-sucedido no GitHub (correções da página em `a2c992d`).

| Verificação | Resultado observado |
| --- | --- |
| Token inválido, inexistente ou não publicado | Interface indisponível sem dados do aluno |
| Liberação pelo endpoint de produção | HTTP 200; `publicado: true` e mesmo token confirmados por leitura direta do banco |
| Dois links em contextos independentes sem login | Cada link mostrou o aluno e o comentário correto; não exibiu o nome do outro aluno; nenhum cookie de login |
| Notas finais | Aluno A: 1,5/2; aluno B: 2/2, em lugar da nota sugerida sintética zero |
| Recarga | Títulos, notas e comentários persistiram |
| Retirada de publicação após acesso | O link antes acessível passou a mostrar indisponibilidade; somente o registro sintético foi alterado |
| Republicação | Mesmo link voltou a abrir pela rota de liberação; os dados sintéticos foram mantidos para conferência |
| Tela móvel | Largura de 390 px sem transbordamento horizontal |
| Estilos e exercício | CSS Module aplicado e resposta do exercício aberta; captura móvel de produção inspecionada |

| Recurso | Identificador |
| --- | --- |
| Turma sintética | `29df78d4-cf0a-4ff1-80d3-1df39df7d37b` |
| Prova A | `f3a59c28-5ebd-4bfc-ab61-68b6a1b45290` |
| Submissão A | `ed18a9f7-0ada-4549-8778-10f5d58ab36b` |
| Prova B | `9153b540-1151-4810-97be-7b1c0fe75bb3` |
| Submissão B | `c0a01dac-1525-4483-b7b0-a6e6ca257bec` |

Essa execução comprova leitura, publicação e persistência com serviços reais. Os textos de feedback foram escritos manualmente como fixtures: o teste não avalia qualidade de IA nem refaz o fluxo de geração dos textos.

Para testar manualmente, use os links sintéticos do relatório local ou libere outra devolutiva sintética pela interface e abra o link em janela anônima. Confira notas e comentários, recarregue e compare com o link de outro aluno fictício. O cartão está apto a Feito: a pendência de acesso ao banco e validação positiva em produção foi resolvida.
