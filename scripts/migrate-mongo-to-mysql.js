/* eslint-disable no-console */
require('dotenv').config();

const mongoose = require('mongoose');
const mysql = require('mysql2/promise');
const { EJSON } = require('bson');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/app-iko';
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'app_iko';
const MYSQL_CHARSET = process.env.MYSQL_CHARSET || 'utf8mb4';
const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || 300);
const SHOULD_TRUNCATE = process.argv.includes('--truncate');

const toJsonPayload = (doc) => {
  // EJSON preserves BSON types (ObjectId/Date) in JSON-safe form.
  const ejson = EJSON.stringify(doc, { relaxed: true });
  return JSON.parse(ejson);
};

const toMysqlDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const ensureSchema = async (conn) => {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET ${MYSQL_CHARSET}`);
  await conn.query(`USE \`${MYSQL_DATABASE}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS migration_raw_data (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      collection_name VARCHAR(128) NOT NULL,
      mongo_id VARCHAR(64) NOT NULL,
      payload JSON NOT NULL,
      created_at DATETIME NULL,
      updated_at DATETIME NULL,
      migrated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_collection_mongo_id (collection_name, mongo_id),
      KEY idx_collection_name (collection_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);
};

const migrateCollection = async (mongoDb, mysqlConn, collectionName) => {
  const collection = mongoDb.collection(collectionName);
  const total = await collection.countDocuments();

  if (total === 0) {
    console.log(`- ${collectionName}: skip (0 docs)`);
    return;
  }

  console.log(`- ${collectionName}: ${total} docs`);

  const cursor = collection.find({});
  let migrated = 0;
  let batch = [];

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    batch.push(doc);

    if (batch.length >= BATCH_SIZE) {
      // eslint-disable-next-line no-await-in-loop
      await insertBatch(mysqlConn, collectionName, batch);
      migrated += batch.length;
      batch = [];
      console.log(`  processed ${migrated}/${total}`);
    }
  }

  if (batch.length > 0) {
    await insertBatch(mysqlConn, collectionName, batch);
    migrated += batch.length;
  }

  console.log(`  done ${migrated}/${total}`);
};

const insertBatch = async (mysqlConn, collectionName, docs) => {
  const sql = `
    INSERT INTO migration_raw_data (
      collection_name,
      mongo_id,
      payload,
      created_at,
      updated_at
    ) VALUES ?
    ON DUPLICATE KEY UPDATE
      payload = VALUES(payload),
      created_at = VALUES(created_at),
      updated_at = VALUES(updated_at),
      migrated_at = CURRENT_TIMESTAMP
  `;

  const values = docs.map((doc) => {
    const payload = toJsonPayload(doc);
    return [
      collectionName,
      String(doc._id),
      JSON.stringify(payload),
      toMysqlDate(doc.createdAt),
      toMysqlDate(doc.updatedAt),
    ];
  });

  await mysqlConn.query(sql, [values]);
};

const main = async () => {
  let mysqlConn;

  try {
    console.log('Connecting MongoDB...');
    await mongoose.connect(MONGO_URI);

    console.log('Connecting MySQL...');
    mysqlConn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      multipleStatements: false,
    });

    await ensureSchema(mysqlConn);

    if (SHOULD_TRUNCATE) {
      console.log('Truncating migration_raw_data...');
      await mysqlConn.query('TRUNCATE TABLE migration_raw_data');
    }

    const collections = await mongoose.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const names = collections
      .map((c) => c.name)
      .filter((name) => !name.startsWith('system.'))
      .sort();

    console.log(`Found ${names.length} collections`);

    for (const name of names) {
      // eslint-disable-next-line no-await-in-loop
      await migrateCollection(mongoose.connection.db, mysqlConn, name);
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (mysqlConn) {
      await mysqlConn.end();
    }
    await mongoose.disconnect();
  }
};

main();
