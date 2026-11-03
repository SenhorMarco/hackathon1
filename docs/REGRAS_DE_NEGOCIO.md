# Regras de negócio - correção assistida por IA

**Situação:** decisões de produto confirmadas em 31/10/2026. Este documento descreve o comportamento desejado, não comprova que as funcionalidades estejam implementadas. A implementação deve ser conferida no código. Fonte: [card de regras de negócio](https://app.notion.com/p/40acdd63121181ba87f7f5006327b834?pvs=204) e decisões posteriores registradas na conversa da equipe.

## Objetivo e papéis

O MVP auxilia professores na correção de provas discursivas de exatas. A IA sugere critérios, avaliações e notas; o professor mantém a decisão final. Cada aluno envia sua própria prova usando seu login. O relatório baseado em dados não é necessariamente uma sugestão, mas deve identificar dados preliminares.

## Preparação e barema

- **RN01.** O professor fornece um barema ou recebe um sugerido pela IA. Quando já existe barema, a IA pode apresentar críticas e melhorias.
- **RN02.** O professor revisa e aprova os critérios antes da correção. Ele pode alterar o barema sugerido.
- **RN03.** A nota máxima de cada questão deve ser respeitada. A nota total validada é a soma das notas finais das questões.

## Envio da prova

- **RN04.** O aluno autenticado seleciona a prova e envia seu arquivo; o vínculo com o aluno é estabelecido pelo login.
- **RN05.** O professor define data e hora de encerramento para cada prova. O prazo vale para o primeiro envio e para substituições.
- **RN06.** O aluno pode substituir seu envio enquanto o prazo estiver aberto. Depois disso, apenas o professor pode autorizar uma exceção ou reabrir o prazo para aquele aluno. Sugestões baseadas no arquivo substituído precisam ser refeitas.
- **RN07.** Se um envio excepcional substituir a prova, sugestões e validações anteriores das respostas substituídas ficam desatualizadas e exigem nova avaliação.
- **RN08.** Se a questão de uma resposta não puder ser identificada com segurança, a associação fica pendente para o professor antes da validação.

## Avaliação pela IA

- **RN09.** Toda nota atribuída pela IA é uma sugestão. A avaliação da resposta e o feedback relativo ao barema também são sugestões, sujeitas à revisão do professor.
- **RN10.** Desenvolvimentos parciais válidos podem receber pontos conforme o barema, mesmo quando o resultado final está errado ou ausente.
- **RN11.** Nas sugestões da IA, resultado correto ou resposta sem embasamento não recebe pontos, mesmo que o barema preveja pontuação para o resultado. O professor pode decidir pontuar de outra forma.
- **RN12.** Cada passo deve ser avaliado pelo seu próprio embasamento e pelas dependências que realmente existirem. Não presumir que um passo depende do anterior: etapas independentes podem ser avaliadas separadamente.
- **RN13.** Uma possível solução alternativa é sinalizada. O professor pode aprovar critérios para avaliá-la, respeitando a nota máxima. Nas questões de exatas consideradas, a resposta final esperada é a mesma, embora o caminho possa ser diferente; um método diferente não é, por si só, erro.
- **RN14.** Uma folha aparentemente em branco pode receber sugestão de zero, sujeita à revisão do professor. Página ausente ou resposta ilegível fica pendente de revisão; não presumir que esteja em branco nem atribuir zero automaticamente por falta de informação.

## Revisão, agrupamento e mudanças

- **RN15.** O professor revisa as respostas por questão. Elas podem ser organizadas por abordagem para permitir revisão sequencial de soluções semelhantes; a análise e a validação permanecem individuais, pois soluções semelhantes podem diferir.
- **RN16.** O professor pode aceitar ou alterar a nota sugerida e editar ou rejeitar o feedback antes de validar a resposta.
- **RN17.** Se o barema mudar antes da validação, as sugestões afetadas ficam desatualizadas e devem ser reavaliadas. Se mudar depois, o professor é avisado sobre correções possivelmente afetadas e decide se as revê; notas já validadas não mudam automaticamente.

## Liberação e relatórios

- **RN18.** A nota total e a devolutiva completa só podem ser liberadas quando todas as respostas da prova tiverem sido validadas. Após isso, o professor realiza uma ação explícita de liberação. **Atualização de 31/10 (decisão da equipe):** a nota e o comentário de cada questão aparecem para o aluno assim que o professor valida aquela questão, antes da liberação da prova inteira.
- **RN19.** Se o professor alterar uma nota depois da divulgação, o aluno passa a ver a nota e o feedback atualizados, com indicação de que houve alteração.
- **RN20.** Relatórios finais utilizam notas validadas. Se forem exibidos dados ainda sugeridos, devem ser identificados como preliminares. Um relatório factual baseado em dados não é, por isso, uma sugestão.

## Possibilidade futura ou escopo ainda não definido

- **Atribuição de nota em lote:** é uma possibilidade, não uma exigência confirmada para o MVP. Se existir, o professor seleciona explicitamente as respostas afetadas e pode ajustá-las individualmente. A recomendação continua sendo análise individual e sequencial por abordagem.
- Perfil histórico do aluno e plano de estudos integram a visão mais ampla do produto; não presumir que sejam exigências implementadas ou confirmadas para o MVP.

## Orientação para colegas e agentes de IA

Use estas regras como decisões de produto para orientar especificação, implementação e testes. Não trate propostas futuras como funcionalidades existentes. Em caso de divergência com o código ou outros documentos, indique a divergência e verifique com a equipe; não presuma que o código atual cumpra todas as regras. Preserve a autoridade do professor e a distinção entre dados validados e sugestões.
