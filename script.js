const STORAGE_KEY = "espetinhos-claudio-produtos-v1";
const MOVEMENTS_KEY = "espetinhos-claudio-movimentacoes-v1";
const THEME_KEY = "espetinhos-claudio-tema";
const SIMPLE_MODE_KEY = "espetinhos-claudio-modo-simples";
const SUPPLIES_KEY = "espetinhos-claudio-insumos-v1";
const SUPPLY_MOVEMENTS_KEY = "espetinhos-claudio-insumos-mov-v1";
const SUPPLY_UNITS = { un: "un.", kg: "kg", g: "g", pacote: "pac.", litro: "L" };
const BACKUP_KEY = "espetinhos-claudio-ultimo-backup";

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
const appShell = document.querySelector("#app-shell");
const loginScreen = document.querySelector("#login-screen");
const loginForm = document.querySelector("#login-form");
const accessPassword = document.querySelector("#access-password");
const loginError = document.querySelector("#login-error");
const loginSubmit = document.querySelector("#login-submit");
const logoutButton = document.querySelector("#logout-button");
let products = loadProducts();
let movements = loadMovements();
let supplies = loadSupplies();
let supplyMovements = loadSupplyMovements();
let statusTimer;
let serverAvailable = false;
let isSaving = false;
let serverRevision = "";
let pendingCount = 0;

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

function isValidSupply(item) {
  return item && typeof item.nome === "string" && item.nome.trim().length > 0
    && Object.prototype.hasOwnProperty.call(SUPPLY_UNITS, item.unidade)
    && Number.isFinite(Number(item.minimo)) && Number(item.minimo) >= 0;
}

function isValidSupplyMovement(movement) {
  return movement && typeof movement.supplyName === "string"
    && ["entrada", "saida", "ajuste"].includes(movement.type)
    && Number.isFinite(Number(movement.quantity)) && Number(movement.quantity) > 0
    && Object.prototype.hasOwnProperty.call(SUPPLY_UNITS, movement.unidade)
    && typeof movement.createdAt === "string" && Number.isFinite(Date.parse(movement.createdAt));
}

function loadSupplies() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUPPLIES_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isValidSupply) : [];
  } catch (error) {
    console.error("Não foi possível ler os insumos salvos.", error);
    return [];
  }
}

function loadSupplyMovements() {
  try {
    const saved = JSON.parse(localStorage.getItem(SUPPLY_MOVEMENTS_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter(isValidSupplyMovement).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
  } catch (error) {
    console.error("Não foi possível ler o histórico de insumos.", error);
    return [];
  }
}

function findSupply(id) {
  return supplies.find(item => String(item.id) === String(id));
}

function supplyBalance(id) {
  return supplyMovements.reduce((total, movement) => {
    if (String(movement.supplyId) !== String(id)) return total;
    if (movement.type === "entrada") return total + Number(movement.quantity);
    if (movement.type === "saida") return total - Number(movement.quantity);
    return total;
  }, 0);
}

function supplyStock(item) {
  return Math.max(0, Math.round(supplyBalance(item.id) * 100) / 100);
}

function supplyNeedsRestock(item) {
  return supplyStock(item) <= Number(item.minimo);
}

function formatSupplyAmount(value, unit) {
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value));
  return `${number} ${SUPPLY_UNITS[unit] || "un."}`;
}

function cacheState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.products));
    localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(state.movements));
    localStorage.setItem(SUPPLIES_KEY, JSON.stringify(state.supplies || []));
    localStorage.setItem(SUPPLY_MOVEMENTS_KEY, JSON.stringify(state.supplyMovements || []));
  } catch (error) {
    console.warn("Não foi possível atualizar a cópia local do estoque.", error);
  }
}

async function putState(state) {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...state,
      supplies: state.supplies || supplies,
      supplyMovements: state.supplyMovements || supplyMovements,
      revision: serverRevision
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "O servidor recusou os dados.");
    error.status = response.status;
    throw error;
  }
  if (!data || !Array.isArray(data.products) || !Array.isArray(data.movements) || typeof data.revision !== "string") throw new Error("Resposta inválida do servidor.");
  serverRevision = data.revision;
  return data;
}

async function persistState() {
  if (!serverAvailable || isSaving) return false;
  const snapshot = { products: [...products], movements: [...movements], supplies: [...supplies], supplyMovements: [...supplyMovements] };
  isSaving = true;
  pendingCount += 1;
  if (pendingCount === 1) window.addEventListener("beforeunload", warnUnsaved);
  document.body.classList.add("saving-data");
  try {
    const saved = await putState(snapshot);
    serverRevision = saved.revision;
    cacheState(saved);
    return true;
  } catch (error) {
    console.error("Não foi possível salvar no servidor.", error);
    serverAvailable = false;
    if (error.status === 401) {
      appShell.hidden = true;
      loginScreen.hidden = false;
      loginError.textContent = "Sua sessão expirou. Entre novamente para continuar.";
    }
    document.body.classList.add("server-unavailable");
    document.querySelector(".sidebar-note p").textContent = "Modo de consulta: servidor indisponível.";
    const warning = document.querySelector("#connection-warning");
    warning.textContent = error.status === 409
      ? "O estoque foi alterado em outro acesso. Nenhuma alteração sua foi gravada; recarregue a página para buscar os dados mais recentes."
      : "A conexão com o servidor foi perdida e não foi possível confirmar o salvamento. Recarregue a página e confira os dados antes de tentar novamente.";
    warning.hidden = false;
    showStatus("Não foi possível salvar no servidor.", true);
    return false;
  } finally {
    isSaving = false;
    pendingCount = Math.max(0, pendingCount - 1);
    if (pendingCount === 0) window.removeEventListener("beforeunload", warnUnsaved);
    document.body.classList.remove("saving-data");
  }
}

