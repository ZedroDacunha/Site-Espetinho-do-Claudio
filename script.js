const STORAGE_KEY = "espetinhos-claudio-produtos-v1";
const MOVEMENTS_KEY = "espetinhos-claudio-movimentacoes-v1";
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
let movements = loadMovements();
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

function loadMovements() {
  try {
    const saved = JSON.parse(localStorage.getItem(MOVEMENTS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isValidMovement).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  } catch (error) {
    console.error("Não foi possível ler o histórico salvo.", error);
    return [];
  }
}

function isValidMovement(movement) {
  return movement && typeof movement.productName === "string"
    && ["entrada", "saida", "ajuste"].includes(movement.type)
    && Number.isInteger(Number(movement.quantity)) && Number(movement.quantity) > 0
    && typeof movement.createdAt === "string" && Number.isFinite(Date.parse(movement.createdAt));
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

function saveInventory() {
  let previousProducts;
  let previousMovements;
  try {
    previousProducts = localStorage.getItem(STORAGE_KEY);
    previousMovements = localStorage.getItem(MOVEMENTS_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(movements));
    return true;
  } catch (error) {
    console.error("Não foi possível salvar a movimentação.", error);
    try {
      if (previousProducts === null) localStorage.removeItem(STORAGE_KEY);
      else if (previousProducts !== undefined) localStorage.setItem(STORAGE_KEY, previousProducts);
      if (previousMovements === null) localStorage.removeItem(MOVEMENTS_KEY);
      else if (previousMovements !== undefined) localStorage.setItem(MOVEMENTS_KEY, previousMovements);
    } catch (_) { /* Tenta preservar a mensagem de erro mesmo se o navegador bloquear a restauração. */ }
    showStatus("Não foi possível salvar a movimentação. Confira o espaço disponível no navegador.", true);
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
  const movementButtons = document.createElement("div");
  movementButtons.className = "movement-buttons";
  const entryButton = document.createElement("button");
  entryButton.className = "movement-trigger entry-trigger";
  entryButton.type = "button";
  entryButton.textContent = "+ Entrada";
  entryButton.setAttribute("aria-label", `Registrar entrada de ${product.nome}`);
  entryButton.addEventListener("click", () => openMovementDialog(product, "entrada"));
  const exitButton = document.createElement("button");
  exitButton.className = "movement-trigger exit-trigger";
  exitButton.type = "button";
  exitButton.textContent = "− Saída";
  exitButton.disabled = quantity <= 0;
  exitButton.setAttribute("aria-label", `Registrar saída de ${product.nome}`);
  exitButton.addEventListener("click", () => openMovementDialog(product, "saida"));
  movementButtons.append(entryButton, exitButton);

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
  actions.append(movementButtons, recordActions);

  row.append(details, badge, actions);
  return row;
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
  renderMovements();
}

function renderMovements() {
  const typeFilter = document.querySelector("#movement-filter").value;
  const productFilter = document.querySelector("#movement-product-filter");
  const selectedProduct = productFilter.value || "todos";
  const productNames = [...new Set(movements.map(movement => movement.productName))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const productOptions = [new Option("Todos", "todos"), ...productNames.map(name => new Option(name, name))];
  productFilter.replaceChildren(...productOptions);
  if (productNames.includes(selectedProduct)) productFilter.value = selectedProduct;
  const selectedName = productFilter.value;
  const sorted = [...movements].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const filtered = sorted.filter(movement => (typeFilter === "todas" || movement.type === typeFilter)
    && (selectedName === "todos" || movement.productName === selectedName));
  const list = document.querySelector("#movement-list");
  list.replaceChildren(...filtered.map(movement => {
    const row = document.createElement("article");
    row.className = "movement-row";
    const details = document.createElement("div");
    details.className = "movement-details";
    const title = document.createElement("strong");
    const labels = { entrada: "Entrada", saida: "Saída", ajuste: "Ajuste" };
    title.textContent = `${labels[movement.type]} · ${movement.productName}`;
    const meta = document.createElement("span");
    const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(movement.createdAt));
    meta.textContent = movement.note ? `${date} · ${movement.note}` : date;
    details.append(title, meta);
    const quantity = document.createElement("span");
    quantity.className = `movement-amount ${movement.type}`;
    const sign = movement.type === "entrada" ? "+" : movement.type === "saida" ? "−" : "±";
    quantity.textContent = `${sign}${movement.quantity} un.`;
    row.append(details, quantity);
    return row;
  }));
  document.querySelector("#movement-count").textContent = movements.length;
  const empty = document.querySelector("#movement-empty");
  empty.hidden = filtered.length > 0;
  const emptyTitle = empty.querySelector("strong");
  const emptyDescription = empty.querySelector("p");
  if (movements.length === 0) {
    emptyTitle.textContent = "Nenhuma movimentação ainda";
    emptyDescription.textContent = "Quando você registrar uma entrada ou saída, ela aparecerá aqui.";
  } else {
    emptyTitle.textContent = "Nenhum resultado";
    emptyDescription.textContent = "Não há movimentações com esse filtro.";
  }
}

document.querySelector("#movement-filter").addEventListener("change", renderMovements);
document.querySelector("#movement-product-filter").addEventListener("change", renderMovements);

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
  const previousMovements = movements;
  products = [product, ...products];
  if (product.quantidade > 0) movements = [makeMovement(product, "entrada", product.quantidade, "Estoque inicial no cadastro"), ...movements];
  if (saveInventory()) {
    renderProducts();
    form.reset();
    searchInput.value = "";
    nomeInput.focus();
    showStatus(`${product.nome} foi adicionado ao estoque.`);
  } else {
    products = previousProducts;
    movements = previousMovements;
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
  const previousMovements = movements;
  product.nome = document.querySelector("#edit-nome").value.trim();
  product.preco = Number(document.querySelector("#edit-preco").value);
  product.quantidade = Number(document.querySelector("#edit-quantidade").value);
  product.minimo = Number(document.querySelector("#edit-minimo").value);
  if (!product.nome || !isValidProduct(product)) {
    Object.assign(product, previous);
    showStatus("Confira os dados do produto antes de salvar.", true);
    return;
  }
  const quantityDifference = product.quantidade - previous.quantidade;
  if (quantityDifference !== 0) {
    const adjustment = makeMovement(product, "ajuste", Math.abs(quantityDifference), quantityDifference > 0 ? "Ajuste manual: aumento ao editar o produto" : "Ajuste manual: redução ao editar o produto");
    movements = [adjustment, ...movements];
  }
  const saved = quantityDifference === 0 ? saveProducts() : saveInventory();
  if (!saved) {
    Object.assign(product, previous);
    movements = previousMovements;
    return;
  }
  editDialog.close();
  renderProducts();
  showStatus(quantityDifference === 0 ? `${product.nome} foi atualizado.` : `${product.nome} foi atualizado e o ajuste entrou no histórico.`);
});

const movementDialog = document.querySelector("#movement-dialog");
const movementForm = document.querySelector("#movement-form");
const movementQuantityInput = document.querySelector("#movement-quantity");
function openMovementDialog(product, type) {
  document.querySelector("#movement-product-id").value = product.id;
  document.querySelector("#movement-type").value = type;
  document.querySelector("#movement-dialog-title").textContent = type === "entrada" ? "Registrar entrada" : "Registrar saída";
  document.querySelector("#movement-submit").textContent = type === "entrada" ? "Confirmar entrada" : "Confirmar saída";
  document.querySelector("#movement-product-info").textContent = `${product.nome} · ${product.quantidade} unidade(s) em estoque`;
  movementQuantityInput.value = "";
  if (type === "saida") movementQuantityInput.max = product.quantidade;
  else movementQuantityInput.removeAttribute("max");
  document.querySelector("#movement-note").value = "";
  movementDialog.showModal();
  movementQuantityInput.focus();
}

document.querySelector("#cancel-movement").addEventListener("click", () => movementDialog.close());
document.querySelector("#close-movement").addEventListener("click", () => movementDialog.close());
movementForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!movementForm.reportValidity()) return;
  const productId = document.querySelector("#movement-product-id").value;
  const type = document.querySelector("#movement-type").value;
  const product = products.find(item => String(item.id) === productId);
  const amount = Number(movementQuantityInput.value);
  if (!product || !Number.isInteger(amount) || amount < 1) return;
  if (type === "saida" && amount > Number(product.quantidade)) {
    movementQuantityInput.setCustomValidity("A saída não pode ser maior que o estoque disponível.");
    movementQuantityInput.reportValidity();
    movementQuantityInput.addEventListener("input", () => movementQuantityInput.setCustomValidity(""), { once: true });
    return;
  }
  const previousQuantity = product.quantidade;
  const previousMovements = movements;
  product.quantidade = Number(product.quantidade) + (type === "entrada" ? amount : -amount);
  const note = document.querySelector("#movement-note").value.trim();
  movements = [makeMovement(product, type, amount, note), ...movements];
  if (!saveInventory()) {
    product.quantidade = previousQuantity;
    movements = previousMovements;
    return;
  }
  movementDialog.close();
  renderProducts();
  showStatus(`${type === "entrada" ? "Entrada" : "Saída"} de ${amount} unidade(s) registrada para ${product.nome}.`);
});

