# Interface do professor — Aula Clara

A interface faz parte da aplicação Next.js da raiz. Instale as dependências e execute todos os comandos na raiz do repositório:

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. Para validar, use `npm run typecheck` e `npm run build`. Para produção com Node.js, execute `npm start` após o build.

## Arquivos e rotas

- `src/app/`: layout, estilos e páginas.
- `src/components/workspace.tsx`: interface, cadastro, upload local, revisão, relatórios e estado.
- `src/lib/data.ts`: tipos TypeScript, mocks e funções de pontuação.
- `docs/INTEGRACAO_BACKEND.md`: pontos de integração e proposta de endpoints.

Rotas: `/`, `/professor/dashboard`, `/professor/provas`, `/professor/alunos` e `/professor/relatorios`. A seleção de turma e prova acontece no cliente.

## Comportamento atual

- Cadastro de turmas e alunos, provas, critérios editáveis, associação de arquivos, revisão de notas e feedback, aprovação, exportação CSV, histórico e sugestões de estudo funcionam no navegador.
- Os registros persistem em `localStorage`, sob a chave `aula-clara-v3`, sem sincronização entre usuários.
- Os arquivos enviados ficam na sessão em URLs de objetos. Após recarregar, os nomes permanecem, mas é necessário reenviar os arquivos para visualizá-los.
- A análise usa quatro questões de Física de exemplo; não interpreta PDF, DOCX ou o barema anexado.
- OCR, IA, autenticação, banco, armazenamento e entrega aos alunos ainda precisam ser conectados à interface. Os módulos de servidor existentes estão em `src/lib/ai/` e `src/lib/db/`.
- O professor consulta o histórico individual em uma janela de detalhes; não há área de aluno.

## Hospedagem estática opcional

A configuração padrão usa o servidor Next.js para permitir a integração com os módulos de backend. Para uma demonstração exclusivamente estática, configure `output: 'export'` e `images: { unoptimized: true }` em `next.config.ts` e execute `npm run build`. Essa modalidade exige que as rotas sejam compatíveis com exportação estática e não permite Route Handlers dinâmicos.

A pasta `out/` será gerada pelo build; ela não acompanha o código-fonte. Use `npm run start:static` para conferir a exportação localmente. O script lê `out/` na raiz e aceita a variável `PORT`.

Envie todo o conteúdo de `out/`, incluindo `_next/`, à hospedagem. Para Apache, copie `docs/apache.htaccess` para `out/.htaccess`. Para Nginx, adapte `docs/nginx.conf` ao domínio e ao diretório público. As regras devem resolver URLs sem extensão para os arquivos `.html` correspondentes.

## Validação de lint, persistência e build

Execute na raiz:

```bash
npm run lint
npm run typecheck
node scripts/testar-workspace.mjs
npm run build
node scripts/testar-upload.mjs
```

A persistência da interface usa `src/lib/workspace-store.ts` com `useSyncExternalStore`: o snapshot do servidor mantém a hidratação consistente e os dados do navegador são recuperados sem `setState` síncrono em efeitos. Alterações são gravadas na própria operação que atualiza a fonte de estado. Se a gravação falhar, os dados permanecem em memória e um aviso tem prioridade sobre a mensagem de sucesso. O link da marca usa `next/link` para voltar ao início sem recarregar o documento.

O teste de persistência cobre restauração de dados existentes, snapshots estáveis, atualizações consecutivas, JSON inválido, armazenamento bloqueado/quota esgotada e remoção de assinaturas. Para conferir as telas manualmente, crie uma turma, recarregue a página, volte ao início pela marca e confira se a turma continua disponível. Teste também as rotas de provas, alunos, relatórios e o fechamento de modais por Escape.

### Diagnóstico do Turbopack

O script de build continua `next build`, com Turbopack. O erro reproduzido no ambiente restrito foi `binding to a port — Operation not permitted (os error 1)` durante o processamento de CSS por workers Node. Um teste de abertura de porta local também retornou `EPERM` nesse ambiente, enquanto funcionou com a permissão necessária. Não foi identificado erro de código/configuração que exigisse trocar o compilador.

Uma nova tentativa com permissão ainda reproduziu a falha armazenada no cache. Após remover **somente** `.next/cache/turbopack` (artefatos gerados de build) e executar novamente com permissão de porta local, o build padrão passou, inclusive antes das correções de lint. `.next/dev/cache` e o código foram preservados. Em caso dessa falha específica, confira primeiro as restrições do executor e, após corrigi-las, descarte apenas o cache de build afetado. Limpar o cache sem liberar a porta não resolve a restrição. Não é necessário desativar cache nem mudar o script para Webpack.

A documentação local consultada está em `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`, `05-config/01-next-config-js/turbopackFileSystemCache.md` e `02-components/link.md` dentro da mesma árvore de referência. Ela descreve o processamento PostCSS em workers, os caches separados de build/desenvolvimento e a navegação com Link.

### Vercel

O responsável confirmou que a hospedagem é Vercel com o preset Next.js e sem personalização de comandos. O comando de build deste repositório é `npm run build` → `next build`; não foi adicionado override de build. `npm start` → `next start` permanece disponível para execução local/servidor Node. Os exemplos Apache/Nginx e `start:static` são alternativas de exportação estática, não a configuração da Vercel; as APIs atuais requerem execução de servidor.

O build local não comprova o resultado de um deploy remoto. Após o push, confira o deployment do commit na Vercel e o log do build; as configurações do painel e o resultado do deployment não estão versionados neste repositório.
