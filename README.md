# Aula Clara — Corretor IA

Aplicação Next.js com a interface do professor, contratos de IA e estrutura de banco no mesmo projeto.

## Executar

Na raiz do repositório, com Node.js 20.9 ou superior:

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. A interface usa dados de demonstração e localStorage; as chamadas de IA e banco ainda precisam ser integradas à interface. Para utilizar os módulos de servidor, configure as variáveis de `.env.example` em `.env.local`.

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
