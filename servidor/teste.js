console.log("node funcionando");
console.log(typeof document);

const express = require("express");
const app = express();

app.get("/", (req,res) => {
    res.send("olá, visitante!");
});

app.get("/produtos",(rew,res)=>{
    res.json("script.js");
})

app.listen(3000, ()=>{
    console.log("Servidor ligado na porta 3000");
});