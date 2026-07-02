import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://safespend:safespend_dev@localhost:5432/safespend';

export const pool = new pg.Pool({ connectionString });
export const db = drizzle(pool, { schema });
export { schema };
