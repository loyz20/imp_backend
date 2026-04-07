const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');

/**
 * Get paginated list of products with search & filter
 */
const getProducts = async (queryParams) => {
  const {
    page, limit, search, category, golongan,
    isActive, manufacturer, suhuPenyimpanan, sort,
  } = queryParams;

  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { nie: { $regex: search, $options: 'i' } },
      { barcode: { $regex: search, $options: 'i' } },
      { zatAktif: { $regex: search, $options: 'i' } },
    ];
  }

  if (category) filter.category = category;
  if (golongan) filter.golongan = golongan;
  if (manufacturer) filter.manufacturer = { $regex: manufacturer, $options: 'i' };
  if (suhuPenyimpanan) filter.suhuPenyimpanan = suhuPenyimpanan;

  if (typeof isActive !== 'undefined') {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  return paginate(Product, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
    populate: [
      { path: 'createdBy', select: 'name' },
      { path: 'updatedBy', select: 'name' },
    ],
  });
};

/**
 * Get product statistics for dashboard
 */
const getProductStats = async () => {
  const [statusStats, categoryStats, golonganStats, suhuStats] = await Promise.all([
    Product.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          inactive: { $sum: { $cond: ['$isActive', 0, 1] } },
        },
      },
    ]),
    Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $group: { _id: '$golongan', count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $group: { _id: '$suhuPenyimpanan', count: { $sum: 1 } } },
    ]),
  ]);

  const base = statusStats[0] || { total: 0, active: 0, inactive: 0 };

  const byCategory = {};
  categoryStats.forEach((s) => { byCategory[s._id] = s.count; });

  const byGolongan = {};
  golonganStats.forEach((s) => { byGolongan[s._id] = s.count; });

  const bySuhuPenyimpanan = {};
  suhuStats.forEach((s) => { bySuhuPenyimpanan[s._id] = s.count; });

  return {
    total: base.total,
    active: base.active,
    inactive: base.inactive,
    byCategory,
    byGolongan,
    bySuhuPenyimpanan,
  };
};

/**
 * Get single product by ID
 */
const getProductById = async (productId) => {
  const product = await Product.findById(productId)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  return product;
};

/**
 * Create a new product
 */
const createProduct = async (productData, userId) => {
  // Check duplicate name (case-insensitive)
  const existingName = await Product.findOne({
    name: { $regex: `^${productData.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existingName) {
    throw ApiError.conflict('Product with this name already exists');
  }

  // Check duplicate SKU if provided
  if (productData.sku) {
    const existingSku = await Product.findOne({ sku: productData.sku });
    if (existingSku) {
      throw ApiError.conflict('SKU already exists');
    }
  }

  // Check duplicate barcode if provided
  if (productData.barcode) {
    const existingBarcode = await Product.findOne({ barcode: productData.barcode });
    if (existingBarcode) {
      throw ApiError.conflict('Barcode already exists');
    }
  }

  productData.createdBy = userId;
  productData.updatedBy = userId;

  const product = await Product.create(productData);
  return product;
};

/**
 * Update product by ID
 */
const updateProduct = async (productId, updateData, userId) => {
  const product = await Product.findById(productId);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  // Check duplicate name if being updated
  if (updateData.name) {
    const existingName = await Product.findOne({
      name: { $regex: `^${updateData.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      _id: { $ne: productId },
    });
    if (existingName) {
      throw ApiError.conflict('Product with this name already exists');
    }
  }

  // Check duplicate SKU if being updated
  if (updateData.sku) {
    const existingSku = await Product.findOne({
      sku: updateData.sku,
      _id: { $ne: productId },
    });
    if (existingSku) {
      throw ApiError.conflict('SKU already exists');
    }
  }

  // Check duplicate barcode if being updated
  if (updateData.barcode) {
    const existingBarcode = await Product.findOne({
      barcode: updateData.barcode,
      _id: { $ne: productId },
    });
    if (existingBarcode) {
      throw ApiError.conflict('Barcode already exists');
    }
  }

  updateData.updatedBy = userId;

  const updated = await Product.findByIdAndUpdate(
    productId,
    { $set: updateData },
    { new: true, runValidators: true },
  )
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  return updated;
};

/**
 * Delete product (soft delete)
 */
const deleteProduct = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  product.isActive = false;
  await product.save({ validateModifiedOnly: true });

  return product;
};

/**
 * Change product status
 */
const changeStatus = async (productId, isActive, userId) => {
  const product = await Product.findById(productId);
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  product.isActive = isActive;
  product.updatedBy = userId;
  await product.save({ validateModifiedOnly: true });

  return product;
};

module.exports = {
  getProducts,
  getProductStats,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  changeStatus,
};
