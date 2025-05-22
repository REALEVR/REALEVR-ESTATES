import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Maximum number of connection attempts
const MAX_RETRIES = 5;
// Initial delay in ms (will be multiplied by 2^attempt)
const INITIAL_RETRY_DELAY = 1000;

// Function to create a database connection with retry logic
async function createDbConnection(retryCount = 0): Promise<{ pool: Pool, db: any }> {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }

    console.log(`Attempting to connect to database (attempt ${retryCount + 1}/${MAX_RETRIES})...`);

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
      connectionTimeoutMillis: 5000, // How long to wait for a connection
    });

    // Test the connection
    const client = await pool.connect();
    client.release();

    console.log("Database connection established successfully");

    const db = drizzle({ client: pool, schema });
    return { pool, db };
  } catch (error) {
    console.error(`Database connection error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);

    if (retryCount < MAX_RETRIES - 1) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`Retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
      return createDbConnection(retryCount + 1);
    }

    console.error("Maximum retry attempts reached. Using fallback configuration.");

    // Create a pool that will fail gracefully but not crash the app
    const fallbackPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
      max: 1,
    });

    const db = drizzle({ client: fallbackPool, schema });
    return { pool: fallbackPool, db };
  }
}

// Initialize the database connection
const { pool, db } = await createDbConnection();

// Export the pool and db
export { pool, db };