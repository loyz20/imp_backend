const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const config = require('../config');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    error = new ApiError(statusCode, message);
    error.stack = err.stack;
  }

  const response = {
    success: false,
    message: error.message,
    ...(error.errors.length > 0 && { errors: error.errors }),
    ...(config.env === 'development' && { stack: error.stack }),
  };

  if (error.statusCode >= 500) {
    logger.error(`${error.statusCode} - ${error.message}`, { stack: error.stack });
  } else {
    logger.warn(`${error.statusCode} - ${error.message}`);
  }

  res.status(error.statusCode).json(response);
};

module.exports = errorHandler;
