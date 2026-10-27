const formulario = document.querySelector("#form-produto");
const ver = document.querySelector("#verlista");
const nome = document.querySelector("#nome");
const preco = document.querySelector("#preco");
const quantidade = document.querySelector("#quantidade");
const lista = document.querySelector("lista-produtos");



const list = lerProduto();
const produtos = list || [];


function mostrarlista(produtos){
    lista.innerHTML = "";

    lista.forEach( produtos => {
        const item = document.createElement("li");
        item.textContent = produtos;
        lista.appendChild(item);
        
    });
}

function adicionarProduto(produto){
    produtos.push(produto);
    console.log(produtos);
}

function salvarProduto(lista){
    localStorage.setItem("produtostxt", JSON.stringify(lista));
}

function lerProduto(){
    const texto = localStorage.getItem("produtostxt");
    const lista = JSON.parse(texto);
    return lista;
}

ver.addEventListener("click", function(produto) {
    console.log(lerProduto());
    mostrar
});

formulario.addEventListener("submit", function(event){
    event.preventDefault();
    console.log("enviou o formulário");

    const produto = {
    nome : nome.value,
    preco : Number(preco.value),
    quantidade : Number(quantidade.value)
    
}

    adicionarProduto(produto);
    salvarProduto(produtos);

    formulario.reset();

    console.log(produto);
    console.log(typeof produto.preco);

});
