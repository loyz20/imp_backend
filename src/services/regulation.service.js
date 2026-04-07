const SuratPesananKhusus = require('../models/SuratPesananKhusus');
const EReport = require('../models/EReport');
const RegulationDocument = require('../models/RegulationDocument');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');
const StockMutation = require('../models/StockMutation');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const {
  SP_TYPE,
  SP_STATUS,
  SP_STATUS_TRANSITIONS,
  EREPORT_STATUS,
  GOLONGAN_OBAT,
  REG_DOC_CATEGORY,
  REG_DOC_STATUS,
  MUTATION_TYPE,
  BATCH_STATUS,
} = require('../constants');

// ═══════════════════════════════════════════════════════════════
// ─── 1. SURAT PESANAN KHUSUS ───
// ═══════════════════════════════════════════════════════════════

const getSPList = async (queryParams) => {
  const { page, limit, type, status, search } = queryParams;
  const filter = {};

  if (type) filter.type = type;
  if (status) filter.status = status;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { spNumber: { $regex: escaped, $options: 'i' } },
    ];
  }

  return paginate(SuratPesananKhusus, {
    filter,
    page,
    limit,
    sort: '-createdAt',
    populate: [
      { path: 'supplier', select: 'name code' },
      { path: 'items.product', select: 'name sku code' },
      { path: 'createdBy', select: 'name' },
      { path: 'approvedBy', select: 'name' },
    ],
  });
};

const getSPStats = async () => {
  const [total, typeCounts, statusCounts] = await Promise.all([
    SuratPesananKhusus.countDocuments(),
    SuratPesananKhusus.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    SuratPesananKhusus.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const typeStats = {};
  for (const t of Object.values(SP_TYPE)) {
    typeStats[t] = 0;
  }
  for (const tc of typeCounts) {
    if (tc._id) typeStats[tc._id] = tc.count;
  }

  const byStatus = {};
  for (const s of Object.values(SP_STATUS)) {
    byStatus[s] = 0;
  }
  for (const sc of statusCounts) {
    if (sc._id) byStatus[sc._id] = sc.count;
  }

  return {
    total,
    ...typeStats,
    byStatus,
  };
};

const getSPById = async (id) => {
  const sp = await SuratPesananKhusus.findById(id)
    .populate('supplier', 'name code')
    .populate('items.product', 'name sku code')
    .populate('createdBy', 'name')
    .populate('approvedBy', 'name');

  if (!sp) {
    throw ApiError.notFound('Surat Pesanan tidak ditemukan');
  }
  return sp;
};

const createSP = async (data, userId) => {
  // Validate supplier exists
  const supplier = await Supplier.findById(data.supplier);
  if (!supplier) {
    throw ApiError.notFound('Supplier tidak ditemukan');
  }

  // Validate all products exist and match the SP type (golongan)
  const golonganMap = {
    [SP_TYPE.NARKOTIKA]: GOLONGAN_OBAT.NARKOTIKA,
    [SP_TYPE.PSIKOTROPIKA]: GOLONGAN_OBAT.PSIKOTROPIKA,
  };
  const requiredGolongan = golonganMap[data.type];

  for (const item of data.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      throw ApiError.notFound(`Produk dengan ID ${item.product} tidak ditemukan`);
    }
    // For narkotika and psikotropika, validate golongan matches
    if (requiredGolongan && product.golongan !== requiredGolongan) {
      throw ApiError.badRequest(
        `Produk "${product.name}" bukan golongan ${data.type}. Golongan produk: ${product.golongan}`,
      );
    }
  }

  // Validate validUntil is in the future
  if (new Date(data.validUntil) <= new Date()) {
    throw ApiError.badRequest('Tanggal berlaku harus di masa depan');
  }

  data.createdBy = userId;
  data.status = SP_STATUS.DRAFT;

  const sp = await SuratPesananKhusus.create(data);
  return sp.populate([
    { path: 'supplier', select: 'name code' },
    { path: 'items.product', select: 'name sku code' },
    { path: 'createdBy', select: 'name' },
  ]);
};

const updateSPStatus = async (id, newStatus, userId, rejectReason) => {
  const sp = await SuratPesananKhusus.findById(id);
  if (!sp) {
    throw ApiError.notFound('Surat Pesanan tidak ditemukan');
  }

  // Validate transition
  const allowedTransitions = SP_STATUS_TRANSITIONS[sp.status];
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    throw ApiError.badRequest(
      `Tidak bisa mengubah status dari "${sp.status}" ke "${newStatus}"`,
    );
  }

  // Reject reason required for rejection
  if (newStatus === SP_STATUS.REJECTED && !rejectReason) {
    throw ApiError.badRequest('Alasan penolakan wajib diisi');
  }

  sp.status = newStatus;

  if (newStatus === SP_STATUS.APPROVED) {
    sp.approvedBy = userId;
    sp.approvedAt = new Date();
  }

  if (newStatus === SP_STATUS.REJECTED) {
    sp.rejectReason = rejectReason;
  }

  await sp.save();

  return sp.populate([
    { path: 'supplier', select: 'name code' },
    { path: 'items.product', select: 'name sku code' },
    { path: 'createdBy', select: 'name' },
    { path: 'approvedBy', select: 'name' },
  ]);
};

