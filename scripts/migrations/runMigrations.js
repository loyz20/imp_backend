const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const migrationsDir = __dirname;

async function ensureMigrationTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
}

async function getAppliedMigrations(conn) {
  const [rows] = await conn.query('SELECT filename FROM schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  const isDryRun = process.argv.includes('--dry-run');

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'app_iko',
    charset: process.env.MYSQL_CHARSET || 'utf8mb4',
    multipleStatements: true,
  });

  try {
    await ensureMigrationTable(connection);
    const applied = await getAppliedMigrations(connection);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^\d{3}_.+\.sql$/.test(file))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        // eslint-disable-next-line no-console
        console.log(`SKIP ${file}`);
        continue;
      }

      if (isDryRun) {
        // eslint-disable-next-line no-console
        console.log(`PENDING ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim();
      if (!sql) {
        // eslint-disable-next-line no-console
        console.log(`SKIP ${file} (empty)`);
        continue;
      }

      // eslint-disable-next-line no-console
      console.log(`RUN  ${file}`);
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      // eslint-disable-next-line no-console
      console.log(`DONE ${file}`);
    }
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', error.message);
  process.exit(1);
});
