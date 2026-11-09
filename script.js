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
  return product && typeof product.nome === "string" && product.nome.trim().length > 0
    && Number.isFinite(Number(product.preco)) && Number(product.preco) >= 0
    && Number.isInteger(Number(product.quantidade)) && Number(product.quantidade) >= 0
    && Number.isInteger(Number(product.minimo)) && Number(product.minimo) >= 0;
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
  document.querySelector("#nav-product-count").textContent = products.length;

  const lowStockProducts = products.filter(product => Number(product.quantidade) <= (Number(product.minimo) || 0));
  document.querySelector("#stat-low-count").textContent = lowStockProducts.length;
  document.querySelector("#low-stock-pill").textContent = lowStockProducts.length;
  const lowStockList = document.querySelector("#dashboard-low-stock");
  lowStockList.replaceChildren(...lowStockProducts.map(product => {
    const row = document.createElement("div");
    row.className = "low-stock-row";
    const name = document.createElement("strong");
    name.textContent = product.nome;
    const amount = document.createElement("span");
    amount.textContent = `${product.quantidade} em estoque · mínimo ${product.minimo}`;
    row.append(name, amount);
    return row;
  }));
  document.querySelector("#low-stock-empty").hidden = lowStockProducts.length > 0;
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

  const editButton = document.createElement("button");
  editButton.className = "edit-button";
  editButton.type = "button";
  editButton.textContent = "Editar";
  editButton.setAttribute("aria-label", `Editar ${product.nome}`);
  editButton.addEventListener("click", () => openEditDialog(product));

  const removeButton = document.createElement("button");
  removeButton.className = "delete-button";
  removeButton.type = "button";
  removeButton.textContent = "Excluir";
  removeButton.setAttribute("aria-label", `Excluir ${product.nome}`);
  removeButton.addEventListener("click", () => removeProduct(product.id));
  const recordActions = document.createElement("div");
  recordActions.className = "record-actions";
  recordActions.append(editButton, removeButton);
  actions.append(controls, recordActions);

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
  const previousQuantity = product.quantidade;
  product.quantidade = Math.max(0, Number(product.quantidade) + amount);
  if (saveProducts()) renderProducts();
  else product.quantidade = previousQuantity;
}

function removeProduct(id) {
  const product = products.find(item => item.id === id);
  if (!product) return;
  const previousProducts = products;
  products = products.filter(item => item.id !== id);
  if (saveProducts()) {
    renderProducts();
    showStatus(`${product.nome} foi excluído do estoque.`);
  } else {
    products = previousProducts;
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const product = {
    id: newProductId(),
    nome: nomeInput.value.trim(),
    preco: Number(precoInput.value),
    quantidade: Number(quantidadeInput.value),
    minimo: Number(minimoInput.value)
  };
  if (!product.nome || product.preco < 0 || product.quantidade < 0 || product.minimo < 0) return;
  const previousProducts = products;
  products = [product, ...products];
  if (saveProducts()) {
    renderProducts();
    form.reset();
    searchInput.value = "";
    nomeInput.focus();
    showStatus(`${product.nome} foi adicionado ao estoque.`);
  } else {
    products = previousProducts;
  }
});

function openEditDialog(product) {
  document.querySelector("#edit-id").value = product.id;
  document.querySelector("#edit-nome").value = product.nome;
  document.querySelector("#edit-preco").value = product.preco;
  document.querySelector("#edit-quantidade").value = product.quantidade;
  document.querySelector("#edit-minimo").value = product.minimo;
  document.querySelector("#edit-dialog").showModal();
  document.querySelector("#edit-nome").focus();
}