const backupFileInput = document.querySelector("#backup-file");
document.querySelector("#export-backup").addEventListener("click", () => {
  const backup = {
    app: "Espetinhos do Claudio",
    version: 1,
    exportedAt: new Date().toISOString(),
    products,
    movements
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
    if (backup.movements !== undefined && (!Array.isArray(backup.movements) || !backup.movements.every(isValidMovement))) {
      throw new Error("O backup contém movimentações inválidas. Nenhuma alteração foi feita.");
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
      if (!product.id || ids.has(product.id)) throw new Error("O backup possui identificadores de produto repetidos ou inválidos.");
      ids.add(product.id);
    }
    const importedMovements = (backup.movements || []).map(movement => ({
      id: movement.id ? String(movement.id) : newProductId(),
      productId: movement.productId === undefined ? "" : String(movement.productId),
      productName: movement.productName.trim(),
      type: movement.type,
      quantity: Number(movement.quantity),
      createdAt: movement.createdAt,
      note: typeof movement.note === "string" ? movement.note : ""
    })).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    if (!window.confirm(`Este arquivo tem ${imported.length} produto(s) e ${importedMovements.length} movimentação(ões). A importação vai substituir o estoque e o histórico atuais. Deseja continuar?`)) return;
    const previousProducts = products;
    const previousMovements = movements;
    products = imported;
    movements = importedMovements;
    if (!saveInventory()) {
      products = previousProducts;
      movements = previousMovements;
      return;
    }
    searchInput.value = "";
    renderProducts();
    showStatus(`Backup restaurado: ${products.length} produto(s) e ${movements.length} movimentação(ões).`);
  } catch (error) {
    showStatus(error instanceof SyntaxError ? "Não foi possível ler o arquivo. Escolha um backup JSON válido." : error.message, true);
  } finally {
    backupFileInput.value = "";
  }
});

function newProductId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeMovement(product, type, quantity, note = "") {
  return {
    id: newProductId(),
    productId: String(product.id),
    productName: product.nome,
    type,
    quantity: Number(quantity),
    createdAt: new Date().toISOString(),
    note: note.trim()
  };
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
