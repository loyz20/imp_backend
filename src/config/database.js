const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
const config = require('./index');

let mysqlPool = null;

const connectDB = async () => {
  try {
    mysqlPool = mysql.createPool({
      host: config.mysql.host,
      port: config.mysql.port,
      user: config.mysql.user,
      password: config.mysql.password,
      database: config.mysql.database,
      charset: config.mysql.charset,
      waitForConnections: true,
      connectionLimit: 10,
    });
    await mysqlPool.query('SELECT 1');
    logger.info(`MySQL connected: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
  } catch (error) {
    logger.error(`MySQL connection error: ${error.message}`);
    process.exit(1);
  }
};

const closeDB = async () => {
  if (mysqlPool) {
    await mysqlPool.end();
    logger.info('MySQL connection pool closed');
  }
};

const getMySQLPool = () => mysqlPool;

module.exports = {
  connectDB,
  closeDB,
  getMySQLPool,
};
