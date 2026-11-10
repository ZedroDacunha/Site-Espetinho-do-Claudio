// Fotos: upload, download autenticado e persistência da referência no estado.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createApp } = require("./servidor");

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const PASSWORD = "senha-de-teste-123";

async function start(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "claudio-fotos-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const instance = createApp({
    dataFile: path.join(directory, "state.json"),
    appPassword: PASSWORD,
    sessionSecret: "0123456789".repeat(4)
  });
  await instance.ready;
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await instance.pool?.end?.().catch(() => {});
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  return { baseUrl, cookie };
}

test("upload de foto exige sessão, devolve a imagem e guarda a referência", async t => {
  const { baseUrl, cookie } = await start(t);
  const dataUrl = `data:image/png;base64,${PNG_1PX.toString("base64")}`;

  const semSessao = await fetch(`${baseUrl}/api/photos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl })
  });
  assert.equal(semSessao.status, 401);

  const upload = await fetch(`${baseUrl}/api/photos`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataUrl })
  });
  assert.equal(upload.status, 200);
  const { url } = await upload.json();
  assert.match(url, /^\/api\/photos\/[a-f0-9]{24}$/);

  const image = await fetch(`${baseUrl}${url}`, { headers: { cookie } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG_1PX);

  const semCookie = await fetch(`${baseUrl}${url}`);
  assert.equal(semCookie.status, 401);

  const tipoInvalido = await fetch(`${baseUrl}/api/photos`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ dataUrl: "data:text/html;base64,PHNjcmlwdD4=" })
  });
  assert.equal(tipoInvalido.status, 400);

  const state = await fetch(`${baseUrl}/api/state`, { headers: { cookie } }).then(response => response.json());
  const saved = await fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      products: [{ id: "p1", nome: "Espetinho de frango", preco: 6, quantidade: 10, minimo: 2, foto: url }],
      movements: [],
      supplies: [{ id: "s1", nome: "Palito", unidade: "pacote", minimo: 3, foto: url }],
      supplyMovements: [],
      revision: state.revision
    })
  });
  assert.equal(saved.status, 200);
  const after = await fetch(`${baseUrl}/api/state`, { headers: { cookie } }).then(response => response.json());
  assert.equal(after.products[0].foto, url);
  assert.equal(after.supplies[0].foto, url);

  const referenciaInvalida = await fetch(`${baseUrl}/api/state`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      products: [{ id: "p2", nome: "Carvão", preco: 1, quantidade: 1, minimo: 1, foto: "javascript:alert(1)" }],
      movements: [],
      supplies: [],
      supplyMovements: [],
      revision: after.revision
    })
  });
  assert.equal(referenciaInvalida.status, 400);
});
