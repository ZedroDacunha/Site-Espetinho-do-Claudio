
const cors = require("cors");
const express = require("express");
const app = express();

app.use(cors());
app.use(express.json());

app.post("/produtos", (req,res)=>{
    console.log(req.body);
    let novo
    res.json(produto);
})

const produto = [
    {nome: "frango", preco: 20, quantidade: 2, minimo: 1},
    {nome: "carne", preco: 30, quantidade: 4, minimo: 1}
];

app.get("/",(req,res)=>{
    res.send("servidor do espetinho funcionando");
});

app.get("/produtos",(req,res)=>{
    res.json(produto);
});

app.listen(3000,()=>{
    console.log("Servidor ligado na porta 3000");
});
