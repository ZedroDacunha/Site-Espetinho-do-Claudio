# Espetinhos do Claudio — Controle de estoque

Aplicação simples de controle de estoque feita em HTML, CSS e JavaScript, sem instalação ou servidor de banco de dados.

## Como usar

Abra `index.html` no navegador. A barra lateral separa as áreas principais:

- **Início:** resumo com total de produtos, unidades, valor estimado e itens que precisam de reposição.
- **Estoque:** lista, busca, registro de entradas e saídas com quantidade e observação, edição, exclusão e histórico de movimentações filtrável por tipo e produto.
- **Importações:** exportação e restauração de cópias de segurança em JSON, incluindo produtos e histórico.
- **Cadastro:** formulário para adicionar produtos.

Use **Entrada** ou **Saída** na lista para registrar quantidades movimentadas; uma saída maior que o estoque disponível não é permitida. **Editar** corrige os dados do produto e, se a quantidade for alterada por ali, o ajuste também é registrado no histórico. **Excluir** remove o produto, mas mantém as movimentações passadas no histórico. Produtos cadastrados com quantidade inicial maior que zero recebem uma entrada inicial no histórico.

**Exportar backup** baixa um arquivo JSON com os produtos e as movimentações. Guarde-o em um local seguro. **Importar backup** restaura ambos e substitui os dados atuais, após pedir confirmação. O modo claro/escuro e os dados ficam salvos no armazenamento local do navegador (`localStorage`) e continuam lá ao fechar e abrir o site no mesmo navegador e dispositivo. Os dados não são sincronizados entre aparelhos nem compartilhados entre navegadores; por isso, faça backups regulares e não limpe os dados do navegador se quiser manter os cadastros.
