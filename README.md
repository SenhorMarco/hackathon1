# Gaider

**Correção de provas discursivas com o professor no controle.** A IA lê a prova, entende o raciocínio de cada aluno, reconhece soluções alternativas e organiza respostas parecidas. O professor revisa, decide cada nota e o aluno recebe o feedback enquanto a matéria ainda está fresca.

Projeto do 1º Hackathon LEPV & DAMA (tema: Educação).

- **Sistema no ar:** https://hackathon1-blond.vercel.app
- **Repositório:** https://github.com/SenhorMarco/hackathon1

## O problema

A ideia nasceu da rotina de um colega nosso que corrige muitas provas discursivas. Três dores apareceram:

1. **Tempo:** corrigir é manual e repetitivo; o mesmo erro aparece em dezenas de provas.
2. **Raciocínio:** quando o aluno resolve por um caminho diferente do gabarito, o professor precisa reconstruir o pensamento para saber se está certo.
3. **Feedback atrasado:** a nota chega dias depois, quando a matéria já mudou, e o aluno não usa o feedback para aprender.

## A solução

| Etapa | O que o Gaider faz | O que o professor faz |
|---|---|---|
| Antes da prova | Lê cada questão, resolve, aponta ambiguidade ou dado faltando, estima a dificuldade e sugere um barema | Ajusta e confirma o barema |
| Envio | O aluno entra na conta e envia a foto de cada resposta, questão por questão | — |
| Pré-correção | Transcreve a resposta, avalia passo a passo, identifica o tipo de erro e sugere a nota pelo barema | — |
| Solução alternativa | Reconhece métodos diferentes do gabarito e sugere um critério de barema para eles | Decide se aceita |
| Organização | Agrupa respostas parecidas por abordagem para a revisão em sequência | Valida cada resposta individualmente |
| Devolutiva | Escreve o que o aluno acertou, onde errou, uma dica e exercícios de reforço | Revisa, aprova e libera |
| Aluno | Vê a nota e o comentário de cada questão assim que o professor a valida | — |

A IA nunca dá nota final sozinha: toda sugestão passa pela validação do professor.

## Como testar

1. Abra https://hackathon1-blond.vercel.app e entre com a conta de professor de demonstração informada no envio do projeto.
2. Abra uma prova já analisada: veja a **Análise prévia** e os **Baremas**.
3. Na aba **Correção**, confira a transcrição e a avaliação passo a passo da IA, os grupos por abordagem e a sinalização de solução alternativa. Valide uma resposta.
4. Entre com a conta de aluno de demonstração: em **Minhas provas**, escolha a turma, abra a prova, veja a nota da questão validada e envie a foto de uma resposta.

Para criar seus próprios dados: crie uma conta de professor, uma turma e cadastre um aluno com o e-mail de uma conta de aluno. Envie uma prova em PDF ou imagem e clique em **Analisar prova** (leva de 1 a 4 minutos, conforme o número de questões).

## Funcionalidades

**Professor**
- Turmas, alunos (vinculados pelo e-mail) e provas.
- Análise prévia por IA: transcrição das questões, resolução de referência, existência de resposta (única, múltipla, sem solução, ambígua), problemas no enunciado e dificuldade.
- Barema sugerido ou revisado, editável.
- Recebimento das provas dos alunos (enviadas pelo aluno ou pelo professor em lote, com leitura do nome no cabeçalho).
- Pré-correção por IA, agrupamento por abordagem, validação individual com nota e feedback, associação manual de respostas pendentes.
- Devolutiva por aluno gerada pela IA, editável, e liberação conferida.
- Notas e resultados da turma com exportação em CSV.

**Aluno**
- Escolha da turma e lista de provas: para enviar, enviadas, corrigidas.
- Página da prova com envio de foto por questão (trocar e remover).
- Nota e comentário de cada questão assim que o professor valida; devolutiva completa após a liberação.

## Tecnologia

- **Next.js 16** (App Router, TypeScript) hospedado na **Vercel**.
- **Supabase**: Postgres, Storage privado (links assinados) e Auth (contas de professor e aluno).
- **IA via Featherless** (API compatível com OpenAI), modelo com visão configurável em `AI_MODEL` (padrão `moonshotai/Kimi-K2.5`). Cada etapa tem um contrato JSON em [`src/lib/ai/schemas.ts`](src/lib/ai/schemas.ts), validado com Zod; respostas fora do formato são pedidas de novo.
- A análise roda uma chamada por página, em paralelo, com raciocínio estendido desligado para caber no tempo da Vercel.

## Estrutura

- `src/app/`: páginas (professor, aluno, login) e rotas de API (`/api/exams`, `/api/aluno`).
- `src/components/`: telas do professor (`workspace`, `correction-review`), envios e portal do aluno.
- `src/lib/ai/`: cliente da IA, prompts (análise, barema, correção, agrupamento, devolutiva) e validações.
- `src/lib/aluno/`, `src/lib/db/`, `src/lib/uploads/`: regras de acesso, banco e arquivos.
- `supabase/`: `schema.sql` e `contas.sql`.
- `scripts/`: testes de integração e utilitários.
- `docs/`: regras de negócio, plano de negócios, contas, decisões e validações.
- `prompts/`: transcrições das conversas com IA usadas pela equipe.

## Executar localmente

Use Node.js 22.18+.

```bash
npm ci
cp .env.example .env.local   # preencha as variáveis
npm run dev
```

No SQL Editor do Supabase, rode `supabase/schema.sql` e depois `supabase/contas.sql`. Detalhes de autenticação em [docs/CONTAS.md](docs/CONTAS.md). Nunca faça commit do `.env.local` nem coloque a chave `service_role` em variáveis `NEXT_PUBLIC_*`.

Verificações:

```bash
npm run typecheck
npm run lint
npm run build
node scripts/testar-revisao.mjs
node scripts/testar-pendencias.mjs
node scripts/testar-contas.mjs
npx tsx scripts/testar-supabase.mts
```

## Limites do MVP

- Testado principalmente com provas de matemática digitadas e fotos nítidas; letra de mão pouco legível exige conferência do professor.
- A análise de uma prova longa pode levar alguns minutos.
- Prazo de envio por prova (RN05) ainda não tem tela; a prova recebe envios até as notas serem liberadas.
- Histórico do aluno ao longo do ano e plano de estudo adaptativo estão no roadmap.

## Documentos

- [Plano de negócios](docs/PLANO_DE_NEGOCIOS.md)
- [Regras de negócio](docs/REGRAS_DE_NEGOCIO.md)
- [Contratos da IA](CONTRATOS_IA.md) · [Escolha do modelo](docs/escolha-modelo-ia.md) · [Revisão dos prompts](docs/revisao-prompts.md)
- [Contas e permissões](docs/CONTAS.md) · [Integração do backend](docs/INTEGRACAO_BACKEND.md)
- [Validação em produção](docs/validacao-producao-2026-10-31.md)
