const formulario = document.querySelector("#form-produto");
const nome = document.querySelector("#nome");
const preco = document.querySelector("#preco");
const quantidade = document.querySelector("#quantidade");
const listaUl = document.querySelector("#lista-produtos");
const min = document.querySelector("#minimo");
const busca = document.querySelector("#busca");
const resumo = document.querySelector("#resumo");

let produtos = [];

function mostrarResumo(){
    const soma = produtos.reduce((total, produto) => total + (produto.preco*produto.quantidade) , 0 );
    
    const Ialerta = produtos.filter(produto => produto.quantidade<=produto.minimo).length;
    
    
    resumo.textContent = `Valor em estoque: R$${soma.toFixed(2)} alerta: ${Ialerta}`

}

async function carregarLista() {
    const resposta = await fetch("http://localhost:3000/produtos");
    produtos = await resposta.json();

    atualizarTela();
    console.log(produtos);
}

function atualizarTela(){

    const texto = busca.value.toLowerCase();
    const filtrados = produtos.filter(produto => produto.nome.toLowerCase().includes(texto));

    mostrarlista(filtrados);

}

function mostrarlista(listaMostrar){
    listaUl.innerHTML = "";

    listaMostrar.forEach((produto) => {

        const item = document.createElement("li");
        item.textContent = ` nome - ${produto.nome} / preço - ${produto.preco}R$ / quantidade - ${produto.quantidade}`;

        const botao = document.createElement("button");
        botao.textContent = "Excluir";
        
        const mais = document.createElement("button");
        mais.textContent = "+";

        const menos = document.createElement("button");
        menos.textContent = "-";

        if(produto.quantidade<=produto.minimo){
            item.classList.add("baixo");
        }

        item.appendChild(botao);
        listaUl.appendChild(item);
        item.appendChild(mais);
        item.appendChild(menos);

        botao.addEventListener("click", async()=>{
            await fetch(`http://localhost:3000/produtos/${produto.id}`,{
                method: "DELETE"
            });
            await carregarLista();
        });

        mais.addEventListener("click", ()=>{
            produto.quantidade += 1;
            salvarProduto(produtos);
            atualizarTela();
        });

        menos.addEventListener("click", ()=>{
            if(produto.quantidade<=0){
                alert("Quantidade do produto não pode ser negativa");
            }
            else{
                produto.quantidade -= 1;
            }
            salvarProduto(produtos);
            atualizarTela();
        });
        
    });
    mostrarResumo();
}

async function adicionarProduto(produto){
    await fetch("http://localhost:3000/produtos",{
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(produto)
       });
}

function salvarProduto(lista){
    localStorage.setItem("produtostxt", JSON.stringify(lista));
}

function lerProduto(){
    const texto = localStorage.getItem("produtostxt");
    const lista = JSON.parse(texto);
    return lista;
}

formulario.addEventListener("submit", async function(event){
    event.preventDefault();

    const produto = {
    nome : nome.value,
    preco : Number(preco.value),
    quantidade : Number(quantidade.value),
    minimo : Number(min.value),
}


    await adicionarProduto(produto);
    await carregarLista();

    formulario.reset();
    busca.value = "";
    
});

busca.addEventListener("input", function(){
   atualizarTela();
});


carregarLista();