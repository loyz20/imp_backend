/**
 * Wraps async route handlers to catch errors and forward them to error middleware.
 * Usage: router.get('/path', catchAsync(async (req, res) => { ... }));
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