function warnUnsaved(event) {
  event.preventDefault();
  event.returnValue = "As alterações ainda estão sendo salvas no servidor.";
  return event.returnValue;
}

function saveProducts() {
  return persistState();
}

function saveInventory() {
  return persistState();
}

function canMutate() {
  if (serverAvailable && !isSaving) return true;
  showStatus(serverAvailable ? "Aguarde o salvamento terminar." : "Sem conexão com o servidor. Recarregue a página.", true);
  return false;
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
  const unitsStat = document.querySelector("#stat-units");
  if (unitsStat) unitsStat.textContent = totalUnits;
  const valueStat = document.querySelector("#stat-value");
  if (valueStat) valueStat.textContent = formatMoney(stockValue);
  document.querySelector("#count-pill").textContent = products.length;
  document.querySelector("#nav-product-count").textContent = products.length;

  const lowStockProducts = products.filter(needsRestock);
  document.querySelector("#stat-low-count").textContent = lowStockProducts.length;
  document.querySelector("#low-stock-pill").textContent = lowStockProducts.length;
  const lowStockList = document.querySelector("#dashboard-low-stock");
  lowStockList.replaceChildren(...lowStockProducts.map(product => {
    const row = document.createElement("div");
    row.className = "low-stock-row";
    const name = document.createElement("strong");
    name.textContent = product.nome;
    const amount = document.createElement("span");
    const suggestion = suggestedPurchase(product);
    amount.textContent = `${product.quantidade} em estoque · mínimo ${product.minimo} · sugerido comprar ${suggestion}`;
    row.append(name, amount);
    return row;
  }));
  document.querySelector("#low-stock-empty").hidden = lowStockProducts.length > 0;
  document.querySelector("#restock-actions").hidden = lowStockProducts.length === 0;

  const weekOut = movements.reduce((total, movement) => {
    if (movement.type !== "saida") return total;
    return Date.parse(movement.createdAt) >= periodStart("7") ? total + Number(movement.quantity) : total;
  }, 0);
  document.querySelector("#stat-week-out").textContent = weekOut;
  const weekNote = document.querySelector("#stat-week-out-note");
  if (weekNote) weekNote.textContent = movements.some(movement => movement.type === "saida")
    ? "unidades vendidas ou retiradas"
    : "ainda sem saídas registradas";
}

function suggestedPurchase(product) {
  const minimum = Number(product.minimo) || 0;
  const quantity = Number(product.quantidade) || 0;
  if (minimum <= 0) return quantity === 0 ? 1 : 0;
  return Math.max(1, minimum * 2 - quantity);
}

function restockListText() {
  return products.filter(needsRestock)
    .map(product => `${suggestedPurchase(product)} un. - ${product.nome} (tem ${product.quantidade}, mínimo ${product.minimo})`)
    .join("\n");
}

document.querySelector("#copy-restock-list").addEventListener("click", async () => {
  const text = restockListText();
  if (!text) return showStatus("Nenhum produto precisa de reposição agora.", true);
  try {
    await navigator.clipboard.writeText(text);
    showStatus("Lista de compra copiada. Cole no WhatsApp ou nas notas.");
  } catch (error) {
    console.error("Não foi possível copiar a lista de compra.", error);
    showStatus("Não foi possível copiar automaticamente. Confira a lista na tela.", true);
  }
});

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
  const badgeBox = document.createElement("div");
  badgeBox.className = "stock-status";
  const statusLabel = document.createElement("span");
  statusLabel.className = "column-label";
  statusLabel.textContent = "Situação";
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

  const stockControls = document.createElement("div");
  stockControls.className = "stock-controls";
  const quantityLabel = document.createElement("span");
  quantityLabel.className = "column-label";
  quantityLabel.textContent = "Quantidade";
  const quantityValue = document.createElement("span");
  quantityValue.className = "quantity-value";
  quantityValue.textContent = `${quantity} un.`;
  stockControls.append(quantityLabel, quantityValue);

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

  badgeBox.append(statusLabel, badge);
  row.append(details, badgeBox, stockControls, actions);
  return row;
}

function needsRestock(product) {
  return Number(product.quantidade) <= (Number(product.minimo) || 0);
}

function sortProducts(list) {
  return [...list].sort((a, b) => Number(needsRestock(b)) - Number(needsRestock(a))
    || a.nome.localeCompare(b.nome, "pt-BR"));
}

function renderProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const filtered = products.filter(product => product.nome.toLocaleLowerCase("pt-BR").includes(query));
  const visible = sortProducts(filtered);
  productList.replaceChildren(...visible.map(createProductRow));
  productList.classList.add("product-list");
  emptyState.hidden = products.length > 0;
  let noResults = document.querySelector("#no-results");
  if (products.length > 0 && visible.length === 0) {
    if (!noResults) {
      noResults = document.createElement("p");
      noResults.id = "no-results";
      noResults.className = "empty-state";
      productList.after(noResults);
    }
    noResults.textContent = "Nenhum produto encontrado com esse nome.";
    noResults.hidden = false;
  } else if (noResults) {
    noResults.hidden = true;
  }
  updateSummary();
  renderMovements();
  renderReport();
  renderSupplies();
}

function periodStart(period) {
  const now = new Date();
  if (period === "7" || period === "30") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (Number(period) - 1));
    return start.getTime();
  }
  if (period === "mes") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return -Infinity;
}

function renderMovementSummary(filtered) {
  const summary = document.querySelector("#movement-summary");
  if (!summary) return;
  if (!movements.length) {
    summary.textContent = "O histórico começa a ser registrado a partir de agora.";
    return;
  }
  const totals = filtered.reduce((acc, movement) => {
    if (movement.type === "entrada") acc.entradas += Number(movement.quantity);
    if (movement.type === "saida") acc.saidas += Number(movement.quantity);
    acc.registros += 1;
    return acc;
  }, { entradas: 0, saidas: 0, registros: 0 });
  const parts = [`${totals.registros} registro(s) no filtro`, `${totals.entradas} un. de entrada`, `${totals.saidas} un. de saída`];
  const saldo = totals.entradas - totals.saidas;
  if (saldo !== 0) parts.push(`saldo ${saldo > 0 ? "+" : "−"}${Math.abs(saldo)} un.`);
  summary.textContent = `${parts.join(" · ")}.`;
}

function renderMovements() {
  const typeFilter = document.querySelector("#movement-filter").value;
  const periodFilter = document.querySelector("#movement-period-filter").value;
  const productFilter = document.querySelector("#movement-product-filter");
  const selectedProduct = productFilter.value || "todos";
  const productNames = [...new Set(movements.map(movement => movement.productName))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const productOptions = [new Option("Todos", "todos"), ...productNames.map(name => new Option(name, name))];
  productFilter.replaceChildren(...productOptions);
  if (productNames.includes(selectedProduct)) productFilter.value = selectedProduct;
  const selectedName = productFilter.value;
  const sorted = [...movements].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const periodFrom = periodStart(periodFilter);
  const filtered = sorted.filter(movement => (typeFilter === "todas" || movement.type === typeFilter)
    && (selectedName === "todos" || movement.productName === selectedName)
    && Date.parse(movement.createdAt) >= periodFrom);
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
  renderMovementSummary(filtered);
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
document.querySelector("#movement-period-filter").addEventListener("change", renderMovements);

function reportRows(period) {
  const from = periodStart(period);
  const totals = new Map();
  movements.forEach(movement => {
    if (movement.type !== "saida") return;
    if (Date.parse(movement.createdAt) < from) return;
    const key = movement.productName;
    totals.set(key, (totals.get(key) || 0) + Number(movement.quantity));
  });
  return [...totals.entries()]
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "pt-BR"));
}

function renderReport() {
  const list = document.querySelector("#report-list");
  const empty = document.querySelector("#report-empty");
  if (!list || !empty) return;
  const period = document.querySelector("#report-period").value;
  const rows = reportRows(period);
  const total = rows.reduce((acc, row) => acc + row.quantity, 0);
  const biggest = rows[0]?.quantity || 0;
  list.replaceChildren(...rows.map(row => {
    const element = document.createElement("div");
    element.className = "report-row";
    const head = document.createElement("div");
    head.className = "report-row-head";
    const name = document.createElement("strong");
    name.textContent = row.name;
    const value = document.createElement("span");
    value.textContent = `${row.quantity} un.`;
    head.append(name, value);
    const bar = document.createElement("div");
    bar.className = "report-bar";
    const fill = document.createElement("div");
    fill.className = "report-bar-fill";
    fill.style.width = `${biggest ? Math.max(6, Math.round((row.quantity / biggest) * 100)) : 0}%`;
    bar.append(fill);
    const meta = document.createElement("span");
    meta.className = "report-meta";
    const share = total ? Math.round((row.quantity / total) * 100) : 0;
    meta.textContent = `${share}% das saídas do período`;
    element.append(head, bar, meta);
    return element;
  }));
  empty.hidden = rows.length > 0;
  const note = document.querySelector("#report-note");
  if (note) note.textContent = rows.length
    ? `${rows.length} produto(s) · ${total} unidade(s) de saída no período.`
    : "Ajuda a decidir o que comprar mais.";
}

document.querySelector("#report-period").addEventListener("change", renderReport);

document.querySelector("#copy-report").addEventListener("click", async () => {
  const period = document.querySelector("#report-period").value;
  const rows = reportRows(period);
  if (!rows.length) return showStatus("Sem saídas registradas no período escolhido.", true);
  const labels = { "7": "últimos 7 dias", "30": "últimos 30 dias", mes: "mês atual", todos: "todo o histórico" };
  const text = [`Saídas — ${labels[period] || labels["30"]}`, ...rows.map(row => `${row.quantity} un. - ${row.name}`)].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    showStatus("Relatório copiado. Cole onde quiser.");
  } catch (error) {
    console.error("Não foi possível copiar o relatório.", error);
    showStatus("Não foi possível copiar automaticamente.", true);
  }
});

