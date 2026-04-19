const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const corsMiddleware = require('./middlewares/cors');
const { limiter } = require('./middlewares/rateLimiter');
const errorHandler = require('./middlewares/errorHandler');
const notFound = require('./middlewares/notFound');
const routes = require('./routes');
const config = require('./config');

let swaggerSpec;
if (config.env === 'development') {
  const previousNoDeprecation = process.noDeprecation;
  process.noDeprecation = true;
  swaggerSpec = require('./config/swagger');
  process.noDeprecation = previousNoDeprecation;
}

const app = express();

// Security middleware
app.use(helmet({
  // Allow frontend (different origin/port) to load uploaded images.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(corsMiddleware);
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression
app.use(compression());

// Logging
if (config.env !== 'test') {
  app.use(morgan('dev'));
}

// API docs
if (config.env === 'development') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Static file serving for uploaded documents
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// API routes
app.use('/api/v1', routes);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
