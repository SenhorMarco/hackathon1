# Plano de negócios — Gaider

Documento curto para a banca. O foco do hackathon é a qualidade do raciocínio sobre o problema e a solução; os números abaixo são hipóteses a validar, não resultados medidos.

## Problema

Professores de exatas gastam horas corrigindo provas discursivas. A correção é repetitiva (o mesmo erro aparece em muitas provas), exige reconstruir raciocínios diferentes do gabarito e devolve o feedback tarde demais para o aluno aprender com ele. O problema foi trazido por um colega da equipe que corrige muitas provas por semana.

## Proposta de valor

- **Professor:** menos trabalho repetitivo, sem perder o controle da nota. A IA transcreve, avalia passo a passo, reconhece soluções alternativas e organiza respostas parecidas; o professor decide.
- **Aluno:** nota e comentário por questão assim que corrigida, e uma devolutiva com dica e exercícios sobre o ponto exato do erro.
- **Escola:** dados por questão e por turma para planejar aulas de revisão.

## Público

1. **Inicial:** professores de matemática, física e química do ensino médio e de cursinhos, que aplicam provas discursivas.
2. **Depois:** escolas e redes de ensino, e professores universitários de disciplinas de exatas.

## Diferenciais

- Avalia o **raciocínio**, não só a resposta final, e reconhece **métodos alternativos válidos**.
- **Professor no controle:** nenhuma nota é final sem validação humana; regras de completude impedem liberar correção incompleta.
- Envio da prova **pelo aluno, questão por questão**, com o vínculo feito pelo login.

## Modelo de receita (hipótese)

- **Professor individual:** plano gratuito com poucas provas por mês e plano pago mensal com limite maior.
- **Escola:** assinatura por turma ou por aluno, com relatórios da turma e gestão de professores.
- O custo principal é a chamada de IA por prova; o preço precisa cobrir esse custo com margem, o que depende do modelo escolhido.

## Validação

- Conversas com professores (formulário da equipe) sobre tempo gasto, soluções alternativas e prazo do feedback.
- Testes com provas reais e sintéticas: análise de uma prova de 10 questões no sistema publicado; pré-correção que identificou erro de sinal e reconheceu soma e produto como alternativa válida a Bhaskara.
- Próximo passo: piloto com 2 ou 3 professores, medindo tempo de correção antes e depois.

## Riscos e respostas

| Risco | Resposta |
|---|---|
| Leitura errada de letra de mão | Leitura incerta fica pendente; o professor confere o arquivo antes de validar |
| Nota injusta sugerida pela IA | Toda nota é sugestão; a validação é individual e obrigatória |
| Lentidão da IA | Análise em paralelo por página; correção em fila, uma prova por vez |
| Privacidade dos alunos (LGPD) | Arquivos em armazenamento privado com links temporários; cada professor acessa só as próprias turmas |

## Roadmap

1. Prazo de envio por prova e reabertura controlada.
2. Histórico do aluno ao longo do ano e plano de estudo que se ajusta a cada prova.
3. Relatórios da turma por conteúdo e questão.
4. Outras disciplinas de exatas e integração com plataformas das escolas.
