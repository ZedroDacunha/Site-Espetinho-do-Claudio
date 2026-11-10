const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createApp } = require("./servidor");

async function launch(dataFile, options = {}) {
  const instance = createApp({ dataFile, ...options });
  await instance.ready;
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function close(server) {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test("serve the site and persist stock and movement history across server restarts", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "claudio-stock-"));
  const dataFile = path.join(directory, "state.json");
  let instance;
  let secondInstance;
  t.after(async () => {
    if (instance) await close(instance.server);
    if (secondInstance) await close(secondInstance.server);
    await fs.rm(directory, { recursive: true, force: true });
  });

  instance = await launch(dataFile);
  const homepage = await fetch(instance.baseUrl);
  assert.equal(homepage.status, 200);
  assert.equal(homepage.headers.get("x-frame-options"), "DENY");
  assert.match(await homepage.text(), /Espetinhos/);

  const empty = await fetch(`${instance.baseUrl}/api/state`).then(response => response.json());
  assert.deepEqual(empty.products, []);
  assert.deepEqual(empty.movements, []);
  assert.equal(typeof empty.revision, "string");

  const data = {
    products: [{ id: "prod-1", nome: "Frango", preco: 2.5, quantidade: 7, minimo: 2 }],
    movements: [{ id: "move-1", productId: "prod-1", productName: "Frango", type: "entrada", quantity: 7, createdAt: "2026-11-09T12:00:00.000Z", note: "Estoque inicial" }]
  };
  const saved = await fetch(`${instance.baseUrl}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...data, revision: empty.revision })
  });
  assert.equal(saved.status, 200);
  const savedState = await saved.json();
  // O servidor devolve a foto sempre como string (vazia quando não há imagem).
  assert.deepEqual(savedState.products, data.products.map(product => ({ ...product, foto: "" })));
  assert.deepEqual(savedState.movements, data.movements);
  assert.notEqual(savedState.revision, empty.revision);

  const staleWrite = await fetch(`${instance.baseUrl}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ products: [{ ...data.products[0], quantidade: 99 }], movements: [], revision: empty.revision })
  });
  assert.equal(staleWrite.status, 409);

  const invalid = await fetch(`${instance.baseUrl}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ products: [{ ...data.products[0], quantidade: -1 }], movements: [], revision: savedState.revision })
  });
  assert.equal(invalid.status, 400);
  await close(instance.server);
  instance = null;

  secondInstance = await launch(dataFile);
  const restored = await fetch(`${secondInstance.baseUrl}/api/state`).then(response => response.json());
  assert.deepEqual(restored.products, data.products.map(product => ({ ...product, foto: "" })));
  assert.deepEqual(restored.movements, data.movements);
});

test("protect inventory API with the shared password session", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "claudio-auth-"));
  const instance = await launch(path.join(directory, "state.json"), {
    appPassword: "private-test-password",
    sessionSecret: "test-session-secret-that-is-long-enough-1234567890"
  });
  t.after(async () => {
    await close(instance.server);
    await fs.rm(directory, { recursive: true, force: true });
  });

  const session = await fetch(`${instance.baseUrl}/api/session`).then(response => response.json());
  assert.deepEqual(session, { authenticated: false, loginRequired: true });
  const blocked = await fetch(`${instance.baseUrl}/api/state`);
  assert.equal(blocked.status, 401);

  const denied = await fetch(`${instance.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong" })
  });
  assert.equal(denied.status, 401);

  const login = await fetch(`${instance.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "private-test-password" })
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const allowed = await fetch(`${instance.baseUrl}/api/state`, { headers: { cookie } });
  assert.equal(allowed.status, 200);

  const logout = await fetch(`${instance.baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie } });
  assert.equal(logout.status, 200);
  const blockedAgain = await fetch(`${instance.baseUrl}/api/state`);
  assert.equal(blockedAgain.status, 401);
});

test("lembrar deste aparelho mantém a sessão por mais tempo", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "claudio-remember-"));
  const instance = await launch(path.join(directory, "state.json"), {
    appPassword: "private-test-password",
    sessionSecret: "test-session-secret-that-is-long-enough-1234567890"
  });
  t.after(async () => {
    await close(instance.server);
    await fs.rm(directory, { recursive: true, force: true });
  });

  const login = (remember) => fetch(`${instance.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "private-test-password", remember })
  });

  const normalCookie = (await login(false)).headers.get("set-cookie");
  assert.match(normalCookie, /Max-Age=604800/);
  assert.doesNotMatch(normalCookie, /Max-Age=15552000/);

  const remembered = await login(true);
  assert.equal(remembered.status, 200);
  const cookie = remembered.headers.get("set-cookie");
  assert.match(cookie, /Max-Age=15552000/);
  assert.match(cookie, /HttpOnly/);
  assert.deepEqual(await remembered.json(), { authenticated: true, remember: true });

  const sameCookie = cookie.split(";")[0];
  const state = await fetch(`${instance.baseUrl}/api/state`, { headers: { cookie: sameCookie } });
  assert.equal(state.status, 200);
});