async function removeProduct(id) {
  if (!canMutate()) return;
  const product = products.find(item => item.id === id);
  if (!product) return;
  const previousProducts = products;
  products = products.filter(item => item.id !== id);
  if (await saveProducts()) {
    renderProducts();
    showStatus(`${product.nome} foi excluído.${backupReminder()}`);
  } else {
    products = previousProducts;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!canMutate() || !form.reportValidity()) return;
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
  if (await saveInventory()) {
    renderProducts();
    form.reset();
    searchInput.value = "";
    nomeInput.focus();
    showStatus(`${product.nome} cadastrado.${backupReminder()}`);
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
editForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!canMutate() || !editForm.reportValidity()) return;
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
  const saved = await (quantityDifference === 0 ? saveProducts() : saveInventory());
  if (!saved) {
    Object.assign(product, previous);
    movements = previousMovements;
    return;
  }
  editDialog.close();
  renderProducts();
  showStatus(quantityDifference === 0 ? `${product.nome} atualizado.` : `${product.nome} atualizado e o ajuste entrou no histórico.`);
});

const movementDialog = document.querySelector("#movement-dialog");
const movementForm = document.querySelector("#movement-form");
const movementQuantityInput = document.querySelector("#movement-quantity");
const simpleModeToggle = document.querySelector("#simple-mode");

function applySimpleMode(enabled) {
  document.body.classList.toggle("simple-mode", enabled);
  if (simpleModeToggle) simpleModeToggle.checked = enabled;
  try { localStorage.setItem(SIMPLE_MODE_KEY, enabled ? "1" : "0"); } catch (_) { /* A preferência é opcional. */ }
}

if (simpleModeToggle) {
  let initialSimpleMode = false;
  try { initialSimpleMode = localStorage.getItem(SIMPLE_MODE_KEY) === "1"; } catch (_) { /* Usa o padrão normal. */ }
  applySimpleMode(initialSimpleMode);
  simpleModeToggle.addEventListener("change", () => applySimpleMode(simpleModeToggle.checked));
}

const movementAmountPreview = document.querySelector("#movement-amount-preview");

function updateMovementPreview() {
  const productId = document.querySelector("#movement-product-id").value;
  const type = document.querySelector("#movement-type").value;
  const product = products.find(item => String(item.id) === productId);
  const amount = Number(movementQuantityInput.value);
  if (!product) return;
  const current = Number(product.quantidade);
  const next = Number.isInteger(amount) && amount > 0
    ? (type === "entrada" ? current + amount : current - amount)
    : current;
  movementAmountPreview.textContent = next < 0
    ? "Quantidade maior que o estoque disponível."
    : `Depois de salvar: ${current} → ${Math.max(0, next)} un.`;
  movementAmountPreview.classList.toggle("invalid", next < 0);
}

movementQuantityInput.addEventListener("input", updateMovementPreview);
function openMovementDialog(product, type) {
  document.querySelector("#movement-product-id").value = product.id;
  document.querySelector("#movement-type").value = type;
  document.querySelector("#movement-dialog-title").textContent = type === "entrada" ? "Registrar entrada" : "Registrar saída";
  document.querySelector("#movement-submit").textContent = type === "entrada" ? "Confirmar entrada" : "Confirmar saída";
  document.querySelector("#movement-product-info").textContent = `${product.nome} · ${product.quantidade} unidade(s) em estoque`;
  movementQuantityInput.value = "";
  syncMovementDisplay();
  if (type === "saida") movementQuantityInput.max = product.quantidade;
  else movementQuantityInput.removeAttribute("max");
  document.querySelector("#movement-note").value = "";
  updateMovementPreview();
  movementDialog.showModal();
  movementQuantityInput.focus();
}

const movementDisplay = document.querySelector("#movement-display");

function syncMovementDisplay() {
  if (movementDisplay) movementDisplay.textContent = movementQuantityInput.value || "0";
}

function pressKeypadKey(key) {
  const current = movementQuantityInput.value.replace(/\D/g, "");
  let next = current;
  if (key === "clear") next = "";
  else if (key === "back") next = current.slice(0, -1);
  else if (current === "0") next = key;
  else if (current.length < 6) next = `${current}${key}`;
  movementQuantityInput.value = next;
  movementQuantityInput.dispatchEvent(new Event("input"));
}

document.querySelectorAll("[data-key]").forEach(button => button.addEventListener("click", () => {
  pressKeypadKey(button.dataset.key);
}));

movementQuantityInput.addEventListener("input", syncMovementDisplay);

document.querySelector("#cancel-movement").addEventListener("click", () => movementDialog.close());
document.querySelector("#close-movement").addEventListener("click", () => movementDialog.close());
movementForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!canMutate() || !movementForm.reportValidity()) return;
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
  if (!await saveInventory()) {
    product.quantidade = previousQuantity;
    movements = previousMovements;
    return;
  }
  movementDialog.close();
  renderProducts();
  showStatus(`${type === "entrada" ? "Entrada" : "Saída"} de ${amount} un. salva em ${product.nome}.${backupReminder()}`);
});