// Auto-expire SP that have passed validUntil
const expireOverdueSP = async () => {
  const now = new Date();
  await SuratPesananKhusus.updateMany(
    {
      status: SP_STATUS.APPROVED,
      validUntil: { $lt: now },
    },
    { $set: { status: SP_STATUS.EXPIRED } },
  );
};

// ═══════════════════════════════════════════════════════════════
// ─── 2. E-REPORT BPOM ───
// ═══════════════════════════════════════════════════════════════

const getEReports = async (queryParams) => {
  const { page, limit, type, status } = queryParams;
  const filter = {};

  if (type) filter.type = type;
  if (status) filter.status = status;

  return paginate(EReport, {
    filter,
    page,
    limit,
    sort: '-createdAt',
    populate: [
      { path: 'createdBy', select: 'name' },
      { path: 'submittedBy', select: 'name' },
    ],
  });
};

const getEReportStats = async () => {
  const statusCounts = await EReport.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const stats = { total: 0 };
  for (const s of Object.values(EREPORT_STATUS)) {
    stats[s] = 0;
  }
  for (const sc of statusCounts) {
    if (sc._id) {
      stats[sc._id] = sc.count;
      stats.total += sc.count;
    }
  }

  return stats;
};

const generateEReport = async (data, userId) => {
  const { period, type } = data;

  // Check if report for this period+type already exists
  const existing = await EReport.findOne({ period, type });
  if (existing) {
    throw ApiError.conflict(
      `Laporan ${type} untuk periode ${period} sudah ada (${existing.reportNumber})`,
    );
  }

  // Determine the month range
  const [year, month] = period.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  // Map SP type to product golongan
  const golonganMap = {
    [SP_TYPE.NARKOTIKA]: GOLONGAN_OBAT.NARKOTIKA,
    [SP_TYPE.PSIKOTROPIKA]: GOLONGAN_OBAT.PSIKOTROPIKA,
  };
  const golongan = golonganMap[type];

  // Get all products matching the golongan
  const productFilter = { isActive: true };
  if (golongan) {
    productFilter.golongan = golongan;
  } else {
    // For prekursor, we'll filter products that have prekursor-related flag
    // Since there's no prekursor golongan, use products tagged via naming or category
    // For now, return empty if no matching golongan
    productFilter.golongan = 'prekursor';
  }

  const products = await Product.find(productFilter).select('_id name sku').lean();

  if (products.length === 0) {
    throw ApiError.notFound(`Tidak ada produk dengan golongan "${type}" ditemukan`);
  }

  const items = [];

  for (const product of products) {
    // qtyIn: sum of incoming mutations in the period
    const inAgg = await StockMutation.aggregate([
      {
        $match: {
          productId: product._id,
          type: MUTATION_TYPE.IN,
          mutationDate: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);

    // qtyOut: sum of outgoing mutations (stored as negative, so use Math.abs)
    const outAgg = await StockMutation.aggregate([
      {
        $match: {
          productId: product._id,
          type: MUTATION_TYPE.OUT,
          mutationDate: { $gte: startDate, $lte: endDate },
        },
      },
      { $group: { _id: null, total: { $sum: { $abs: '$quantity' } } } },
    ]);

    // stockEnd: sum of active batches at end of period
    const stockAgg = await StockBatch.aggregate([
      {
        $match: {
          productId: product._id,
          status: BATCH_STATUS.ACTIVE,
        },
      },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);

    const qtyIn = (inAgg[0] || {}).total || 0;
    const qtyOut = (outAgg[0] || {}).total || 0;
    const stockEnd = (stockAgg[0] || {}).total || 0;

    // Only include products that had any movement or have stock
    if (qtyIn > 0 || qtyOut > 0 || stockEnd > 0) {
      items.push({
        product: product._id,
        productName: product.name,
        qtyIn,
        qtyOut,
        stockEnd,
      });
    }
  }

  const report = await EReport.create({
    period,
    type,
    items,
    status: EREPORT_STATUS.DRAFT,
    createdBy: userId,
  });

  return report.populate([
    { path: 'createdBy', select: 'name' },
  ]);
};

const submitEReport = async (id, userId) => {
  const report = await EReport.findById(id);
  if (!report) {
    throw ApiError.notFound('e-Report tidak ditemukan');
  }

  if (![EREPORT_STATUS.DRAFT, EREPORT_STATUS.REJECTED].includes(report.status)) {
    throw ApiError.badRequest(
      `e-Report hanya bisa di-submit dari status draft atau rejected, status saat ini: "${report.status}"`,
    );
  }

  report.status = EREPORT_STATUS.SUBMITTED;
  report.submittedBy = userId;
  report.submittedAt = new Date();
  report.rejectReason = null;
  await report.save();

  return report.populate([
    { path: 'createdBy', select: 'name' },
    { path: 'submittedBy', select: 'name' },
  ]);
};

// ═══════════════════════════════════════════════════════════════
// ─── 3. DOKUMEN PERIZINAN ───
// ═══════════════════════════════════════════════════════════════

const getDocuments = async () => {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Get company documents from AppSetting
  const settings = await AppSetting.findOne();
  const companyDocs = [];

  if (settings) {
    const licenses = settings.company?.licenses || {};
    const pharmacist = settings.company?.responsiblePharmacist || {};

    const licenseEntries = [
      { type: 'PBF', data: licenses.pbf },
      { type: 'SIUP', data: licenses.siup },
      { type: 'TDP', data: licenses.tdp },
      { type: 'NIB', data: licenses.nib ? { number: licenses.nib.number } : null },
      { type: 'CDOB', data: licenses.cdob },
    ];

    for (const entry of licenseEntries) {
      if (!entry.data) continue;
      const doc = {
        type: entry.type,
        number: entry.data.number || null,
        issuedDate: entry.data.issuedDate || null,
        expiryDate: entry.data.expiryDate || null,
        holder: null,
      };
      // Compute status
      if (!doc.expiryDate) {
        doc.status = REG_DOC_STATUS.ACTIVE;
      } else if (new Date(doc.expiryDate) <= now) {
        doc.status = REG_DOC_STATUS.EXPIRED;
      } else if (new Date(doc.expiryDate) <= thirtyDays) {
        doc.status = REG_DOC_STATUS.EXPIRING_SOON;
      } else {
        doc.status = REG_DOC_STATUS.ACTIVE;
      }

      // Check if we have an uploaded file in RegulationDocument
      const regDoc = await RegulationDocument.findOne({
        category: REG_DOC_CATEGORY.COMPANY,
        type: entry.type,
      }).lean();
      if (regDoc) {
        doc._id = regDoc._id;
        doc.fileName = regDoc.fileName;
      }

      companyDocs.push(doc);
    }

    // SIPA & STRA from pharmacist
    if (pharmacist.sipaNumber || pharmacist.sipaExpiry) {
      const sipaDoc = {
        type: 'SIPA',
        number: pharmacist.sipaNumber || null,
        issuedDate: null,
        expiryDate: pharmacist.sipaExpiry || null,
        holder: pharmacist.name || null,
      };
      if (!sipaDoc.expiryDate) {
        sipaDoc.status = REG_DOC_STATUS.ACTIVE;
      } else if (new Date(sipaDoc.expiryDate) <= now) {
        sipaDoc.status = REG_DOC_STATUS.EXPIRED;
      } else if (new Date(sipaDoc.expiryDate) <= thirtyDays) {
        sipaDoc.status = REG_DOC_STATUS.EXPIRING_SOON;
      } else {
        sipaDoc.status = REG_DOC_STATUS.ACTIVE;
      }
      const regDoc = await RegulationDocument.findOne({
        category: REG_DOC_CATEGORY.COMPANY,
        type: 'SIPA',
      }).lean();
      if (regDoc) {
        sipaDoc._id = regDoc._id;
        sipaDoc.fileName = regDoc.fileName;
      }
      companyDocs.push(sipaDoc);
    }

    if (pharmacist.straNumber || pharmacist.straExpiry) {
      const straDoc = {
        type: 'STRA',
        number: pharmacist.straNumber || null,
        issuedDate: null,
        expiryDate: pharmacist.straExpiry || null,
        holder: pharmacist.name || null,
      };
      if (!straDoc.expiryDate) {
        straDoc.status = REG_DOC_STATUS.ACTIVE;
      } else if (new Date(straDoc.expiryDate) <= now) {
        straDoc.status = REG_DOC_STATUS.EXPIRED;
      } else if (new Date(straDoc.expiryDate) <= thirtyDays) {
        straDoc.status = REG_DOC_STATUS.EXPIRING_SOON;
      } else {
        straDoc.status = REG_DOC_STATUS.ACTIVE;
      }
      const regDoc = await RegulationDocument.findOne({
        category: REG_DOC_CATEGORY.COMPANY,
        type: 'STRA',
      }).lean();
      if (regDoc) {
        straDoc._id = regDoc._id;
        straDoc.fileName = regDoc.fileName;
      }
      companyDocs.push(straDoc);
    }
  }

  // Get supplier license documents
  const suppliers = await Supplier.find({ isActive: true })
    .select('name pbfLicense cdobCertificate')
    .lean();

  const supplierDocs = [];
  for (const s of suppliers) {
    if (s.cdobCertificate?.number || s.cdobCertificate?.expiryDate) {
      const doc = {
        entityName: s.name,
        type: 'CDOB',
        number: s.cdobCertificate.number || null,
        expiryDate: s.cdobCertificate.expiryDate || null,
      };
      if (!doc.expiryDate) {
        doc.status = REG_DOC_STATUS.ACTIVE;
      } else if (new Date(doc.expiryDate) <= now) {
        doc.status = REG_DOC_STATUS.EXPIRED;
      } else if (new Date(doc.expiryDate) <= thirtyDays) {
        doc.status = REG_DOC_STATUS.EXPIRING_SOON;
      } else {
        doc.status = REG_DOC_STATUS.ACTIVE;
      }
      supplierDocs.push(doc);
    }
    if (s.pbfLicense?.number || s.pbfLicense?.expiryDate) {
      const doc = {
        entityName: s.name,
        type: 'PBF',
        number: s.pbfLicense.number || null,
        expiryDate: s.pbfLicense.expiryDate || null,
      };
      if (!doc.expiryDate) {
        doc.status = REG_DOC_STATUS.ACTIVE;
      } else if (new Date(doc.expiryDate) <= now) {
        doc.status = REG_DOC_STATUS.EXPIRED;
      } else if (new Date(doc.expiryDate) <= thirtyDays) {
        doc.status = REG_DOC_STATUS.EXPIRING_SOON;
      } else {
        doc.status = REG_DOC_STATUS.ACTIVE;
      }
      supplierDocs.push(doc);
    }
  }

  // Get customer SIA documents
  const customers = await Customer.find({ isActive: true })
    .select('name type siaLicense')
    .lean();

  const customerDocs = [];
  for (const c of customers) {
    const sia = c.siaLicense || {};
    if (sia.number || sia.expiryDate) {
      const doc = {
        entityName: c.name,
        customerType: c.type,
        siaNumber: sia.number || null,
        siaExpiry: sia.expiryDate || null,
      };
      if (!doc.siaExpiry) {
        doc.status = REG_DOC_STATUS.ACTIVE;
      } else if (new Date(doc.siaExpiry) <= now) {
        doc.status = REG_DOC_STATUS.EXPIRED;
      } else if (new Date(doc.siaExpiry) <= thirtyDays) {
        doc.status = REG_DOC_STATUS.EXPIRING_SOON;
      } else {
        doc.status = REG_DOC_STATUS.ACTIVE;
      }
      customerDocs.push(doc);
    }
  }

  return {
    company: companyDocs,
    supplier: supplierDocs,
    customer: customerDocs,
  };
};

const getDocStats = async () => {
  const docs = await getDocuments();
  const all = [
    ...docs.company,
    ...docs.supplier,
    ...docs.customer,
  ];

  return {
    total: all.length,
    active: all.filter((d) => d.status === REG_DOC_STATUS.ACTIVE).length,
    expiringSoon: all.filter((d) => d.status === REG_DOC_STATUS.EXPIRING_SOON).length,
    expired: all.filter((d) => d.status === REG_DOC_STATUS.EXPIRED).length,
  };
};

const uploadDocument = async (id, file, userId) => {
  // Find or create regulation document record
  let regDoc = await RegulationDocument.findById(id);

  if (!regDoc) {
    throw ApiError.notFound('Dokumen tidak ditemukan');
  }

  regDoc.fileName = file.originalname;
  regDoc.filePath = file.path;
  regDoc.uploadedAt = new Date();
  regDoc.updatedBy = userId;
  await regDoc.save();

  return regDoc;
};

// Ensure RegulationDocument records exist for company docs (call on init/sync)
const syncCompanyDocuments = async () => {
  const types = ['PBF', 'SIUP', 'TDP', 'NIB', 'CDOB', 'SIPA', 'STRA'];
  for (const type of types) {
    const exists = await RegulationDocument.findOne({
      category: REG_DOC_CATEGORY.COMPANY,
      type,
    });
    if (!exists) {
      await RegulationDocument.create({
        category: REG_DOC_CATEGORY.COMPANY,
        type,
      });
    }
  }
};

module.exports = {
  // SP
  getSPList,
  getSPStats,
  getSPById,
  createSP,
  updateSPStatus,
  expireOverdueSP,
  // e-Report
  getEReports,
  getEReportStats,
  generateEReport,
  submitEReport,
  // Documents
  getDocuments,
  getDocStats,
  uploadDocument,
  syncCompanyDocuments,
};
