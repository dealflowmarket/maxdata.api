import { config } from 'dotenv';
import { Pool } from 'pg';

config();

const connectionString = (process.env.DATABASE_URL ?? '').replace(
  /[?&]sslmode=[^&]*/g,
  '',
);

async function main() {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const statements = [
    `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
    `CREATE INDEX IF NOT EXISTS businesses_search_text_trgm_idx
      ON businesses
      USING gin (search_text gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS businesses_name_trgm_idx
      ON businesses
      USING gin (name gin_trgm_ops)`,
    `CREATE INDEX IF NOT EXISTS businesses_name_en_trgm_idx
      ON businesses
      USING gin (name_en gin_trgm_ops)
      WHERE name_en IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS businesses_latest_total_revenue_idx
      ON businesses (latest_total_revenue DESC)
      WHERE latest_total_revenue IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS businesses_latest_net_profit_idx
      ON businesses (latest_net_profit DESC)
      WHERE latest_net_profit IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS businesses_latest_roe_idx
      ON businesses (latest_roe DESC)
      WHERE latest_roe IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS businesses_section_code_idx
      ON businesses (section_code)`,
    `CREATE INDEX IF NOT EXISTS businesses_tsic_code_idx
      ON businesses (tsic_code)`,
    `CREATE INDEX IF NOT EXISTS business_financials_businessid_statement_year_idx
      ON business_financials (businessid, statement_year)`,
  ];

  try {
    for (const statement of statements) {
      // Each statement is idempotent by design, so the script is safe to rerun.
      await pool.query(statement);
      console.log(`OK: ${statement.split('\n')[0]}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