/* ---------- Insumos ---------- */
const supplyList = document.querySelector("#lista-insumos");
const supplySearch = document.querySelector("#busca-insumos");
const supplyDialog = document.querySelector("#supply-dialog");
const supplyForm = document.querySelector("#supply-form");
const supplyMovementDialog = document.querySelector("#supply-movement-dialog");
const supplyMovementForm = document.querySelector("#supply-movement-form");
const supplyQuantityInput = document.querySelector("#supply-movement-quantity");
const supplyDisplay = document.querySelector("#supply-display");
const supplyDisplayUnit = document.querySelector("#supply-display-unit");
const supplyPreview = document.querySelector("#supply-movement-preview");
let supplyRawAmount = "";

function supplyBadge(item) {
  const badge = document.createElement("span");
  const stock = supplyStock(item);
  const minimum = Number(item.minimo);
  badge.className = "stock-badge";
  if (stock <= 0) {
    badge.classList.add("empty");
    badge.textContent = "● Acabou";
  } else if (stock <= minimum) {
    badge.classList.add("low");
    badge.textContent = "● Está acabando";
  } else {
    badge.textContent = "● Tem";
  }
  return badge;
}

function createSupplyRow(item) {
  const row = document.createElement("article");
  row.className = "product-row supply-row";

  const details = document.createElement("div");
  const name = document.createElement("p");
  name.className = "product-name";
  name.textContent = item.nome;
  const meta = document.createElement("span");
  meta.className = "product-price";
  const minimum = Number(item.minimo);
  meta.textContent = `Avisar quando chegar em ${formatSupplyAmount(minimum, item.unidade)}`;
  details.append(name, meta);

  const amountBox = document.createElement("div");
  amountBox.className = "supply-amount-box";
  const amountLabel = document.createElement("span");
  amountLabel.className = "column-label";
  amountLabel.textContent = "Tem";
  const amount = document.createElement("span");
  amount.className = "supply-amount";
  amount.textContent = formatSupplyAmount(supplyStock(item), item.unidade);
  amountBox.append(amountLabel, amount);

  const actions = document.createElement("div");
  actions.className = "product-actions";
  const movementButtons = document.createElement("div");
  movementButtons.className = "movement-buttons";
  const entryButton = document.createElement("button");
  entryButton.type = "button";
  entryButton.className = "movement-trigger entry-trigger";
  entryButton.textContent = "+ Entrada";
  entryButton.addEventListener("click", () => openSupplyMovement(item, "entrada"));
  const exitButton = document.createElement("button");
  exitButton.type = "button";
  exitButton.className = "movement-trigger exit-trigger";
  exitButton.textContent = "− Saída";
  exitButton.disabled = supplyStock(item) <= 0;
  exitButton.addEventListener("click", () => openSupplyMovement(item, "saida"));
  movementButtons.append(entryButton, exitButton);
  const recordActions = document.createElement("div");
  recordActions.className = "record-actions";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "edit-button";
  editButton.textContent = "Editar";
  editButton.addEventListener("click", () => openSupplyDialog(item));
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "delete-button";
  removeButton.textContent = "Excluir";
  removeButton.addEventListener("click", () => removeSupply(item));
  recordActions.append(editButton, removeButton);
  actions.append(movementButtons, recordActions);

  const statusBox = document.createElement("div");
  statusBox.className = "stock-status";
  const statusLabel = document.createElement("span");
  statusLabel.className = "column-label";
  statusLabel.textContent = "Situação";
  statusBox.append(statusLabel, supplyBadge(item));
  row.append(details, statusBox, amountBox, actions);
  return row;
}

function renderSupplies() {
  if (!supplyList) return;
  const query = supplySearch.value.trim().toLocaleLowerCase("pt-BR");
  const filtered = supplies.filter(item => item.nome.toLocaleLowerCase("pt-BR").includes(query));
  const ordered = [...filtered].sort((a, b) => Number(supplyNeedsRestock(b)) - Number(supplyNeedsRestock(a))
    || a.nome.localeCompare(b.nome, "pt-BR"));
  supplyList.replaceChildren(...ordered.map(createSupplyRow));
  supplyList.classList.add("product-list");
  const empty = document.querySelector("#supply-empty-state");
  const noResults = document.querySelector("#supply-no-results");
  if (empty) empty.hidden = supplies.length > 0;
  const footer = document.querySelector(".supply-footer");
  if (footer) footer.hidden = supplies.length === 0;
  if (supplies.length > 0 && ordered.length === 0) {
    if (noResults) noResults.hidden = false;
    else {
      const message = document.createElement("p");
      message.id = "supply-no-results";
      message.className = "empty-state";
      message.textContent = "Nenhum insumo encontrado com esse nome.";
      supplyList.after(message);
    }
  } else if (noResults) {
    noResults.hidden = true;
  }

  document.querySelector("#supply-count-pill").textContent = supplies.length;
  document.querySelector("#nav-supply-count").textContent = supplies.length;

  const missing = supplies.filter(supplyNeedsRestock)
    .sort((a, b) => supplyStock(a) - supplyStock(b) || a.nome.localeCompare(b.nome, "pt-BR"));
  const alertPanel = document.querySelector("#supplies-alert");
  const alertList = document.querySelector("#supplies-alert-list");
  document.querySelector("#supplies-alert-pill").textContent = missing.length;
  if (alertPanel) alertPanel.hidden = missing.length === 0;
  if (alertList) {
    alertList.replaceChildren(...missing.map(item => {
      const row = document.createElement("div");
      row.className = "low-stock-row";
      const name = document.createElement("strong");
      name.textContent = item.nome;
      const amount = document.createElement("span");
      amount.textContent = `${formatSupplyAmount(supplyStock(item), item.unidade)} · aviso em ${formatSupplyAmount(item.minimo, item.unidade)}`;
      row.append(name, amount);
      return row;
    }));
  }
}

