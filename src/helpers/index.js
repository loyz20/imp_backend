/**
 * Paginate Mongoose query results
 * @param {import('mongoose').Model} model - Mongoose model
 * @param {Object} [options]
 * @param {Object} [options.filter={}] - Mongoose filter query
 * @param {number} [options.page=1] - Current page number
 * @param {number} [options.limit=10] - Items per page
 * @param {string|Object} [options.sort='-createdAt'] - Sort option
 * @param {string|Object} [options.select=''] - Fields to select
 * @param {Array<Object>} [options.populate=[]] - Populate options
 * @returns {Promise<Object>} Paginated result
 */
const paginate = async (model, options = {}) => {
  const {
    filter = {},
    page: rawPage = 1,
    limit: rawLimit = 10,
    sort = '-createdAt',
    select = '',
    populate = [],
  } = options;

  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 10));
  const skip = (page - 1) * limit;

  const [docs, totalDocs] = await Promise.all([
    model
      .find(filter)
      .sort(sort)
      .select(select)
      .skip(skip)
      .limit(limit)
      .populate(populate)
      .lean(),
    model.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalDocs / limit);

  return {
    docs,
    pagination: {
      totalDocs,
      totalPages,
      page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    },
  };
};

module.exports = { paginate };
