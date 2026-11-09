const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const express = require("express");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_DATA_FILE = path.join(__dirname, "data", "estoque.json");
const MAX_PRODUCTS = 10000;
const MAX_MOVEMENTS = 50000;
const MAX_STOCK_UNITS = 2147483647;
const MAX_PRICE = 999999999999.99;
const SESSION_COOKIE = "espetinhos_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function asId(value, fieldName) {
  const id = String(value ?? "").trim();
  if (!id || id.length > 128) throw new Error(`${fieldName} inválido.`);
  return id;
}

function stateRevision(state) {
  return crypto.createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

function normalizeState(input) {
  if (!input || !Array.isArray(input.products) || !Array.isArray(input.movements)) {
    throw new Error("O estado precisa conter listas de produtos e movimentações.");
  }
  if (input.products.length > MAX_PRODUCTS || input.movements.length > MAX_MOVEMENTS) {
    throw new Error("O estoque excede o limite de registros permitido.");
  }

  const productIds = new Set();
  const products = input.products.map((product, index) => {
    if (!product || typeof product.nome !== "string" || !product.nome.trim() || product.nome.trim().length > 60) {
      throw new Error(`Nome inválido no produto ${index + 1}.`);
    }
    const id = asId(product.id, `Identificador do produto ${index + 1}`);
    if (productIds.has(id)) throw new Error("Existem produtos com identificadores repetidos.");
    productIds.add(id);
    const rawPrice = Number(product.preco);
    const preco = Math.round(rawPrice * 100) / 100;
    const quantidade = Number(product.quantidade);
    const minimo = Number(product.minimo);
    if (!Number.isFinite(rawPrice) || rawPrice < 0 || rawPrice > MAX_PRICE
      || !Number.isSafeInteger(quantidade) || quantidade < 0 || quantidade > MAX_STOCK_UNITS
      || !Number.isSafeInteger(minimo) || minimo < 0 || minimo > MAX_STOCK_UNITS) {
      throw new Error(`Preço ou quantidade inválida no produto ${product.nome}.`);
    }
    return { id, nome: product.nome.trim(), preco, quantidade, minimo };
  });

  const movementIds = new Set();
  const movements = input.movements.map((movement, index) => {
    if (!movement || typeof movement.productName !== "string" || !movement.productName.trim() || movement.productName.trim().length > 60) {
      throw new Error(`Produto inválido na movimentação ${index + 1}.`);
    }
    const id = asId(movement.id, `Identificador da movimentação ${index + 1}`);
    if (movementIds.has(id)) throw new Error("Existem movimentações com identificadores repetidos.");
    movementIds.add(id);
    const type = String(movement.type || "");
    const quantity = Number(movement.quantity);
    const createdAt = String(movement.createdAt || "");
    if (!["entrada", "saida", "ajuste"].includes(type) || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > MAX_STOCK_UNITS || !Number.isFinite(Date.parse(createdAt))) {
      throw new Error(`Dados inválidos na movimentação ${index + 1}.`);
    }
    const note = typeof movement.note === "string" ? movement.note.trim() : "";
    if (note.length > 120) throw new Error(`Observação muito longa na movimentação ${index + 1}.`);
    return {
      id,
      productId: movement.productId == null ? "" : String(movement.productId),
      productName: movement.productName.trim(),
      type,
      quantity,
      createdAt: new Date(createdAt).toISOString(),
      note
    };
  });

  movements.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { products, movements };
}

async function readFileState(dataFile) {
  try {
    return normalizeState(JSON.parse(await fs.readFile(dataFile, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return { products: [], movements: [] };
    throw error;
  }
}

async function writeFileState(dataFile, nextState) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporaryFile, `${JSON.stringify(nextState, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryFile, dataFile);
  } catch (error) {
    await fs.rm(temporaryFile, { force: true }).catch(() => {});
    throw error;
  }
}

async function initializePostgres(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_products (
      id TEXT PRIMARY KEY,
      name VARCHAR(60) NOT NULL,
      price NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
      quantity INTEGER NOT NULL CHECK (quantity >= 0),
      minimum INTEGER NOT NULL CHECK (minimum >= 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL DEFAULT '',
      product_name VARCHAR(60) NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('entrada', 'saida', 'ajuste')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      created_at TIMESTAMPTZ NOT NULL,
      note VARCHAR(120) NOT NULL DEFAULT ''
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS inventory_movements_created_at_idx ON inventory_movements (created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS inventory_products_name_idx ON inventory_products (name)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_metadata (
      id SMALLINT PRIMARY KEY CHECK (id = 1),
      revision TEXT NOT NULL
    )
  `);
}

async function readPostgresState(pool) {
  const [productsResult, movementsResult] = await Promise.all([
    pool.query("SELECT id, name, price, quantity, minimum FROM inventory_products ORDER BY name, id"),
    pool.query("SELECT id, product_id, product_name, type, quantity, created_at, note FROM inventory_movements ORDER BY created_at DESC, id")
  ]);
  return normalizeState({
    products: productsResult.rows.map(row => ({
      id: row.id,
      nome: row.name,
      preco: Number(row.price),
      quantidade: Number(row.quantity),
      minimo: Number(row.minimum)
    })),
    movements: movementsResult.rows.map(row => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      type: row.type,
      quantity: Number(row.quantity),
      createdAt: new Date(row.created_at).toISOString(),
      note: row.note
    }))
  });
}