function openSupplyDialog(item = null) {
  document.querySelector("#supply-dialog-title").textContent = item ? "Editar insumo" : "Cadastrar insumo";
  document.querySelector("#supply-id").value = item ? item.id : "";
  document.querySelector("#supply-name").value = item ? item.nome : "";
  document.querySelector("#supply-unit").value = item ? item.unidade : "un";
  document.querySelector("#supply-minimum").value = item ? item.minimo : "";
  supplyDialog.showModal();
  document.querySelector("#supply-name").focus();
}

document.querySelector("#new-supply").addEventListener("click", () => openSupplyDialog());
document.querySelector("#new-supply-footer").addEventListener("click", () => openSupplyDialog());
document.querySelector("#close-supply").addEventListener("click", () => supplyDialog.close());
document.querySelector("#cancel-supply").addEventListener("click", () => supplyDialog.close());
if (supplySearch) supplySearch.addEventListener("input", renderSupplies);

supplyForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!canMutate() || !supplyForm.reportValidity()) return;
  const id = document.querySelector("#supply-id").value;
  const nome = document.querySelector("#supply-name").value.trim();
  const unidade = document.querySelector("#supply-unit").value;
  const minimo = Number(document.querySelector("#supply-minimum").value);
  if (!nome || !Object.prototype.hasOwnProperty.call(SUPPLY_UNITS, unidade) || !Number.isFinite(minimo) || minimo < 0) {
    showStatus("Confira o nome, a medida e o aviso mínimo.", true);
    return;
  }
  const previousSupplies = supplies;
  if (id) {
    supplies = supplies.map(item => String(item.id) === id ? { ...item, nome, unidade } : item);
    const target = findSupply(id);
    if (target) target.minimo = minimo;
    if (!await saveInventory()) { supplies = previousSupplies; return; }
    supplyDialog.close();
    renderSupplies();
    showStatus(`${nome} atualizado.`);
  } else {
    supplies = [...supplies, { id: newProductId(), nome, unidade, minimo }];
    if (!await saveInventory()) { supplies = previousSupplies; return; }
    supplyDialog.close();
    renderSupplies();
    showStatus(`${nome} cadastrado.${backupReminder()}`);
  }
});

async function removeSupply(item) {
  if (!canMutate()) return;
  if (!window.confirm(`Excluir ${item.nome}? O histórico de movimentações dele continua guardado.`)) return;
  const previousSupplies = supplies;
  supplies = supplies.filter(entry => String(entry.id) !== String(item.id));
  if (!await saveInventory()) { supplies = previousSupplies; return; }
  renderSupplies();
  showStatus(`${item.nome} excluído.`);
}

function updateSupplyPreview(type) {
  const id = document.querySelector("#supply-movement-id").value;
  const item = findSupply(id);
  if (!item) return;
  const current = supplyStock(item);
  const amount = Number(supplyRawAmount.replace(",", "."));
  const next = Number.isFinite(amount) && amount > 0
    ? (type === "entrada" ? current + amount : current - amount)
    : current;
  supplyPreview.textContent = next < 0
    ? "Quantidade maior do que tem no estoque."
    : `Depois de salvar: ${formatSupplyAmount(current, item.unidade)} → ${formatSupplyAmount(Math.max(0, next), item.unidade)}`;
  supplyPreview.classList.toggle("invalid", next < 0);
}

function openSupplyMovement(item, type) {
  document.querySelector("#supply-movement-id").value = item.id;
  document.querySelector("#supply-movement-type").value = type;
  document.querySelector("#supply-movement-title").textContent = type === "entrada" ? "Entrada de insumo" : "Saída de insumo";
  document.querySelector("#supply-movement-submit").textContent = type === "entrada" ? "Confirmar entrada" : "Confirmar saída";
  document.querySelector("#supply-movement-info").textContent = `${item.nome} · ${formatSupplyAmount(supplyStock(item), item.unidade)} em estoque`;
  document.querySelector("#supply-movement-note").value = "";
  supplyDisplayUnit.textContent = SUPPLY_UNITS[item.unidade];
  supplyRawAmount = "";
  supplyQuantityInput.value = "";
  supplyDisplay.textContent = "0";
  updateSupplyPreview(type);
  supplyMovementDialog.showModal();
}