const editDialog = document.querySelector("#edit-dialog");
const editForm = document.querySelector("#edit-form");
document.querySelector("#cancel-edit").addEventListener("click", () => editDialog.close());
document.querySelector("#close-edit").addEventListener("click", () => editDialog.close());
editForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!editForm.reportValidity()) return;
  const id = document.querySelector("#edit-id").value;
  const product = products.find(item => String(item.id) === id);
  if (!product) return editDialog.close();
  const previous = { ...product };
  product.nome = document.querySelector("#edit-nome").value.trim();
  product.preco = Number(document.querySelector("#edit-preco").value);
  product.quantidade = Number(document.querySelector("#edit-quantidade").value);
  product.minimo = Number(document.querySelector("#edit-minimo").value);
  if (!product.nome || !isValidProduct(product)) {
    Object.assign(product, previous);
    showStatus("Confira os dados do produto antes de salvar.", true);
    return;
  }
  if (!saveProducts()) {
    Object.assign(product, previous);
    return;
  }
  editDialog.close();
  renderProducts();
  showStatus(`${product.nome} foi atualizado.`);
});

const backupFileInput = document.querySelector("#backup-file");
document.querySelector("#export-backup").addEventListener("click", () => {
  const backup = {
    app: "Espetinhos do Claudio",
    version: 1,
    exportedAt: new Date().toISOString(),
    products
  };
  const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-espetinhos-claudio-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showStatus("Backup exportado. Guarde o arquivo em um local seguro.");
});

document.querySelector("#import-backup").addEventListener("click", () => backupFileInput.click());
backupFileInput.addEventListener("change", async () => {
  const file = backupFileInput.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("O arquivo é muito grande (limite de 5 MB).");
    const backup = JSON.parse(await file.text());
    if (!backup || backup.version !== 1 || !Array.isArray(backup.products)) {
      throw new Error("Este arquivo não parece ser um backup válido do estoque.");
    }
    if (!backup.products.every(isValidProduct)) {
      throw new Error("O backup contém produtos com dados inválidos. Nenhuma alteração foi feita.");
    }
    const imported = backup.products.map(product => ({
      id: product.id === undefined || product.id === null ? newProductId() : String(product.id),
      nome: product.nome.trim(),
      preco: Number(product.preco),
      quantidade: Number(product.quantidade),
      minimo: Number(product.minimo)
    }));
    const ids = new Set();
    for (const product of imported) {
      if (!product.id || ids.has(product.id)) product.id = newProductId();
      ids.add(product.id);
    }
    if (!window.confirm(`Este arquivo tem ${imported.length} produto(s). A importação vai substituir todo o estoque atual. Deseja continuar?`)) return;
    const previous = products;
    products = imported;
    if (!saveProducts()) {
      products = previous;
      return;
    }
    searchInput.value = "";
    renderProducts();
    showStatus(`Backup importado: ${products.length} produto(s) restaurado(s).`);
  } catch (error) {
    showStatus(error instanceof SyntaxError ? "Não foi possível ler o arquivo. Escolha um backup JSON válido." : error.message, true);
  } finally {
    backupFileInput.value = "";
  }
});

function newProductId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

searchInput.addEventListener("input", renderProducts);

const validViews = new Set(["inicio", "estoque", "importacoes", "cadastro"]);
function activateView(viewName) {
  const activeView = validViews.has(viewName) ? viewName : "inicio";
  document.querySelectorAll(".view").forEach(view => { view.hidden = view.id !== activeView; });
  document.querySelectorAll(".nav-link").forEach(link => {
    if (link.getAttribute("href") === `#${activeView}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  closeMobileMenu();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeMobileMenu() {
  document.body.classList.remove("sidebar-open");
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
  document.querySelector("#menu-toggle").setAttribute("aria-label", "Abrir menu");
}

document.querySelectorAll("[data-view-link]").forEach(link => link.addEventListener("click", () => {
  window.setTimeout(() => activateView(window.location.hash.slice(1)), 0);
}));
window.addEventListener("hashchange", () => activateView(window.location.hash.slice(1)));
activateView(window.location.hash.slice(1) || "inicio");

document.querySelector("#menu-toggle").addEventListener("click", () => {
  const isOpen = document.body.classList.toggle("sidebar-open");
  document.querySelector("#menu-toggle").setAttribute("aria-expanded", String(isOpen));
  document.querySelector("#menu-toggle").setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
});
document.querySelector("#nav-overlay").addEventListener("click", closeMobileMenu);

document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (window.location.hash !== "#estoque") window.location.hash = "estoque";
    activateView("estoque");
    searchInput.focus();
  }
  if (event.key === "Escape") closeMobileMenu();
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
