const fs = require("fs");
const path = require("path");
const { MongoClient, ServerApiVersion } = require("mongodb");

const ROOT_DIR = __dirname;
const ENV_FILE = process.env.ATLAS_ENV_FILE || path.join(__dirname, ".env");
const STATE_ID = "main";

loadEnvironmentFile(ENV_FILE);

const uri = resolveMongoUri();
const databaseName = process.env.MONGODB_DB_NAME || inferDatabaseName(uri) || "library_management";
const collectionName = process.env.MONGODB_COLLECTION || "library_state";

if (!uri) {
  console.error("Missing MONGODB_URI. Copy .env.example to .env and add the Atlas connection string first.");
  process.exitCode = 1;
} else {
  seed().catch((error) => {
    console.error("Could not replace the MongoDB library data:", error.message);
    process.exitCode = 1;
  });
}

function loadEnvironmentFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveMongoUri() {
  let value = process.env.MONGODB_URI || "";
  if (process.env.MONGODB_USERNAME) {
    value = value.replace("<db_username>", encodeURIComponent(process.env.MONGODB_USERNAME));
    value = value.replace("<username>", encodeURIComponent(process.env.MONGODB_USERNAME));
  }
  if (process.env.MONGODB_PASSWORD) {
    value = value.replace("<db_password>", encodeURIComponent(process.env.MONGODB_PASSWORD));
    value = value.replace("<password>", encodeURIComponent(process.env.MONGODB_PASSWORD));
  }
  return value;
}

function inferDatabaseName(connectionString) {
  try {
    return new URL(connectionString).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function createInitialState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    settings: {
      libraryName: "Smart Library",
      fineRate: 5,
      defaultLoanDays: 14,
      username: "Akanksha",
      password: "Akanksha12"
    },
    users: [{
      id: "U001",
      username: "Akanksha",
      password: "Akanksha12",
      role: "admin",
      name: "Akanksha",
      email: "",
      memberId: "",
      status: "Active",
      createdAt: today
    }],
    books: [],
    members: [],
    transactions: []
  };
}

async function seed() {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: true }
  });

  try {
    await client.connect();
    const collection = client.db(databaseName).collection(collectionName);
    const now = new Date();
    await collection.replaceOne(
      { _id: STATE_ID },
      { _id: STATE_ID, state: createInitialState(), createdAt: now, updatedAt: now },
      { upsert: true }
    );
    console.log(`Replaced library data in MongoDB database "${databaseName}", collection "${collectionName}".`);
  } finally {
    await client.close();
  }
}