document.querySelector("#supply-keypad").addEventListener("click", event => {
  const button = event.target.closest("[data-key]");
  if (!button) return;
  const key = button.dataset.key;
  if (key === "back") supplyRawAmount = supplyRawAmount.slice(0, -1);
  else if (key === "comma") {
    if (!supplyRawAmount.includes(",")) supplyRawAmount = supplyRawAmount === "" ? "0," : `${supplyRawAmount},`;
  } else if (supplyRawAmount.replace(",", "").length < 6) {
    supplyRawAmount = supplyRawAmount === "0" && key !== "0" ? key : `${supplyRawAmount}${key}`;
  }
  supplyDisplay.textContent = supplyRawAmount || "0";
  supplyQuantityInput.value = supplyRawAmount.replace(",", ".");
  updateSupplyPreview(document.querySelector("#supply-movement-type").value);
});

document.querySelector("#close-supply-movement").addEventListener("click", () => supplyMovementDialog.close());
document.querySelector("#cancel-supply-movement").addEventListener("click", () => supplyMovementDialog.close());

supplyMovementForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!canMutate() || !supplyMovementForm.reportValidity()) return;
  const id = document.querySelector("#supply-movement-id").value;
  const type = document.querySelector("#supply-movement-type").value;
  const item = findSupply(id);
  const amount = Math.round((Number(supplyRawAmount.replace(",", ".")) || Number(supplyQuantityInput.value)) * 100) / 100;
  if (!item || !Number.isFinite(amount) || amount <= 0) {
    showStatus("Digite a quantidade.", true);
    return;
  }
  if (type === "saida" && amount > supplyStock(item) + 0.001) {
    showStatus("A saída é maior do que o estoque deste insumo.", true);
    return;
  }
  const note = document.querySelector("#supply-movement-note").value.trim();
  const previousMovements = supplyMovements;
  supplyMovements = [{
    id: newProductId(),
    supplyId: String(item.id),
    supplyName: item.nome,
    type,
    quantity: amount,
    unidade: item.unidade,
    createdAt: new Date().toISOString(),
    note
  }, ...supplyMovements];
  if (!await saveInventory()) {
    supplyMovements = previousMovements;
    return;
  }
  supplyMovementDialog.close();
  renderSupplies();
  showStatus(`${type === "entrada" ? "Entrada" : "Saída"} de ${formatSupplyAmount(amount, item.unidade)} salva em ${item.nome}.${backupReminder()}`);
});

const backupFileInput = document.querySelector("#backup-file");
document.querySelector("#export-backup").addEventListener("click", () => {
  const backup = {
    app: "Espetinhos do Claudio",
    version: 1,
    exportedAt: new Date().toISOString(),
    products,
    movements,
    supplies,
    supplyMovements
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
  try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch (_) { /* A data é só um lembrete. */ }
  renderBackupMeta();
  showStatus("Backup exportado. Guarde o arquivo em um local seguro.");
});

function lastBackupDate() {
  try {
    const saved = localStorage.getItem(BACKUP_KEY);
    const date = saved ? new Date(saved) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  } catch (_) {
    return null;
  }
}

function renderBackupMeta() {
  const meta = document.querySelector("#backup-meta");
  if (!meta) return;
  const date = lastBackupDate();
  meta.textContent = date
    ? `Último backup baixado neste navegador em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)}.`
    : "Nenhum backup baixado neste navegador ainda.";
}

function backupReminder() {
  const date = lastBackupDate();
  if (!products.length && !movements.length) return "";
  if (!date) return " Guarde também um backup: use Importações para baixar uma cópia.";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  return days >= 7 ? ` Já se passaram ${days} dias desde o último backup; vale baixar um novo em Importações.` : "";
}

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
    let importedSupplies = [];
    let importedSupplyMovements = [];
    if (backup.supplies !== undefined) {
      if (!Array.isArray(backup.supplies) || !backup.supplies.every(isValidSupply)) {
        throw new Error("O backup contém insumos inválidos. Nenhuma alteração foi feita.");
      }
      importedSupplies = backup.supplies.map(item => ({
        id: item.id === undefined || item.id === null ? newProductId() : String(item.id),
        nome: item.nome.trim(),
        unidade: item.unidade,
        minimo: Number(item.minimo)
      }));
    }
    if (backup.supplyMovements !== undefined) {
      if (!Array.isArray(backup.supplyMovements) || !backup.supplyMovements.every(isValidSupplyMovement)) {
        throw new Error("O backup contém movimentações de insumos inválidas. Nenhuma alteração foi feita.");
      }
      importedSupplyMovements = backup.supplyMovements.map(movement => ({
        id: movement.id ? String(movement.id) : newProductId(),
        supplyId: movement.supplyId === undefined ? "" : String(movement.supplyId),
        supplyName: movement.supplyName.trim(),
        type: movement.type,
        quantity: Number(movement.quantity),
        unidade: movement.unidade,
        createdAt: movement.createdAt,
        note: typeof movement.note === "string" ? movement.note : ""
      })).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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
    if (!canMutate()) return;
    const previousProducts = products;
    const previousMovements = movements;
    const previousSupplies = supplies;
    const previousSupplyMovements = supplyMovements;
    products = imported;
    movements = importedMovements;
    supplies = importedSupplies;
    supplyMovements = importedSupplyMovements;
    if (!await saveInventory()) {
      products = previousProducts;
      movements = previousMovements;
      supplies = previousSupplies;
      supplyMovements = previousSupplyMovements;
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


const validViews = new Set(["inicio", "estoque", "insumos", "importacoes", "cadastro"]);
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
renderBackupMeta();

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

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  loginError.textContent = "";
  if (!loginForm.reportValidity()) return;
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Verificando…";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: accessPassword.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
    accessPassword.value = "";
    loginScreen.hidden = true;
    appShell.hidden = false;
    await initializeApp();
  } catch (error) {
    loginError.textContent = error.message || "Não foi possível conectar ao servidor.";
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Entrar no estoque";
  }
});

