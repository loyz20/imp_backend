const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const config = require('./config');
const { connectDB, closeDB } = require('./config/database');
const logger = require('./utils/logger');

const seedChartOfAccounts = require('./seeds/chartOfAccount.seed');
const seedSettings = require('./seeds/appSetting.seed');
const seedSuperAdmin = require('./seeds/superAdmin.seed');

const startServer = async () => {
  await connectDB();
  await seedChartOfAccounts();
  await seedSettings();
  await seedSuperAdmin();

  const server = app.listen(config.port, () => {
    logger.info(`Server running in ${config.env} mode on port ${config.port}`);
    if (config.env === 'development') {
      logger.info(`API docs available at http://localhost:${config.port}/api-docs`);
    }
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await closeDB();
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
    server.close(() => process.exit(1));
  });
};

startServer();
