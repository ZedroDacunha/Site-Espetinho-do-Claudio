const express = require("express");
const app = express();


const produto = [
    {nome: "frango", preco: 20},
    {nome: "carne", preco: 30}
];

app.get("/",(req,res)=>{
    res.send("servidor do espetinho funcionando");
});

app.get("/produtos",(req,res)=>{
    res.json(produto);
})

app.listen(3000,()=>{
    console.log("Servidor ligado na porta 3000");
})