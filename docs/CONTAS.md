# Contas de professor e aluno

## Atualizar o Supabase existente

1. Faça um backup e execute `supabase/schema.sql` se o banco ainda não tiver todas as tabelas da aplicação.
2. Execute `supabase/contas.sql` no SQL Editor. É uma migração transacional e pode ser reaplicada. Não remove provas nem alunos.
3. Em Authentication, habilite o provedor Email e a confirmação de e-mail. Configure Site URL com o domínio publicado e adicione `https://SEU-DOMINIO/auth/callback` às Redirect URLs. Para desenvolvimento, adicione `http://localhost:3000/auth/callback`. Configure SMTP para entrega de e-mails em produção.
4. Configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no Vercel e em `.env.local`. Use a URL base e a chave publicável/anon do MESMO projeto já usado por `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`. Nunca use service_role na variável pública. Faça um novo deploy após alterar variáveis públicas.
5. Acesse `/login`, crie uma conta de professor e confirme o e-mail. A conta recebe apenas turmas próprias. Novas turmas e alunos são persistidos no Supabase e carregados em outros dispositivos após o login.

## Turmas anteriores ao login

As turmas antigas ficam com `professor_id` nulo. Elas não aparecem automaticamente para qualquer pessoa que se cadastrar. No SQL Editor, consulte `perfis` e `turmas`, confira o proprietário e execute explicitamente:

```sql
update public.turmas
set professor_id = 'UUID_DO_PERFIL_PROFESSOR'
where id = 'UUID_DA_TURMA';
```

Contas Auth existentes antes da migração recebem papel `aluno`. Para uma conta que deve ser professora, o administrador pode executar `update public.perfis set papel = 'professor' where id = 'UUID';`. Não altere o papel pelo user_metadata: ele só é usado pelo trigger na criação inicial.

## Fluxo dos alunos

O professor cadastra o aluno na turma com seu e-mail. O aluno cria sua própria conta com esse mesmo e-mail e o confirma. O portal `/aluno` lista suas submissões e só abre devolutivas publicadas. O professor continua enviando e associando as provas respondidas pelo fluxo existente. O aluno não pode editar baremas, notas ou provas.

Para alunos antigos, preencha `alunos.email` com o e-mail correto, em minúsculas. Não associe automaticamente por nome. Os links antigos de devolutiva agora exigem a conta do aluno correspondente ou a do professor proprietário.

## Sessão e permissões

Cadastro público permite escolher aluno ou professor; uma nova conta de professor começa sem acesso a dados anteriores. Os perfis não permitem alteração de papel diretamente pelo navegador. O Supabase Auth gerencia senhas, confirmação e recuperação. Cookies de sessão são renovados pelo proxy, e o servidor verifica o usuário com `getUser` e consulta o perfil persistido.

As rotas de provas e upload verificam papel, propriedade e origem das operações de escrita. O bucket permanece privado; tickets de upload ficam vinculados à conta. Como as APIs existentes usam service_role, as verificações de propriedade no servidor são obrigatórias. A migração revoga o acesso direto de anon/authenticated às tabelas educacionais; os alunos recebem somente os dados filtrados no servidor. Não há compartilhamento global de turmas entre professores.

O localStorage é separado por conta e os dados do banco prevalecem ao recarregar. Rascunhos ainda não salvos na API não são sincronizados entre dispositivos.

## Conferência após configuração

- Professor A cria turma e prova; deve encontrá-las após entrar em outro navegador.
- Professor B e aluno não podem acessar a API dessa prova nem seus arquivos.
- Aluno vinculado por e-mail confirmado vê somente suas devolutivas publicadas.
- Verifique confirmação de e-mail, recuperação de senha, renovação de sessão e logout com o Supabase configurado.

## Verificação local automatizada

Execute `npm run build` e `node scripts/testar-contas.mjs`. O teste usa um Supabase simulado e confere bloqueios de visitante/aluno, propriedade de turma/prova, origem de escrita e redirecionamento ao login. Ele não executa SQL nem envia e-mails reais.
