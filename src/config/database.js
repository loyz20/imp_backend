const mongoose = require('mongoose');
const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
const config = require('./index');

let mysqlPool = null;

const connectDB = async () => {
  if (config.dbProvider === 'mysql') {
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
      return;
    } catch (error) {
      logger.error(`MySQL connection error: ${error.message}`);
      process.exit(1);
    }
  }

  try {
    const conn = await mongoose.connect(config.mongo.uri);
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

const closeDB = async () => {
  if (config.dbProvider === 'mysql') {
    if (mysqlPool) {
      await mysqlPool.end();
      logger.info('MySQL connection pool closed');
    }
    return;
  }

  await mongoose.connection.close(false);
  logger.info('MongoDB connection closed');
};

const getMySQLPool = () => mysqlPool;

module.exports = {
  connectDB,
  closeDB,
  getMySQLPool,
};
