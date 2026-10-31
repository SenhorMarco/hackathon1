# Aula Clara — Corretor IA

Aplicação Next.js com a interface do professor, contratos de IA e estrutura de banco no mesmo projeto.

## Executar

Na raiz do repositório, com Node.js 20.9 ou superior:

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. A interface combina dados de demonstração e localStorage com upload real de provas no Supabase. A análise por IA e os demais fluxos ainda são demonstrativos. Para utilizar os módulos de servidor, configure as variáveis de `.env.example` em `.env.local`.

```bash
npm run typecheck
npm run lint
npm run build
npm start
```

## Estrutura

- `src/app/`: layout, estilos, página inicial e rotas do professor.
- `src/components/workspace.tsx`: interface e estado da área do professor.
- `src/lib/data.ts`: tipos, dados de demonstração e cálculos da interface.
- `src/lib/ai/` e `src/lib/db/`: módulos de IA e banco.
- `supabase/`: esquema SQL.
- `scripts/`: verificações de integração e utilitário de hospedagem estática.
- `docs/`: documentação da interface e exemplos de hospedagem.

Veja [a documentação da interface](docs/FRONTEND.md), [os pontos de integração](docs/INTEGRACAO_BACKEND.md) e [os contratos de IA](CONTRATOS_IA.md).

## Upload de provas

1. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` em `.env.local`.
2. Execute `supabase/schema.sql` no SQL Editor do Supabase. O script inclui as colunas `arquivo_nome` e `data_avaliacao`, inclusive para bancos existentes, e o bucket privado `provas`.
3. Em “Nova prova”, informe título e data e selecione um PDF, PNG ou JPEG de até 20 MB. Clique em “Salvar prova”.
4. Confira o rascunho e clique no nome do arquivo para abri-lo. Recarregue a página e repita a consulta.

O envio salva a turma com um UUID estável, o arquivo no Storage e o registro em `provas`. Provas novas começam sem questões: não há extração ou análise de IA nesta etapa. Se o registro falhar, a API tenta remover o arquivo enviado. Não há transação distribuída entre Storage e Postgres; uma falha também na remoção é registrada no servidor.

O vínculo entre a turma da demonstração e seu UUID no banco fica no localStorage. As provas dessa turma são consultadas na API ao abrir a interface; limpar o localStorage perde esse vínculo local, mas não apaga os registros no Supabase. Alunos, baremas e correções permanecem no fluxo demonstrativo.

A API segue o modelo de demonstração definido no esquema: sem login, um único professor, acesso ao Supabase somente pelo servidor. O bucket privado é acessado por links assinados de 60 segundos. Autenticação e isolamento entre professores não fazem parte desta etapa.

```bash
# Após npm run build (ou npm run build -- --webpack).
# Teste com Node.js 22.18+; Supabase simulado, sem dados reais.
node scripts/testar-upload.mjs
```
