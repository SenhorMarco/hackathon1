# Análise prévia de prova

O prompt está em `src/lib/ai/analise-prova.ts`. A função `analisarProva` recebe cliente, modelo, texto e, opcionalmente, imagens PNG, JPEG ou WebP. Ela usa `gerarJson` para enviar o contrato `AnaliseProva` e validar a resposta com Zod. A função não cria uma rota nem salva resultados no banco.

Para experimentar com a Featherless, instale as dependências, configure `FEATHERLESS_API_KEY` em `.env.local` (ou no ambiente) e execute:

```sh
npx tsx scripts/testar-analise-prova.mts
npx tsx scripts/testar-analise-prova.mts caminho/para/prova.txt
npx tsx scripts/testar-analise-prova.mts caminho/para/pagina.png
```

O primeiro comando usa quatro questões sintéticas: solução única, múltiplas soluções, equação sem solução e dados insuficientes para determinar o perímetro. Na última, confira se a IA sinaliza a falta de dados, sem inventar dimensões. Os exemplos não são a prova de teste da equipe. Para testar uma prova digitalizada de várias páginas, a integração pode passar múltiplas imagens à função; o script recebe apenas um arquivo de cada vez. Para PDF é necessário converter páginas em imagens antes do envio.

Analise manualmente a transcrição, resolução, classificação de resposta, problemas apontados e dificuldade, inclusive em casos ilegíveis e ambíguos. Zod confirma a estrutura, não a correção matemática nem a qualidade da leitura. O contrato existente não possui status próprio para dados insuficientes; o prompt usa `ambigua` nesses casos e pede uma explicação. Isso deve ser considerado ao exibir o resultado. A análise é sugestão sujeita à revisão do professor.
