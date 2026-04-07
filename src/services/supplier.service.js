const Supplier = require('../models/Supplier');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const { SUPPLIER_TYPE } = require('../constants');

const supplierTypes = Object.values(SUPPLIER_TYPE);

/**
 * Get all suppliers with filtering, search, and pagination
 */
const getSuppliers = async (queryParams) => {
  const { page, limit, search, type, city, isActive, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { code: { $regex: escaped, $options: 'i' } },
      { contactPerson: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (type) filter.type = type;
  if (city) filter['address.city'] = { $regex: city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (typeof isActive !== 'undefined') {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  return paginate(Supplier, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
  });
};

/**
 * Get supplier statistics
 */
const getStats = async () => {
  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [
    total,
    active,
    inactive,
    typeCounts,
    expiredLicense,
    nearExpiryLicense,
    cityCounts,
  ] = await Promise.all([
    Supplier.countDocuments(),
    Supplier.countDocuments({ isActive: true }),
    Supplier.countDocuments({ isActive: false }),
    Supplier.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    Supplier.countDocuments({
      'pbfLicense.expiryDate': { $lt: now, $ne: null },
    }),
    Supplier.countDocuments({
      'pbfLicense.expiryDate': { $gte: now, $lte: ninetyDaysFromNow },
    }),
    Supplier.aggregate([
      { $match: { 'address.city': { $ne: null, $ne: '' } } },
      { $group: { _id: '$address.city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  // Build type stats
  const typeStats = {};
  for (const t of supplierTypes) {
    typeStats[t] = 0;
  }
  for (const tc of typeCounts) {
    if (tc._id) typeStats[tc._id] = tc.count;
  }

  // Build city stats (top cities + "Lainnya")
  const byCity = {};
  const topCount = 7;
  let otherCount = 0;
  cityCounts.forEach((c, i) => {
    if (i < topCount) {
      byCity[c._id] = c.count;
    } else {
      otherCount += c.count;
    }
  });
  if (otherCount > 0) {
    byCity['Lainnya'] = otherCount;
  }

  return {
    total,
    active,
    inactive,
    ...typeStats,
    expiredLicense,
    nearExpiryLicense,
    byCity,
  };
};

/**
 * Get supplier by ID
 */
const getSupplierById = async (id) => {
  const supplier = await Supplier.findById(id)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!supplier) {
    throw ApiError.notFound('Supplier tidak ditemukan');
  }

  return supplier;
};

/**
 * Create a new supplier
 */
const createSupplier = async (data, userId) => {
  // Check duplicate name (case-insensitive)
  const existingName = await Supplier.findOne({
    name: { $regex: `^${data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existingName) {
    throw ApiError.conflict('Supplier dengan nama tersebut sudah ada');
  }

  // Check duplicate code if provided
  if (data.code) {
    const existingCode = await Supplier.findOne({ code: data.code });
    if (existingCode) {
      throw ApiError.conflict('Supplier dengan kode tersebut sudah ada');
    }
  }

  data.createdBy = userId;
  data.updatedBy = userId;

  return Supplier.create(data);
};

/**
 * Update a supplier
 */
const updateSupplier = async (id, data, userId) => {
  const supplier = await Supplier.findById(id);
  if (!supplier) {
    throw ApiError.notFound('Supplier tidak ditemukan');
  }

  // Check duplicate name (case-insensitive, exclude current)
  if (data.name) {
    const existingName = await Supplier.findOne({
      _id: { $ne: id },
      name: { $regex: `^${data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (existingName) {
      throw ApiError.conflict('Supplier dengan nama tersebut sudah ada');
    }
  }

  // Check duplicate code (exclude current)
  if (data.code) {
    const existingCode = await Supplier.findOne({
      _id: { $ne: id },
      code: data.code,
    });
    if (existingCode) {
      throw ApiError.conflict('Supplier dengan kode tersebut sudah ada');
    }
  }

  data.updatedBy = userId;

  Object.assign(supplier, data);
  await supplier.save();

  return supplier;
};

/**
 * Delete a supplier
 */
const deleteSupplier = async (id) => {
  const supplier = await Supplier.findById(id);
  if (!supplier) {
    throw ApiError.notFound('Supplier tidak ditemukan');
  }

  
  await supplier.deleteOne();
};

/**
 * Change supplier status (activate/deactivate)
 */
const changeStatus = async (id, isActive, userId) => {
  const supplier = await Supplier.findById(id);
  if (!supplier) {
    throw ApiError.notFound('Supplier tidak ditemukan');
  }

  supplier.isActive = isActive;
  supplier.updatedBy = userId;
  await supplier.save();

  return supplier;
};

module.exports = {
  getSuppliers,
  getStats,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  changeStatus,
};
