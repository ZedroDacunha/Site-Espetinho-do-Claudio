const formulario = document.querySelector("#form-produto");

formulario.addEventListener("submit", function(event){
    event.preventDefault();
    console.log("enviou o formulário");
});