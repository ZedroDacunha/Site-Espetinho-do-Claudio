# Espetinhos do Claudio — Controle de estoque

Aplicação simples de controle de estoque feita em HTML, CSS e JavaScript, sem instalação ou servidor de banco de dados.

## Como usar

Abra `index.html` no navegador. Cadastre os produtos com nome, preço, quantidade e estoque mínimo. Use os botões `+` e `−` para ajustar quantidades, **Editar** para corrigir os dados, a busca para localizar itens e **Excluir** para remover um cadastro. O painel mostra o total de produtos, unidades e valor estimado em estoque.

**Exportar backup** baixa um arquivo JSON com todos os produtos. Guarde-o em um local seguro. **Importar backup** restaura os produtos desse arquivo e substitui o estoque atual, após pedir confirmação. O modo claro/escuro e os dados ficam salvos no armazenamento local do navegador (`localStorage`) e continuam lá ao fechar e abrir o site no mesmo navegador e dispositivo. Os dados não são sincronizados entre aparelhos nem compartilhados entre navegadores; por isso, faça backups regulares e não limpe os dados do navegador se quiser manter os cadastros.
