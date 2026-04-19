const rateLimit = require('express-rate-limit');
const config = require('../config');

const isLocalIp = (ip = '') => {
  return ip === '127.0.0.1'
    || ip === '::1'
    || ip === '::ffff:127.0.0.1'
    || ip.startsWith('::ffff:192.168.')
    || ip.startsWith('::ffff:10.')
    || ip.startsWith('::ffff:172.16.');
};

const shouldSkipRateLimit = (req) => {
  // Avoid blocking local development traffic (Vite HMR + frequent API polling/forms).
  if (config.env === 'development') return true;
  return isLocalIp(req.ip);
};

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
});

module.exports = { limiter, authLimiter };
