# Espetinhos do Claudio — Controle de estoque

Sistema de estoque com painel web, entradas e saídas, histórico e acesso protegido por senha compartilhada. Em produção, usa PostgreSQL gerenciado; no desenvolvimento local, continua funcionando com um arquivo JSON no servidor.

## Implantação em nuvem (Render)

O repositório inclui `render.yaml`, que prepara um serviço web Node e um PostgreSQL na região da Virgínia. Essa região fica mais perto do Brasil do que as outras regiões disponíveis no Render. O plano do banco e do serviço é **pago**; o Blueprint usa um banco inicial de 5 GB. O Render mostra os valores antes da confirmação da criação.

1. Envie o repositório ao GitHub e, no Render, escolha **New → Blueprint** e conecte o repositório.
2. Revise os recursos descritos em `render.yaml` e confirme a implantação.
3. Quando solicitado, informe `APP_PASSWORD` no painel do Render. Use uma senha forte e exclusiva, com pelo menos 12 caracteres; não a coloque no código ou no Git.
4. O Render gera `SESSION_SECRET` e conecta o site ao PostgreSQL pela rede privada. Depois do deploy, abra a URL HTTPS do serviço e entre com a senha.
5. O serviço acompanha a branch `main` e inicia automaticamente um novo deploy a cada commit enviado para ela. Assim, commits feitos em branches de trabalho só chegam ao site depois de serem integrados à `main`.

O acesso ao estoque exige a senha compartilhada; sessões usam cookie protegido, com expiração, e tentativas de login são limitadas. O PostgreSQL aceita conexões somente da rede privada do Render. O código também bloqueia uma gravação baseada numa versão antiga do estoque: se outro acesso tiver salvado antes, será preciso recarregar os dados antes de tentar de novo.

**Antes de trocar do endereço de prévia para a URL do Render, exporte um backup no site atual.** Os navegadores isolam os dados locais por domínio; depois do deploy, entre no Render e importe esse arquivo para levar produtos e histórico ao servidor novo.

### Persistência e cópias de segurança

O Blueprint usa um plano pago do Render Postgres, não o plano gratuito. Segundo a [documentação oficial do Render](https://render.com/docs/postgresql-backups), bancos pagos recebem recuperação contínua para um ponto no tempo: a janela é de 3 dias no workspace Hobby e 7 dias no Pro ou superior. Exportações lógicas podem ser baixadas para guardar cópias fora do Render. O plano gratuito não oferece esses backups automáticos e expira após 30 dias.

Nenhum provedor pode prometer risco zero de perda. Mantenha também cópias exportadas fora da conta do Render e teste a restauração. A [documentação de backups](https://render.com/docs/postgresql-backups) explica a recuperação e as exportações. O armazenamento de 5 GB é um ponto de partida; o Render permite aumentar capacidade e plano quando necessário.

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
