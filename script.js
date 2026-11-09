const STORAGE_KEY = "espetinhos-claudio-produtos-v1";
const THEME_KEY = "espetinhos-claudio-tema";

const form = document.querySelector("#form-produto");
const nomeInput = document.querySelector("#nome");
const precoInput = document.querySelector("#preco");
const quantidadeInput = document.querySelector("#quantidade");
const minimoInput = document.querySelector("#minimo");
const searchInput = document.querySelector("#busca");
const productList = document.querySelector("#lista-produtos");
const emptyState = document.querySelector("#empty-state");
const statusMessage = document.querySelector("#status-message");
const themeToggle = document.querySelector("#theme-toggle");
let products = loadProducts();
let statusTimer;

function loadProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isValidProduct) : [];
  } catch (error) {
    console.error("Não foi possível ler os produtos salvos.", error);
    return [];
  }
}

function isValidProduct(product) {
  return product && typeof product.nome === "string" && Number.isFinite(Number(product.preco)) && Number.isFinite(Number(product.quantidade));
}

function saveProducts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    return true;
  } catch (error) {
    console.error("Não foi possível salvar os produtos.", error);
    showStatus("Não foi possível salvar. Verifique o espaço disponível no navegador.", true);
    return false;
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? "var(--red)" : "var(--green)";
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => { statusMessage.textContent = ""; }, 3500);
}

function updateSummary() {
  const totalUnits = products.reduce((total, product) => total + Number(product.quantidade), 0);
  const stockValue = products.reduce((total, product) => total + Number(product.preco) * Number(product.quantidade), 0);
  document.querySelector("#stat-products").textContent = products.length;
  document.querySelector("#stat-units").textContent = totalUnits;
  document.querySelector("#stat-value").textContent = formatMoney(stockValue);
  document.querySelector("#count-pill").textContent = products.length;
}

function createProductRow(product) {
  const row = document.createElement("article");
  row.className = "product-row";

  const details = document.createElement("div");
  const name = document.createElement("p");
  name.className = "product-name";
  name.textContent = product.nome;
  const price = document.createElement("span");
  price.className = "product-price";
  price.textContent = `${formatMoney(Number(product.preco))} por unidade`;
  details.append(name, price);

  const quantity = Number(product.quantidade);
  const minimum = Number(product.minimo) || 0;
  const badge = document.createElement("span");
  badge.className = "stock-badge";
  if (quantity === 0) {
    badge.classList.add("empty");
    badge.textContent = "● Sem estoque";
  } else if (quantity <= minimum) {
    badge.classList.add("low");
    badge.textContent = `● Estoque baixo · mín. ${minimum}`;
  } else {
    badge.textContent = "● Em estoque";
  }

  const actions = document.createElement("div");
  actions.className = "product-actions";
  const controls = document.createElement("div");
  controls.className = "stock-controls";
  const decreaseButton = makeQuantityButton("−", `Diminuir quantidade de ${product.nome}`);
  decreaseButton.disabled = quantity <= 0;
  decreaseButton.addEventListener("click", () => changeQuantity(product.id, -1));
  const amount = document.createElement("span");
  amount.className = "quantity-value";
  amount.textContent = quantity;
  const increaseButton = makeQuantityButton("+", `Aumentar quantidade de ${product.nome}`);
  increaseButton.addEventListener("click", () => changeQuantity(product.id, 1));
  controls.append(decreaseButton, amount, increaseButton);

  const removeButton = document.createElement("button");
  removeButton.className = "delete-button";
  removeButton.type = "button";
  removeButton.textContent = "Excluir";
  removeButton.setAttribute("aria-label", `Excluir ${product.nome}`);
  removeButton.addEventListener("click", () => removeProduct(product.id));
  actions.append(controls, removeButton);

  row.append(details, badge, actions);
  return row;
}

function makeQuantityButton(label, accessibleName) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "quantity-button";
  button.textContent = label;
  button.setAttribute("aria-label", accessibleName);
  return button;
}

function renderProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const filtered = products.filter(product => product.nome.toLocaleLowerCase("pt-BR").includes(query));
  productList.replaceChildren(...filtered.map(createProductRow));
  productList.classList.add("product-list");
  emptyState.hidden = products.length > 0;
  let noResults = document.querySelector("#no-results");
  if (products.length > 0 && filtered.length === 0) {
    if (!noResults) {
      noResults = document.createElement("p");
      noResults.id = "no-results";
      noResults.className = "empty-state";
      noResults.textContent = "Nenhum produto encontrado com esse nome.";
      productList.after(noResults);
    }
    noResults.hidden = false;
  } else if (noResults) {
    noResults.hidden = true;
  }
  updateSummary();
}

function changeQuantity(id, amount) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  product.quantidade = Math.max(0, Number(product.quantidade) + amount);
  if (saveProducts()) renderProducts();
}

function removeProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  products = products.filter(item => item.id !== id);
  if (saveProducts()) {
    renderProducts();
    showStatus(`${product.nome} foi excluído do estoque.`);
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const product = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nome: nomeInput.value.trim(),
    preco: Number(precoInput.value),
    quantidade: Number(quantidadeInput.value),
    minimo: Number(minimoInput.value)
  };
  if (!product.nome || product.preco < 0 || product.quantidade < 0 || product.minimo < 0) return;
  products.unshift(product);
  if (saveProducts()) {
    renderProducts();
    form.reset();
    searchInput.value = "";
    nomeInput.focus();
    showStatus(`${product.nome} foi adicionado ao estoque.`);
  }
});

searchInput.addEventListener("input", renderProducts);

document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  themeToggle.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
  themeToggle.querySelector(".theme-label").textContent = dark ? "Modo claro" : "Modo escuro";
  themeToggle.setAttribute("aria-label", dark ? "Ativar modo claro" : "Ativar modo escuro");
  document.querySelector('meta[name="theme-color"]').content = dark ? "#171816" : "#f7f5f0";
  try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* O tema ainda funciona durante esta sessão. */ }
}

let initialTheme = "light";
try {
  initialTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch (_) { /* Usa o tema claro se o armazenamento estiver indisponível. */ }
applyTheme(initialTheme);
themeToggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

document.querySelector("#today").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
renderProducts();
