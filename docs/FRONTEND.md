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
