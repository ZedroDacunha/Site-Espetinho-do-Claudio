// Testa o caminho do PostgreSQL usando um banco em memória (pg-mem).
// Roda apenas se pg-mem estiver instalado (dependência de desenvolvimento opcional).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

let pgmem;
try {
  pgmem = require("pg-mem");
} catch (_) {
  pgmem = null;
}

const { createApp, normalizeState } = require("./servidor");

async function startApp(t, options) {
  const instance = createApp(options);
  await instance.ready;
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await instance.pool?.end().catch(() => {});
  });
  return { instance, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test("normaliza insumos e mantém compatibilidade com estados antigos", () => {
  const legacy = normalizeState({
    products: [{ id: "p1", nome: "Espetinho", preco: 5, quantidade: 3, minimo: 1 }],
    movements: []
  });
  assert.deepEqual(legacy.supplies, []);
  assert.deepEqual(legacy.supplyMovements, []);

  const withSupplies = normalizeState({
    products: [],
    movements: [],
    supplies: [{ id: "s1", nome: "Carne", unidade: "kg", minimo: 5 }],
    supplyMovements: [{
      id: "sm1", supplyId: "s1", supplyName: "Carne", type: "entrada",
      quantity: 12.5, unidade: "kg", createdAt: "2026-11-10T12:00:00.000Z", note: "mercado"
    }]
  });
  assert.equal(withSupplies.supplies[0].unidade, "kg");
  assert.equal(withSupplies.supplies[0].minimo, 5);
  assert.equal(withSupplies.supplyMovements[0].quantity, 12.5);

  assert.throws(() => normalizeState({
    products: [], movements: [],
    supplies: [{ id: "s2", nome: "Palito", unidade: "caixa", minimo: 1 }]
  }), /Unidade inválida/);
});

test("inicializa o Postgres (tabelas de estoque e insumos) e lê o estado", { skip: pgmem ? false : "pg-mem não instalado" }, async t => {
  const db = pgmem.newDb();
  const { Pool } = db.adapters.createPg();
  const pgPath = require.resolve("pg");
  const realPgModule = require.cache[pgPath];
  require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: { Pool } };
  t.after(() => { require.cache[pgPath] = realPgModule; });

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "claudio-pg-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const instance = createApp({
    dataFile: path.join(directory, "state.json"),
    databaseUrl: "postgresql://usuario:senha@127.0.0.1:5432/estoque"
  });
  await instance.ready;
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await instance.pool?.end().catch(() => {});
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const initial = await fetch(`${baseUrl}/api/state`).then(response => response.json());
  assert.deepEqual(initial.supplies, []);
  assert.deepEqual(initial.supplyMovements, []);
  assert.equal(typeof initial.revision, "string");

  const saved = await fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      products: [{ id: "p1", nome: "Espetinho de frango", preco: 6.5, quantidade: 10, minimo: 2 }],
      movements: [],
      supplies: [{ id: "s1", nome: "Carne", unidade: "kg", minimo: 5 }],
      supplyMovements: [{
        id: "sm1", supplyId: "s1", supplyName: "Carne", type: "entrada",
        quantity: 12.5, unidade: "kg", createdAt: new Date().toISOString(), note: "compra"
      }],
      revision: initial.revision
    })
  });
  assert.equal(saved.status, 200, await saved.text());

  const reloaded = await fetch(`${baseUrl}/api/state`).then(response => response.json());
  assert.equal(reloaded.supplies.length, 1);
  assert.equal(reloaded.supplies[0].nome, "Carne");
  assert.equal(reloaded.supplies[0].unidade, "kg");
  assert.equal(reloaded.supplies[0].minimo, 5);
  assert.equal(reloaded.supplyMovements.length, 1);
  assert.equal(reloaded.supplyMovements[0].quantity, 12.5);
  assert.equal(reloaded.products.length, 1);
});

test("startApp devolve health e estado com insumos no modo arquivo", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "claudio-file-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { baseUrl } = await startApp(t, { dataFile: path.join(directory, "state.json") });
  const health = await fetch(`${baseUrl}/api/health`).then(response => response.json());
  assert.deepEqual(health, { ok: true });
  const state = await fetch(`${baseUrl}/api/state`).then(response => response.json());
  assert.ok(Array.isArray(state.supplies));
  assert.ok(Array.isArray(state.supplyMovements));
});
