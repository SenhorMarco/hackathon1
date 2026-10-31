# Modelo de IA selecionado

Por solicitação do usuário, o padrão passa a ser `moonshotai/Kimi-K2.5`; `AI_MODEL` continua permitindo substituí-lo em `.env`, `.env.local` ou nas variáveis de ambiente do deployment.

A escolha prioriza a evidência existente para os prompts deste projeto: Kimi passou nas verificações dos nove casos textuais sintéticos registrados em `docs/avaliacao-prompts-moonshotai-Kimi-K2.5.json`. Foram nove chamadas, sem repetição estrutural, com custo informado total de US$ 0,064580488. Isso não mede acurácia nem comprova leitura de digitalizações. O relatório anterior e suas limitações foram preservados.

O [catálogo oficial da Featherless](https://featherless.ai/models/moonshotai/Kimi-K2.5), consultado em 31/10/2026, identifica o modelo como multimodal com visão e contexto de 256k. A [documentação de visão](https://featherless.ai/docs/vision) confirma o uso de imagens no endpoint compatível com o cliente existente. O modelo anterior Qwen/Qwen3.8-27B também tem visão no catálogo; a troca foi orientada pelos testes específicos registrados, sem afirmar superioridade universal.

A consulta autenticada de plano confirmou acesso à API e ausência de limites próprios de contexto e tamanho do modelo. Entretanto, `/v1/models` e os endpoints de detalhe retornaram `404` com corpo `Gone.`. Portanto, a disponibilidade efetiva deste modelo para a chave local não foi confirmada por catálogo autenticado ou por nova inferência. Nenhuma inferência paga foi executada para esta seleção.

A configuração local de `AI_MODEL` foi atualizada sem versionar o `.env`. O novo padrão do código vale após o deployment quando não existe `AI_MODEL` explícito na Vercel. Uma variável explícita de Production continua prevalecendo; sem acesso administrativo à Vercel não foi possível inspecioná-la ou alterá-la.
