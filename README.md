# Espetinhos do Claudio — Controle de estoque

Aplicação simples de controle de estoque feita em HTML, CSS e JavaScript, sem instalação ou servidor de banco de dados.

## Como usar

Abra `index.html` no navegador. A barra lateral separa as áreas principais:

- **Início:** resumo com total de produtos, unidades, valor estimado e itens que precisam de reposição.
- **Estoque:** lista, busca, ajuste de quantidade, edição e exclusão de produtos.
- **Importações:** exportação e restauração de cópias de segurança em JSON.
- **Cadastro:** formulário para adicionar produtos.

Use os botões `+` e `−` na lista para ajustar quantidades; **Editar** corrige os dados e **Excluir** remove um cadastro.

**Exportar backup** baixa um arquivo JSON com todos os produtos. Guarde-o em um local seguro. **Importar backup** restaura os produtos desse arquivo e substitui o estoque atual, após pedir confirmação. O modo claro/escuro e os dados ficam salvos no armazenamento local do navegador (`localStorage`) e continuam lá ao fechar e abrir o site no mesmo navegador e dispositivo. Os dados não são sincronizados entre aparelhos nem compartilhados entre navegadores; por isso, faça backups regulares e não limpe os dados do navegador se quiser manter os cadastros.
