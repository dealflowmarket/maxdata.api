import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () => {
        // Strip sslmode from connection string — let the ssl option handle it
        const connStr = (process.env.DATABASE_URL ?? '').replace(
          /[?&]sslmode=[^&]*/g,
          '',
        );
        const isLocal =
          connStr.includes('localhost') || connStr.includes('127.0.0.1');
        const pool = new Pool({
          connectionString: connStr,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          max: parseInt(process.env.PG_POOL_MAX || '3'),
          connectionTimeoutMillis: parseInt(
            process.env.PG_CONNECT_TIMEOUT_MS || '5000',
          ),
          query_timeout: parseInt(process.env.PG_QUERY_TIMEOUT_MS || '12000'),
          idleTimeoutMillis: parseInt(
            process.env.PG_IDLE_TIMEOUT_MS || '10000',
          ),
        });

        // Supabase or other managed Postgres providers can drop idle clients.
        // Without an error listener, pg emits an unhandled pool error and kills
        // the Node process.
        pool.on('error', (error) => {
          console.error('Unexpected PostgreSQL pool error:', error);
        });

        return pool;
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