async function readPostgresSnapshot(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const state = await readPostgresState(client);
    const metadata = await client.query("SELECT revision FROM inventory_metadata WHERE id = 1");
    await client.query("COMMIT");
    if (!metadata.rows.length) throw new Error("A versão do banco não foi inicializada.");
    return { state, revision: metadata.rows[0].revision };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function sameRow(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

async function syncTable(client, { table, previous, next, columns, valuesFor, updateColumns }) {
  const previousById = new Map(previous.map(row => [row.id, row]));
  const nextById = new Map(next.map(row => [row.id, row]));
  const deletedIds = previous.filter(row => !nextById.has(row.id)).map(row => row.id);
  for (let offset = 0; offset < deletedIds.length; offset += 1000) {
    await client.query(`DELETE FROM ${table} WHERE id = ANY($1::text[])`, [deletedIds.slice(offset, offset + 1000)]);
  }

  const changedRows = next.filter(row => !previousById.has(row.id) || !sameRow(previousById.get(row.id), row));
  const batchSize = 200;
  for (let offset = 0; offset < changedRows.length; offset += batchSize) {
    const batch = changedRows.slice(offset, offset + batchSize);
    const parameters = [];
    const valueGroups = batch.map((row, rowIndex) => {
      const values = valuesFor(row);
      const placeholders = values.map((value, columnIndex) => {
        parameters.push(value);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    const updates = updateColumns.map(column => `${column} = EXCLUDED.${column}`).join(", ");
    await client.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${valueGroups.join(", ")} ON CONFLICT (id) DO UPDATE SET ${updates}`,
      parameters
    );
  }
}

async function writePostgresState(pool, previousState, nextState, expectedRevision) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const metadata = await client.query("SELECT revision FROM inventory_metadata WHERE id = 1 FOR UPDATE");
    if (!metadata.rows.length || metadata.rows[0].revision !== expectedRevision) {
      const conflict = new Error("O estoque mudou em outro acesso.");
      conflict.code = "REVISION_CONFLICT";
      throw conflict;
    }
    await syncTable(client, {
      table: "inventory_products",
      previous: previousState.products,
      next: nextState.products,
      columns: ["id", "name", "price", "quantity", "minimum", "updated_at"],
      valuesFor: row => [row.id, row.nome, row.preco, row.quantidade, row.minimo, new Date().toISOString()],
      updateColumns: ["name", "price", "quantity", "minimum", "updated_at"]
    });
    await syncTable(client, {
      table: "inventory_movements",
      previous: previousState.movements,
      next: nextState.movements,
      columns: ["id", "product_id", "product_name", "type", "quantity", "created_at", "note"],
      valuesFor: row => [row.id, row.productId, row.productName, row.type, row.quantity, row.createdAt, row.note],
      updateColumns: ["product_id", "product_name", "type", "quantity", "created_at", "note"]
    });
    const nextRevision = stateRevision(nextState);
    await client.query("UPDATE inventory_metadata SET revision = $1 WHERE id = 1", [nextRevision]);
    await client.query("COMMIT");
    return nextRevision;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function makeSessionToken(secret) {
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validSession(cookieHeader, secret) {
  const cookie = String(cookieHeader || "").split(";").map(item => item.trim()).find(item => item.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return false;
  try {
    const token = decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
    const separator = token.lastIndexOf(".");
    if (separator < 1) return false;
    const payload = token.slice(0, separator);
    const provided = Buffer.from(token.slice(separator + 1), "base64url");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest();
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(data.expiresAt) && data.expiresAt > Date.now();
  } catch (_) { return false; }
}

function matchesPassword(input, expected) {
  const providedHash = crypto.createHash("sha256").update(String(input || "")).digest();
  const expectedHash = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function appendCookie(res, value, { production, maxAge = SESSION_MAX_AGE_SECONDS }) {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (production) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function createApp({
  dataFile = process.env.STOCK_DATA_FILE || DEFAULT_DATA_FILE,
  databaseUrl = process.env.DATABASE_URL || "",
  appPassword = process.env.APP_PASSWORD || "",
  sessionSecret = process.env.SESSION_SECRET || "",
  production = process.env.NODE_ENV === "production"
} = {}) {
  if (production && !databaseUrl) throw new Error("DATABASE_URL é obrigatório em produção.");
  if (production && (!appPassword || appPassword.length < 12)) throw new Error("APP_PASSWORD deve ter ao menos 12 caracteres em produção.");
  if (appPassword && production && sessionSecret.length < 32) throw new Error("SESSION_SECRET deve ter ao menos 32 caracteres.");

  const secret = sessionSecret || crypto.randomBytes(32).toString("hex");
  let state = { products: [], movements: [] };
  let revision = "";
  let saveQueue = Promise.resolve();
  let loginAttempts = new Map();
  let pool = null;
  if (databaseUrl) {
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
    pool.on("error", error => console.error("Erro inesperado na conexão PostgreSQL:", error));
  }

  const ready = (async () => {
    if (pool) {
      await initializePostgres(pool);
      state = await readPostgresState(pool);
      await pool.query("INSERT INTO inventory_metadata (id, revision) VALUES (1, $1) ON CONFLICT (id) DO NOTHING", [stateRevision(state)]);
      const snapshot = await readPostgresSnapshot(pool);
      state = snapshot.state;
      revision = snapshot.revision;
      if (state.products.length === 0 && state.movements.length === 0) {
        const fileState = await readFileState(dataFile);
        if (fileState.products.length || fileState.movements.length) {
          revision = await writePostgresState(pool, state, fileState, revision);
          state = fileState;
        }
      }
    } else {
      state = await readFileState(dataFile);
      revision = stateRevision(state);
    }
  })();

  const app = express();
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", 1);
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "no-referrer");
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (production) res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/session", (req, res) => {
    const authenticated = !appPassword || validSession(req.headers.cookie, secret);
    res.set("Cache-Control", "no-store").json({ authenticated, loginRequired: Boolean(appPassword) });
  });
  app.post("/api/auth/login", (req, res) => {
    if (!appPassword) return res.status(400).json({ error: "O acesso por senha não está habilitado neste servidor." });
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const attempts = loginAttempts.get(ip) || { count: 0, startedAt: now };
    if (now - attempts.startedAt > 15 * 60 * 1000) {
      attempts.count = 0;
      attempts.startedAt = now;
    }
    if (attempts.count >= 5) {
      res.set("Retry-After", "900");
      return res.status(429).json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." });
    }
    if (!matchesPassword(req.body?.password, appPassword)) {
      attempts.count += 1;
      loginAttempts.set(ip, attempts);
      return res.status(401).json({ error: "Senha incorreta." });
    }
    loginAttempts.delete(ip);
    appendCookie(res, makeSessionToken(secret), { production });
    res.set("Cache-Control", "no-store").json({ authenticated: true });
  });
  app.post("/api/auth/logout", (req, res) => {
    appendCookie(res, "", { production, maxAge: 0 });
    res.set("Cache-Control", "no-store").json({ authenticated: false });
  });

  app.use("/api/state", (req, res, next) => {
    if (appPassword && !validSession(req.headers.cookie, secret)) {
      return res.status(401).json({ error: "Sua sessão expirou. Entre novamente." });
    }
    next();
  });
  app.get("/api/state", async (req, res, next) => {
    try {
      await ready;
      if (pool) {
        const snapshot = await readPostgresSnapshot(pool);
        state = snapshot.state;
        revision = snapshot.revision;
      }
      res.set("Cache-Control", "no-store").json({ ...state, revision });
    } catch (error) { next(error); }
  });
  app.put("/api/state", async (req, res, next) => {
    try {
      await ready;
      if (typeof req.body?.revision !== "string") return res.status(409).json({ error: "A versão atual do estoque não foi enviada. Recarregue a página." });
      const expectedRevision = req.body.revision;
      const nextState = normalizeState(req.body);
      const save = saveQueue.then(async () => {
        if (expectedRevision !== revision) {
          const conflict = new Error("O estoque mudou em outro acesso.");
          conflict.code = "REVISION_CONFLICT";
          throw conflict;
        }
        if (pool) {
          revision = await writePostgresState(pool, state, nextState, expectedRevision);
        } else {
          await writeFileState(dataFile, nextState);
          revision = stateRevision(nextState);
        }
        state = nextState;
      });
      saveQueue = save.catch(() => {});
      await save;
      res.set("Cache-Control", "no-store").json({ ...state, revision });
    } catch (error) {
      if (error.code === "REVISION_CONFLICT") return res.status(409).json({ error: error.message });
      if (error.message && !error.code) return res.status(400).json({ error: error.message });
      next(error);
    }
  });

  app.get("/", (req, res) => res.sendFile(path.join(ROOT_DIR, "index.html")));
  app.get("/index.html", (req, res) => res.sendFile(path.join(ROOT_DIR, "index.html")));
  app.get("/style.css", (req, res) => res.sendFile(path.join(ROOT_DIR, "style.css")));
  app.get("/script.js", (req, res) => res.sendFile(path.join(ROOT_DIR, "script.js")));
  app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint não encontrado." }));
  app.use((req, res) => res.status(404).send("Página não encontrada."));
  app.use((error, req, res, next) => {
    console.error("Erro na API:", error);
    if (res.headersSent) return next(error);
    if (error.type === "entity.too.large") return res.status(413).json({ error: "Os dados enviados excedem o limite de 20 MB." });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: "JSON inválido." });
    res.status(500).json({ error: "Erro interno ao acessar os dados do estoque." });
  });

  return { app, ready, dataFile, pool };
}

async function startServer() {
  const instance = createApp();
  try {
    await instance.ready;
  } catch (error) {
    await instance.pool?.end().catch(() => {});
    throw error;
  }
  const port = Number(process.env.PORT) || 3000;
  const server = instance.app.listen(port, "0.0.0.0", () => {
    console.log(`Estoque do Claudio disponível na porta ${port}.`);
    console.log(instance.pool ? "Armazenamento persistente: PostgreSQL gerenciado." : `Armazenamento local de desenvolvimento: ${instance.dataFile}`);
  });
  server.closePool = () => instance.pool?.end();
  return server;
}

if (require.main === module) {
  let server;
  const shutdown = () => {
    if (!server) return process.exit(0);
    server.close(async () => {
      try { await server.closePool?.(); } catch (error) { console.error("Falha ao fechar conexões do banco:", error); }
      process.exit(0);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  startServer().then(started => { server = started; }).catch(error => {
    console.error("Não foi possível iniciar o servidor ou carregar os dados:", error);
    process.exitCode = 1;
  });
}

module.exports = { createApp, normalizeState, DEFAULT_DATA_FILE };