logoutButton.addEventListener("click", async () => {
  if (isSaving) {
    showStatus("Aguarde salvar antes de sair.", true);
    return;
  }
  if (products.length && !lastBackupDate() && !window.confirm("Você ainda não baixou nenhum backup neste navegador. Sair agora não apaga os dados salvos no servidor. Deseja sair mesmo assim?")) return;
  logoutButton.disabled = true;
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
    serverAvailable = false;
    appShell.hidden = true;
    loginScreen.hidden = false;
    loginError.textContent = "Você saiu do estoque.";
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    logoutButton.disabled = false;
  }
});

async function initializeApp() {
  const main = document.querySelector(".main-content");
  const loading = document.querySelector("#app-loading");
  const warning = document.querySelector("#connection-warning");
  document.body.classList.add("app-initializing");
  loading.hidden = false;
  try {
    const sessionResponse = await fetch("/api/session", { cache: "no-store" });
    if (!sessionResponse.ok) throw new Error("Não foi possível verificar a sessão.");
    const session = await sessionResponse.json();
    if (!session.authenticated) {
      appShell.hidden = true;
      loginScreen.hidden = false;
      logoutButton.hidden = true;
      loginError.textContent = "";
      return;
    }
    appShell.hidden = false;
    loginScreen.hidden = true;
    logoutButton.hidden = !session.loginRequired;

    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("O servidor não respondeu corretamente.");
    let remoteState = await response.json();
    if (!remoteState || !Array.isArray(remoteState.products) || !Array.isArray(remoteState.movements)) {
      throw new Error("O servidor enviou dados em um formato inesperado.");
    }

    if (typeof remoteState.revision !== "string") throw new Error("O servidor não enviou a versão dos dados.");
    serverRevision = remoteState.revision;
    let migrated = false;
    const localState = { products: loadProducts(), movements: loadMovements(), supplies: loadSupplies(), supplyMovements: loadSupplyMovements() };
    if (remoteState.products.length === 0 && remoteState.movements.length === 0
      && (localState.products.length > 0 || localState.movements.length > 0)) {
      remoteState = await putState(localState);
      migrated = true;
    }
    const remoteSupplies = Array.isArray(remoteState.supplies) ? remoteState.supplies : [];
    const remoteSupplyMovements = Array.isArray(remoteState.supplyMovements) ? remoteState.supplyMovements : [];
    if (remoteSupplies.length === 0 && remoteSupplyMovements.length === 0
      && (localState.supplies.length > 0 || localState.supplyMovements.length > 0)) {
      remoteState = await putState({ ...remoteState, supplies: localState.supplies, supplyMovements: localState.supplyMovements });
      migrated = true;
    }
    products = remoteState.products.filter(isValidProduct);
    movements = remoteState.movements.filter(isValidMovement);
    supplies = (remoteState.supplies || []).filter(isValidSupply);
    supplyMovements = (remoteState.supplyMovements || []).filter(isValidSupplyMovement);
    serverAvailable = true;
    document.body.classList.remove("server-unavailable");
    warning.hidden = true;
    document.querySelector(".sidebar-note p").textContent = "Estoque salvo no servidor desta aplicação.";
    cacheState({ products, movements, supplies, supplyMovements });
    showStatus(migrated ? "Os dados deste navegador foram transferidos para o servidor." : "Estoque carregado do servidor.");
  } catch (error) {
    console.error("Não foi possível conectar ao servidor do estoque.", error);
    appShell.hidden = false;
    loginScreen.hidden = true;
    logoutButton.hidden = true;
    products = loadProducts();
    movements = loadMovements();
    supplies = loadSupplies();
    supplyMovements = loadSupplyMovements();
    serverAvailable = false;
    document.body.classList.add("server-unavailable");
    document.querySelector(".sidebar-note p").textContent = "Modo de consulta: servidor indisponível.";
    warning.textContent = "Servidor indisponível. Exibindo a última cópia local em modo de consulta; alterações não serão salvas. Inicie o servidor e recarregue a página.";
    warning.hidden = false;
    showStatus("Não foi possível conectar ao servidor.", true);
  } finally {
    renderProducts();
    loading.hidden = true;
    main.setAttribute("aria-busy", "false");
    document.body.classList.remove("app-initializing");
  }
}

document.querySelector("#today").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
initializeApp();
