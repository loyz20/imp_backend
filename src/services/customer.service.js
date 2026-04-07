const Customer = require('../models/Customer');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const { CUSTOMER_TYPE } = require('../constants');

const customerTypes = Object.values(CUSTOMER_TYPE);

/**
 * Get all customers with filtering, search, and pagination
 */
const getCustomers = async (queryParams) => {
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
  if (typeof isActive !== 'undefined' && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  return paginate(Customer, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
  });
};

/**
 * Get customer statistics
 */
const getStats = async () => {
  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [
    total,
    active,
    inactive,
    typeCounts,
    expiredSIA,
    nearExpirySIA,
    cityCounts,
  ] = await Promise.all([
    Customer.countDocuments(),
    Customer.countDocuments({ isActive: true }),
    Customer.countDocuments({ isActive: false }),
    Customer.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    Customer.countDocuments({
      'siaLicense.expiryDate': { $lt: now, $ne: null },
    }),
    Customer.countDocuments({
      'siaLicense.expiryDate': { $gte: now, $lte: ninetyDaysFromNow },
    }),
    Customer.aggregate([
      { $match: { 'address.city': { $ne: null, $ne: '' } } },
      { $group: { _id: '$address.city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  // Build type stats with camelCase keys
  const typeKeyMap = {
    apotek: 'apotek',
    rumah_sakit: 'rumahSakit',
    klinik: 'klinik',
    puskesmas: 'puskesmas',
    toko_obat: 'tokoObat',
    pbf_lain: 'pbfLain',
  };
  const typeStats = {};
  for (const t of customerTypes) {
    typeStats[typeKeyMap[t] || t] = 0;
  }
  for (const tc of typeCounts) {
    if (tc._id && typeKeyMap[tc._id]) {
      typeStats[typeKeyMap[tc._id]] = tc.count;
    }
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
    expiredSIA,
    nearExpirySIA,
    overCreditLimit: 0,
    byCity,
  };
};

/**
 * Get customer by ID
 */
const getCustomerById = async (id) => {
  const customer = await Customer.findById(id)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!customer) {
    throw ApiError.notFound('Customer tidak ditemukan');
  }

  // Add transaction summary placeholder (to be implemented with SO module)
  const customerObj = customer.toJSON();
  customerObj.transactionSummary = {
    totalSalesOrders: 0,
    totalTransactionValue: 0,
    lastOrderDate: null,
    outstandingReceivable: 0,
    creditUtilization: 0,
  };

  return customerObj;
};

/**
 * Create a new customer
 */
const createCustomer = async (data, userId) => {
  // Validate type against settings
  const settings = await AppSetting.getSettings();
  if (settings?.customer?.customerTypes?.length) {
    if (!settings.customer.customerTypes.includes(data.type)) {
      throw ApiError.badRequest(`Tipe pelanggan '${data.type}' tidak diizinkan`);
    }
  }

  // Check SIA requirement from settings
  if (settings?.customer?.requireSIA && !data.siaLicense?.number) {
    throw ApiError.badRequest('Nomor SIA wajib diisi (sesuai pengaturan)');
  }

  // Check duplicate name (case-insensitive)
  const existingName = await Customer.findOne({
    name: { $regex: `^${data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  });
  if (existingName) {
    throw ApiError.conflict('Customer dengan nama tersebut sudah ada');
  }

  // Check duplicate code if provided
  if (data.code) {
    const existingCode = await Customer.findOne({ code: data.code });
    if (existingCode) {
      throw ApiError.conflict('Customer dengan kode tersebut sudah ada');
    }
  }

  // Apply default credit limit from settings if not provided
  if (data.creditLimit === undefined || data.creditLimit === null) {
    if (settings?.customer?.defaultCreditLimit !== undefined) {
      data.creditLimit = settings.customer.defaultCreditLimit;
    }
  }

  data.createdBy = userId;
  data.updatedBy = userId;

  return Customer.create(data);
};

/**
 * Update a customer
 */
const updateCustomer = async (id, data, userId) => {
  const customer = await Customer.findById(id);
  if (!customer) {
    throw ApiError.notFound('Customer tidak ditemukan');
  }

  // Validate type against settings if type is being changed
  if (data.type) {
    const settings = await AppSetting.getSettings();
    if (settings?.customer?.customerTypes?.length) {
      if (!settings.customer.customerTypes.includes(data.type)) {
        throw ApiError.badRequest(`Tipe pelanggan '${data.type}' tidak diizinkan`);
      }
    }

    // Check SIA requirement
    if (settings?.customer?.requireSIA) {
      const siaNumber = data.siaLicense?.number ?? customer.siaLicense?.number;
      if (!siaNumber) {
        throw ApiError.badRequest('Nomor SIA wajib diisi (sesuai pengaturan)');
      }
    }
  }

  // Check duplicate name (case-insensitive, exclude current)
  if (data.name) {
    const existingName = await Customer.findOne({
      _id: { $ne: id },
      name: { $regex: `^${data.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });
    if (existingName) {
      throw ApiError.conflict('Customer dengan nama tersebut sudah ada');
    }
  }

  // Check duplicate code (exclude current)
  if (data.code) {
    const existingCode = await Customer.findOne({
      _id: { $ne: id },
      code: data.code,
    });
    if (existingCode) {
      throw ApiError.conflict('Customer dengan kode tersebut sudah ada');
    }
  }

  data.updatedBy = userId;

  Object.assign(customer, data);
  await customer.save();

  return customer;
};

/**
 * Delete a customer
 */
const deleteCustomer = async (id) => {
  const customer = await Customer.findById(id);
  if (!customer) {
    throw ApiError.notFound('Customer tidak ditemukan');
  }

  
  await customer.deleteOne();
};

/**
 * Change customer status (activate/deactivate)
 */
const changeStatus = async (id, isActive, userId) => {
  const customer = await Customer.findById(id);
  if (!customer) {
    throw ApiError.notFound('Customer tidak ditemukan');
  }

  customer.isActive = isActive;
  customer.updatedBy = userId;
  await customer.save();

  return customer;
};

module.exports = {
  getCustomers,
  getStats,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  changeStatus,
};
