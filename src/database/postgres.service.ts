import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly backend: string;
  private readonly pool: Pool | null;

  constructor(private readonly configService: ConfigService) {
    this.backend = (this.configService.get<string>('DATA_BACKEND') || 'mongo').toLowerCase();

    const connectionString =
      this.configService.get<string>('DATABASE_URL') ||
      this.configService.get<string>('SUPABASE_DB_URL');

    if (!connectionString) {
      this.pool = null;
      return;
    }

    const sslMode = (this.configService.get<string>('PGSSLMODE') || 'require').toLowerCase();
    const normalizedConnectionString = this.normalizeConnectionString(connectionString);
    this.pool = new Pool({
      connectionString: normalizedConnectionString,
      ssl: sslMode === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(this.configService.get<string>('PG_POOL_MAX') || 10),
    });
  }

  usePostgres(): boolean {
    return this.backend === 'postgres';
  }

  isConfigured(): boolean {
    return this.pool !== null;
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Postgres is not configured. Set DATABASE_URL or SUPABASE_DB_URL.');
    }

    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  private normalizeConnectionString(connectionString: string): string {
    try {
      const url = new URL(connectionString);
      url.searchParams.delete('sslmode');
      return url.toString();
    } catch {
      return connectionString;
    }
  }
}
