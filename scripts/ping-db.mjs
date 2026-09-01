// Verify the MongoDB connection. Run: npm run db:ping
// (reads .env.local via node --env-file — see package.json).
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set. Copy .env.local.example to .env.local and fill it in.",
  );
  process.exit(1);
}

const client = new MongoClient(uri);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  await db.command({ ping: 1 });
  console.log(`Connected to MongoDB. Database: ${db.databaseName}`);
} catch (err) {
  console.error("MongoDB connection failed:", err.message);
  process.exit(1);
} finally {
  await client.close();
}
