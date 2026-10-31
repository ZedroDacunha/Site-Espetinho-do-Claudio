
const cors = require("cors");
const express = require("express");
const app = express();

app.use(cors());
app.use(express.json());

const produtos = [
    {nome: "frango", preco: 20, quantidade: 2, minimo: 1, id:1},
    {nome: "carne", preco: 30, quantidade: 4, minimo: 1, id:2}
];

app.post("/produtos", (req,res)=>{
    const novoProduto = req.body;
    novoProduto.id = Date.now();
    produtos.push(novoProduto);
    res.json(novoProduto);
});

app.delete("/produtos/:id", (req,res)=>{
    console.log(req.params.id);

    const idproduto = Number(req.params.id);

    const posicao = produtos.findIndex(produto => produto.id === idproduto);
    console.log(posicao);

    if(posicao === -1){
        return res.status(404).json({erro: "não encontrado"});
    }
    else{
        produtos.splice(posicao, 1);
    }

    res.json(produtos);
});

app.get("/",(req,res)=>{
    res.send("servidor do espetinho funcionando");
});

app.get("/produtos",(req,res)=>{
    res.json(produtos);
});



app.listen(3000,()=>{
    console.log("Servidor ligado na porta 3000");
    console.log("http://localhost:3000/produtos");
});
