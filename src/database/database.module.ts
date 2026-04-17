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
        const isLocal = connStr.includes('localhost') || connStr.includes('127.0.0.1');
        return new Pool({
          connectionString: connStr,
          ssl: isLocal ? false : { rejectUnauthorized: false },
          max: parseInt(process.env.PG_POOL_MAX || '10'),
        });
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
