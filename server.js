const fs = require("fs");
const http = require("http");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

const ROOT_DIR = __dirname;
const ENV_FILE = process.env.ATLAS_ENV_FILE || path.join(ROOT_DIR, ".env");
const STATE_ID = "main";
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const STATIC_FILES = new Set(["index.html", "app.js", "database.js", "styles.css"]);
const STATIC_IMAGE_ROOT = path.join("tmp", "pdfs");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

loadEnvironmentFile(ENV_FILE);

const PORT = parsePort(process.env.PORT, 8000);
const MONGODB_URI = resolveMongoUri();
const DB_NAME = process.env.MONGODB_DB_NAME || inferDatabaseName(MONGODB_URI) || "library_management";
const COLLECTION_NAME = process.env.MONGODB_COLLECTION || "library_state";

let client;

function loadEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function resolveMongoUri() {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    return "";
  }

  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;

  if (username) {
    uri = uri.replace("<db_username>", encodeURIComponent(username));
    uri = uri.replace("<username>", encodeURIComponent(username));
  }

  if (password) {
    uri = uri.replace("<db_password>", encodeURIComponent(password));
    uri = uri.replace("<password>", encodeURIComponent(password));
  }

  return uri;
}

function parsePort(value, fallback) {
  const port = Number(value || fallback);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function inferDatabaseName(uri) {
  if (!uri) {
    return "";
  }

  try {
    const parsed = new URL(uri);
    const databaseName = parsed.pathname.replace(/^\/+/, "");
    return databaseName ? decodeURIComponent(databaseName) : "";
  } catch (error) {
    return "";
  }
}

async function getCollection() {
  if (!MONGODB_URI) {
    const error = new Error("Missing MONGODB_URI. Copy .env.example to .env and set your Atlas connection string.");
    error.statusCode = 503;
    error.publicMessage = "MongoDB is not configured. Add MONGODB_URI to .env.";
    throw error;
  }

  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true
      }
    });

    try {
      await client.connect();
    } catch (error) {
      try {
        await client.close();
      } catch (closeError) {
        console.warn("Could not close failed MongoDB client.", closeError.message);
      }

      client = null;
      error.statusCode = 503;
      error.publicMessage = "MongoDB is unavailable. Check Atlas credentials, IP access, and network access.";
      throw error;
    }
  }

  return client.db(DB_NAME).collection(COLLECTION_NAME);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(text);
}

async function readJsonBody(request) {
  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleApiRequest(request, response, pathname) {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Origin": "*"
    });
    response.end();
    return;
  }

  if (pathname === "/api/health" && request.method === "GET") {
    try {
      const collection = await getCollection();
      await collection.db.command({ ping: 1 });
      sendJson(response, 200, {
        ok: true,
        database: DB_NAME,
        collection: COLLECTION_NAME
      });
    } catch (error) {
      console.warn(error.publicMessage || "MongoDB health check failed.");
      sendJson(response, error.statusCode || 503, {
        ok: false,
        error: error.publicMessage || "MongoDB is unavailable."
      });
    }
    return;
  }

  if (pathname === "/api/library-state" && request.method === "GET") {
    const collection = await getCollection();
    const record = await collection.findOne({ _id: STATE_ID });
    sendJson(response, 200, {
      state: record?.state || null,
      updatedAt: record?.updatedAt || null
    });
    return;
  }

  if (pathname === "/api/library-state" && request.method === "PUT") {
    const body = await readJsonBody(request);
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      sendJson(response, 400, { error: "Expected a JSON object with a state property." });
      return;
    }

    const collection = await getCollection();
    await collection.updateOne(
      { _id: STATE_ID },
      {
        $set: {
          state: body.state,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

function resolveStaticFile(pathname) {
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const normalizedRelativePath = path.normalize(relativePath);
  const filePath = path.resolve(ROOT_DIR, normalizedRelativePath);
  const pathFromRoot = path.relative(ROOT_DIR, filePath);

  if (pathFromRoot.startsWith("..") || path.isAbsolute(pathFromRoot)) {
    return "";
  }

  if (STATIC_FILES.has(pathFromRoot)) {
    return filePath;
  }

  if (pathFromRoot.startsWith(STATIC_IMAGE_ROOT + path.sep) && IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return filePath;
  }

  return "";
}

function serveStaticFile(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed.");
    return;
  }

  const filePath = resolveStaticFile(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(response, 404, "Not found.");
    return;
  }

  const contentType = MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname.startsWith("/api/")) {
    await handleApiRequest(request, response, requestUrl.pathname);
    return;
  }

  serveStaticFile(request, response, requestUrl.pathname);
}

function listenWithPortFallback(server, preferredPort) {
  const maxAttempts = 10;

  return new Promise((resolve, reject) => {
    const tryListen = (port, remainingAttempts) => {
      const onError = (error) => {
        server.removeListener("listening", onListening);

        if (error.code === "EADDRINUSE" && remainingAttempts > 0) {
          console.warn(`Port ${port} is already in use. Trying ${port + 1}.`);
          tryListen(port + 1, remainingAttempts - 1);
          return;
        }

        reject(error);
      };

      const onListening = () => {
        server.removeListener("error", onError);
        resolve(port);
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port);
    };

    tryListen(preferredPort, maxAttempts);
  });
}

async function start() {
  if (!MONGODB_URI) {
    console.warn("Missing MONGODB_URI. Copy .env.example to .env and set your Atlas connection string.");
  } else {
    try {
      const collection = await getCollection();
      await collection.db.command({ ping: 1 });
      console.log(`Connected to MongoDB database "${DB_NAME}", collection "${COLLECTION_NAME}".`);
    } catch (error) {
      console.warn("Could not connect to MongoDB. The web server will still start, but database API calls will return 503 until Atlas is reachable.");
      console.warn(error.message);
    }
  }

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (error.publicMessage) {
        console.warn(error.publicMessage);
      } else {
        console.error(error);
      }
      const statusCode = error.statusCode || 500;
      const message = error.publicMessage || (statusCode >= 500 ? "Server error." : error.message || "Request failed.");
      sendJson(response, statusCode, { error: message });
    });
  });

  const actualPort = await listenWithPortFallback(server, PORT);
  console.log(`Library app running at http://localhost:${actualPort}`);
}

process.on("SIGINT", async () => {
  if (client) {
    await client.close();
  }
  process.exit(0);
});

start();
