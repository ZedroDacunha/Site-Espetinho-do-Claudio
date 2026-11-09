# Espetinhos do Claudio — Controle de estoque

Sistema de estoque com painel web, entradas e saídas, histórico e acesso protegido por senha compartilhada. Em produção, usa PostgreSQL gerenciado; no desenvolvimento local, continua funcionando com um arquivo JSON no servidor.

## Implantação gratuita (Render + Neon)

O `render.yaml` prepara o serviço Node no plano gratuito do Render. O PostgreSQL fica no Neon Free; ele é externo porque o PostgreSQL gratuito do Render expira. O Render hospeda o site e faz deploy automaticamente quando há commits na branch `main`.

### Passo a passo

1. **Guarde uma cópia dos dados atuais.** No site da prévia, abra a área de Importações e exporte o backup JSON de produtos e histórico. Guarde o arquivo no seu computador.
2. **Crie o banco no Neon.** Acesse [Neon](https://neon.tech/), crie uma conta e um projeto PostgreSQL gratuito. Escolha uma região próxima da Virgínia, se disponível. Copie a connection string (de preferência a pooled connection string); ela deve incluir SSL. Trate-a como senha e não a envie por chat nem a coloque no Git.
3. **Envie/mescle a configuração gratuita para `main`.** O `render.yaml` deve estar na branch `main` antes de criar o serviço.
4. **Crie o serviço no Render.** Acesse [Render](https://render.com/), escolha **New → Blueprint**, conecte o repositório e selecione a branch `main`. Confira que o serviço web está no plano **Free** e prossiga.
5. **Preencha os segredos quando solicitado.** Para `DATABASE_URL`, cole a connection string do Neon; para `APP_PASSWORD`, crie uma senha forte e exclusiva com pelo menos 12 caracteres. O Render gera `SESSION_SECRET`. Nunca publique esses valores.
6. **Implante e teste.** Quando o deploy terminar, abra a URL HTTPS do serviço e entre com `APP_PASSWORD`. Importe o backup JSON feito no passo 1 para transferir o estoque.
7. **Mantenha backups externos.** Exporte o backup regularmente e guarde cópias fora do Render e do Neon. Teste a restauração de tempos em tempos.

### Limites importantes do gratuito

O serviço web gratuito do Render pode dormir após 15 minutos sem tráfego e leva um tempo para acordar; seu disco local é temporário, por isso o estoque é mantido no PostgreSQL externo. O Neon Free tem limites de uso e armazenamento (atualmente 1 GB e 100 CU-horas mensais por projeto). Consulte os [limites do Render](https://render.com/docs/free) e os [planos do Neon](https://neon.com/pricing), pois podem mudar.

Esta configuração **não oferece a mesma proteção de backup e recuperação dos planos pagos**. O PostgreSQL gratuito do Render expira após 30 dias, por isso não o use para este setup. Nenhum provedor garante risco zero: os backups JSON externos são importantes.

O acesso ao estoque exige a senha compartilhada; sessões usam cookie protegido, com expiração, e tentativas de login são limitadas. O código também bloqueia uma gravação baseada numa versão antiga do estoque: se outro acesso tiver salvado antes, será preciso recarregar os dados antes de tentar de novo.

O serviço acompanha a branch `main` e inicia automaticamente um novo deploy a cada commit enviado para ela. Commits feitos em branches de trabalho só chegam ao site depois de serem integrados à `main`.

## Executar localmente

1. Instale o Node.js.
2. No terminal, dentro da pasta `servidor`, execute `npm install`.
3. Execute `npm start`.
4. Abra `http://localhost:3000`.

Sem `DATABASE_URL`, o servidor salva localmente em `servidor/data/estoque.json`, criado automaticamente e ignorado pelo Git. Para alterar a porta, defina `PORT`. O login é ativado ao definir `APP_PASSWORD`; em produção, `DATABASE_URL`, `APP_PASSWORD` e `SESSION_SECRET` são obrigatórios.

Se o servidor PostgreSQL estiver vazio e o navegador tiver dados antigos em `localStorage`, a primeira conexão os transfere automaticamente. Depois disso, o banco do servidor é a fonte principal. A cópia local do navegador é somente contingência; alterações não são aceitas quando o servidor está indisponível.

## Áreas do sistema

- **Início:** resumo de produtos, unidades, valor estimado e itens para reposição.
- **Estoque:** busca, entradas, saídas, edição, exclusão e histórico filtrável por tipo e produto.
- **Importações:** exportação e restauração de backups JSON, incluindo produtos e histórico.
- **Cadastro:** inclusão de produtos.

O backend valida os dados, suporta até 10.000 produtos e 50.000 movimentações no histórico e atualiza no banco somente os registros alterados. O histórico fica associado ao nome do produto no momento da movimentação, mesmo que o produto seja editado ou removido.

## Testes

Dentro de `servidor`, execute `npm test` para verificar persistência após reinício, validação de dados, controle de versão e proteção por senha.
