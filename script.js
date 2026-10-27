const formulario = document.querySelector("#form-produto");
const nome = document.querySelector("#nome");
const preco = document.querySelector("#preco");
const quantidade = document.querySelector("#quantidade");
const lista = document.querySelector("#lista-produtos");


const list = lerProduto();
const produtos = list || [];


function mostrarlista(produtos){
    lista.innerHTML = "";

    produtos.forEach((produto, indice) => {
        
        const item = document.createElement("li");
        item.textContent = ` nome - ${produto.nome} / preço - ${produto.preco}R$ / quantidade - ${produto.quantidade}`;

        const botao = document.createElement("button");
        botao.textContent = "Excluir";
        
        const mais = document.createElement("button");
        mais.textContent = "+";

        const menos = document.createElement("button");
        menos.textContent = "-";

        item.appendChild(botao);
        lista.appendChild(item);
        item.appendChild(mais);
        item.appendChild(menos);

        botao.addEventListener("click", ()=>{
            produtos.splice(indice, 1);
            salvarProduto(produtos);
            mostrarlista(produtos);
        });

        mais.addEventListener("click", ()=>{
            console.log(produto.quantidade);
            produto.quantidade += 1;
            console.log(produto.quantidade);
            salvarProduto(produtos);
            mostrarlista(produtos);
        });
        menos.addEventListener("click", ()=>{
            console.log(produto.quantidade);
            if(produto.quantidade<=0){
                alert("Quantidade do produto não pode ser negativa");
            }
            else{
                produto.quantidade -= 1;
            }
            console.log(produto.quantidade);
            salvarProduto(produtos);
            mostrarlista(produtos);
        });
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

    mostrarlista(produtos);

    console.log(produto);
    console.log(typeof produto.preco);

});

mostrarlista(produtos);