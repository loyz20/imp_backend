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
const config = require('../config');
const { getMySQLPool } = require('../config/database');
const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════════════
// ─── 1. SURAT PESANAN KHUSUS ───
// ═══════════════════════════════════════════════════════════════

const mongoGetSPList = async (queryParams) => {
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

const mongoGetSPStats = async () => {
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

const mongoGetSPById = async (id) => {
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

const mongoCreateSP = async (data, userId) => {
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

const mongoUpdateSPStatus = async (id, newStatus, userId, rejectReason) => {
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
const mongoExpireOverdueSP = async () => {
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

const mongoGetEReports = async (queryParams) => {
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

const mongoGetEReportStats = async () => {
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

const mongoGenerateEReport = async (data, userId) => {
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

const mongoSubmitEReport = async (id, userId) => {
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

const mongoGetDocuments = async () => {
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
    .select('name izinSarana cdobCdakb sipSik')
    .lean();

  const supplierDocs = [];
  for (const s of suppliers) {
    if (s.cdobCdakb?.number || s.cdobCdakb?.expiryDate) {
      const doc = {
        entityName: s.name,
        type: 'CDOB/CDAKB',
        number: s.cdobCdakb.number || null,
        expiryDate: s.cdobCdakb.expiryDate || null,
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
    if (s.izinSarana?.number || s.izinSarana?.expiryDate) {
      const doc = {
        entityName: s.name,
        type: 'Izin Sarana',
        number: s.izinSarana.number || null,
        expiryDate: s.izinSarana.expiryDate || null,
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
    if (s.sipSik?.number || s.sipSik?.expiryDate) {
      const doc = {
        entityName: s.name,
        type: 'SIP/SIK',
        number: s.sipSik.number || null,
        expiryDate: s.sipSik.expiryDate || null,
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

  // Get customer Izin Sarana documents
  const customers = await Customer.find({ isActive: true })
    .select('name type izinSarana')
    .lean();

  const customerDocs = [];
  for (const c of customers) {
    const izin = c.izinSarana || {};
    if (izin.number || izin.expiryDate) {
      const doc = {
        entityName: c.name,
        customerType: c.type,
        siaNumber: izin.number || null,
        siaExpiry: izin.expiryDate || null,
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

const mongoGetDocStats = async () => {
  const docs = await mongoGetDocuments();
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

const mongoUploadDocument = async (id, file, userId) => {
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
const mongoSyncCompanyDocuments = async () => {
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

// ═══════════════════════════════════════════════════════════════
// ─── MySQL Implementations ───
// ═══════════════════════════════════════════════════════════════

const mapSPRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  spNumber: row.sp_number, date: row.date, type: row.type,
  supplier: row.supplier_id ? { _id: row.supplier_id, id: row.supplier_id, name: row.supplier_name, code: row.supplier_code } : null,
  validUntil: row.valid_until, status: row.status, notes: row.notes, rejectReason: row.reject_reason,
  items: items.map((i) => ({
    product: { _id: i.product_id, id: i.product_id, name: i.product_name, sku: i.product_sku, code: i.product_code },
    qty: i.qty, unit: i.unit,
  })),
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  approvedBy: row.approved_by ? { _id: row.approved_by, name: row.approved_by_name } : null,
  approvedAt: row.approved_at,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapEReportRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  reportNumber: row.report_number, period: row.period, type: row.type, status: row.status,
  rejectReason: row.reject_reason,
  items: items.map((i) => ({ product: i.product_id, productName: i.product_name, qtyIn: i.qty_in, qtyOut: i.qty_out, stockEnd: i.stock_end })),
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  submittedBy: row.submitted_by ? { _id: row.submitted_by, name: row.submitted_by_name } : null,
  submittedAt: row.submitted_at, receivedAt: row.received_at,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const mysqlGetSPWithItems = async (pool, id) => {
  const [[row]] = await pool.query(
    `SELECT sp.*, s.name as supplier_name, s.code as supplier_code, u1.name as created_by_name, u2.name as approved_by_name
     FROM surat_pesanan_khusus sp LEFT JOIN suppliers s ON sp.supplier_id = s.id LEFT JOIN users u1 ON sp.created_by = u1.id LEFT JOIN users u2 ON sp.approved_by = u2.id
     WHERE sp.id = ? LIMIT 1`, [id],
  );
  if (!row) return null;
  const [items] = await pool.query(
    `SELECT si.*, p.name as product_name, p.sku as product_sku, p.code as product_code
     FROM sp_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sp_id = ? ORDER BY si.sort_order`, [id],
  );
  return mapSPRow(row, items);
};

const mysqlGetSPList = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, type, status, search } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const where = []; const params = [];
  if (type) { where.push('sp.type = ?'); params.push(type); }
  if (status) { where.push('sp.status = ?'); params.push(status); }
  if (search) { where.push('sp.sp_number LIKE ?'); params.push(`%${search}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM surat_pesanan_khusus sp ${w}`, params);
  const [rows] = await pool.query(
    `SELECT sp.*, s.name as supplier_name, s.code as supplier_code, u1.name as created_by_name, u2.name as approved_by_name
     FROM surat_pesanan_khusus sp LEFT JOIN suppliers s ON sp.supplier_id = s.id LEFT JOIN users u1 ON sp.created_by = u1.id LEFT JOIN users u2 ON sp.approved_by = u2.id
     ${w} ORDER BY sp.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset],
  );
  const spIds = rows.map((r) => r.id); let itemsMap = {};
  if (spIds.length > 0) {
    const [allItems] = await pool.query(
      `SELECT si.*, p.name as product_name, p.sku as product_sku, p.code as product_code
       FROM sp_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sp_id IN (${spIds.map(() => '?').join(',')}) ORDER BY si.sort_order`, spIds,
    );
    for (const item of allItems) { (itemsMap[item.sp_id] = itemsMap[item.sp_id] || []).push(item); }
  }
  return { docs: rows.map((r) => mapSPRow(r, itemsMap[r.id] || [])), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetSPStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [typeRows] = await pool.query('SELECT type, COUNT(*) as count FROM surat_pesanan_khusus GROUP BY type');
  const [statusRows] = await pool.query('SELECT status, COUNT(*) as count FROM surat_pesanan_khusus GROUP BY status');
  const typeStats = {}; for (const t of Object.values(SP_TYPE)) typeStats[t] = 0;
  for (const tc of typeRows) if (tc.type) typeStats[tc.type] = tc.count;
  const byStatus = {}; for (const s of Object.values(SP_STATUS)) byStatus[s] = 0;
  let total = 0; for (const sc of statusRows) { if (sc.status) { byStatus[sc.status] = sc.count; total += sc.count; } }
  return { total, ...typeStats, byStatus };
};

const mysqlGetSPById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const sp = await mysqlGetSPWithItems(pool, id);
  if (!sp) throw ApiError.notFound('Surat Pesanan tidak ditemukan');
  return sp;
};

const mysqlGenerateSPNumber = async (pool, type) => {
  const typePrefix = { [SP_TYPE.NARKOTIKA]: 'NK', [SP_TYPE.PSIKOTROPIKA]: 'PS', [SP_TYPE.PREKURSOR]: 'PK' };
  const prefix = typePrefix[type] || 'SP';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const datePrefix = `SP-${prefix}/${year}/${month}/`;
  const [rows] = await pool.query('SELECT sp_number FROM surat_pesanan_khusus WHERE sp_number LIKE ? ORDER BY sp_number DESC LIMIT 1', [`${datePrefix}%`]);
  let nextNum = 1;
  if (rows.length > 0) { const parts = rows[0].sp_number.split('/'); const last = parseInt(parts[parts.length - 1], 10); if (!isNaN(last)) nextNum = last + 1; }
  return `${datePrefix}${String(nextNum).padStart(3, '0')}`;
};

const mysqlCreateSP = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[supplier]] = await pool.query('SELECT id, name FROM suppliers WHERE id = ? LIMIT 1', [data.supplier]);
  if (!supplier) throw ApiError.notFound('Supplier tidak ditemukan');
  const golonganMap = { [SP_TYPE.NARKOTIKA]: GOLONGAN_OBAT.NARKOTIKA, [SP_TYPE.PSIKOTROPIKA]: GOLONGAN_OBAT.PSIKOTROPIKA };
  const requiredGolongan = golonganMap[data.type];
  for (const item of data.items) {
    const [[product]] = await pool.query('SELECT id, name, golongan FROM products WHERE id = ? LIMIT 1', [item.product]);
    if (!product) throw ApiError.notFound(`Produk dengan ID ${item.product} tidak ditemukan`);
    if (requiredGolongan && product.golongan !== requiredGolongan) throw ApiError.badRequest(`Produk "${product.name}" bukan golongan ${data.type}. Golongan produk: ${product.golongan}`);
  }
  if (new Date(data.validUntil) <= new Date()) throw ApiError.badRequest('Tanggal berlaku harus di masa depan');
  const id = new mongoose.Types.ObjectId().toString();
  const spNumber = await mysqlGenerateSPNumber(pool, data.type);
  await pool.query('INSERT INTO surat_pesanan_khusus (id, sp_number, date, type, supplier_id, valid_until, status, notes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())', [id, spNumber, data.date || new Date(), data.type, data.supplier, data.validUntil, SP_STATUS.DRAFT, data.notes || null, userId]);
  for (let i = 0; i < (data.items || []).length; i++) {
    const item = data.items[i]; const itemId = new mongoose.Types.ObjectId().toString();
    await pool.query('INSERT INTO sp_items (id, sp_id, product_id, qty, unit, sort_order) VALUES (?,?,?,?,?,?)', [itemId, id, item.product, item.qty, item.unit, i]);
  }
  return mysqlGetSPWithItems(pool, id);
};

const mysqlUpdateSPStatus = async (id, newStatus, userId, rejectReason) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[sp]] = await pool.query('SELECT id, status FROM surat_pesanan_khusus WHERE id = ? LIMIT 1', [id]);
  if (!sp) throw ApiError.notFound('Surat Pesanan tidak ditemukan');
  const allowed = SP_STATUS_TRANSITIONS[sp.status];
  if (!allowed || !allowed.includes(newStatus)) throw ApiError.badRequest(`Tidak bisa mengubah status dari "${sp.status}" ke "${newStatus}"`);
  if (newStatus === SP_STATUS.REJECTED && !rejectReason) throw ApiError.badRequest('Alasan penolakan wajib diisi');
  const sets = ['status = ?', 'updated_at = NOW()']; const vals = [newStatus];
  if (newStatus === SP_STATUS.APPROVED) { sets.push('approved_by = ?', 'approved_at = NOW()'); vals.push(userId); }
  if (newStatus === SP_STATUS.REJECTED) { sets.push('reject_reason = ?'); vals.push(rejectReason); }
  vals.push(id);
  await pool.query(`UPDATE surat_pesanan_khusus SET ${sets.join(', ')} WHERE id = ?`, vals);
  return mysqlGetSPWithItems(pool, id);
};

const mysqlExpireOverdueSP = async () => {
  const pool = getMySQLPool();
  if (!pool) return;
  await pool.query("UPDATE surat_pesanan_khusus SET status = ?, updated_at = NOW() WHERE status = ? AND valid_until < NOW()", [SP_STATUS.EXPIRED, SP_STATUS.APPROVED]);
};

// ─── MySQL: E-Reports ───

const mysqlGetEReportWithItems = async (pool, id) => {
  const [[row]] = await pool.query(
    'SELECT er.*, u1.name as created_by_name, u2.name as submitted_by_name FROM e_reports er LEFT JOIN users u1 ON er.created_by = u1.id LEFT JOIN users u2 ON er.submitted_by = u2.id WHERE er.id = ? LIMIT 1', [id],
  );
  if (!row) return null;
  const [items] = await pool.query('SELECT * FROM e_report_items WHERE report_id = ? ORDER BY sort_order', [id]);
  return mapEReportRow(row, items);
};

const mysqlGetEReports = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, type, status } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const where = []; const params = [];
  if (type) { where.push('er.type = ?'); params.push(type); }
  if (status) { where.push('er.status = ?'); params.push(status); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM e_reports er ${w}`, params);
  const [rows] = await pool.query(
    `SELECT er.*, u1.name as created_by_name, u2.name as submitted_by_name FROM e_reports er LEFT JOIN users u1 ON er.created_by = u1.id LEFT JOIN users u2 ON er.submitted_by = u2.id ${w} ORDER BY er.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset],
  );
  const erIds = rows.map((r) => r.id); let itemsMap = {};
  if (erIds.length > 0) {
    const [allItems] = await pool.query(`SELECT * FROM e_report_items WHERE report_id IN (${erIds.map(() => '?').join(',')}) ORDER BY sort_order`, erIds);
    for (const item of allItems) { (itemsMap[item.report_id] = itemsMap[item.report_id] || []).push(item); }
  }
  return { docs: rows.map((r) => mapEReportRow(r, itemsMap[r.id] || [])), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetEReportStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [statusRows] = await pool.query('SELECT status, COUNT(*) as count FROM e_reports GROUP BY status');
  const stats = { total: 0 };
  for (const s of Object.values(EREPORT_STATUS)) stats[s] = 0;
  for (const sc of statusRows) { if (sc.status) { stats[sc.status] = sc.count; stats.total += sc.count; } }
  return stats;
};

const mysqlGenerateEReport = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { period, type } = data;
  const [[existing]] = await pool.query('SELECT id FROM e_reports WHERE period = ? AND type = ? LIMIT 1', [period, type]);
  if (existing) throw ApiError.conflict(`Laporan ${type} untuk periode ${period} sudah ada`);
  const [year, month] = period.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  const golonganMap = { [SP_TYPE.NARKOTIKA]: GOLONGAN_OBAT.NARKOTIKA, [SP_TYPE.PSIKOTROPIKA]: GOLONGAN_OBAT.PSIKOTROPIKA };
  const golongan = golonganMap[type] || 'prekursor';
  const [products] = await pool.query('SELECT id, name, sku FROM products WHERE is_active = 1 AND golongan = ?', [golongan]);
  if (products.length === 0) throw ApiError.notFound(`Tidak ada produk dengan golongan "${type}" ditemukan`);
  const items = [];
  for (const product of products) {
    const [[inAgg]] = await pool.query('SELECT COALESCE(SUM(quantity), 0) as total FROM stock_mutations WHERE product_id = ? AND type = ? AND mutation_date >= ? AND mutation_date <= ?', [product.id, MUTATION_TYPE.IN, startDate, endDate]);
    const [[outAgg]] = await pool.query('SELECT COALESCE(SUM(ABS(quantity)), 0) as total FROM stock_mutations WHERE product_id = ? AND type = ? AND mutation_date >= ? AND mutation_date <= ?', [product.id, MUTATION_TYPE.OUT, startDate, endDate]);
    const [[stockAgg]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as total FROM stock_batches WHERE product_id = ? AND status = 'active'", [product.id]);
    const qtyIn = Number(inAgg.total || 0); const qtyOut = Number(outAgg.total || 0); const stockEnd = Number(stockAgg.total || 0);
    if (qtyIn > 0 || qtyOut > 0 || stockEnd > 0) items.push({ productId: product.id, productName: product.name, qtyIn, qtyOut, stockEnd });
  }
  const id = new mongoose.Types.ObjectId().toString();
  const typePrefix = { [SP_TYPE.NARKOTIKA]: 'NK', [SP_TYPE.PSIKOTROPIKA]: 'PS', [SP_TYPE.PREKURSOR]: 'PK' };
  const reportNumber = `RPT-${typePrefix[type] || 'RPT'}/${period.replace('-', '/')}`;
  await pool.query('INSERT INTO e_reports (id, report_number, period, type, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,NOW(),NOW())', [id, reportNumber, period, type, EREPORT_STATUS.DRAFT, userId]);
  for (let i = 0; i < items.length; i++) {
    const item = items[i]; const itemId = new mongoose.Types.ObjectId().toString();
    await pool.query('INSERT INTO e_report_items (id, report_id, product_id, product_name, qty_in, qty_out, stock_end, sort_order) VALUES (?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.productName, item.qtyIn, item.qtyOut, item.stockEnd, i]);
  }
  return mysqlGetEReportWithItems(pool, id);
};

const mysqlSubmitEReport = async (id, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[report]] = await pool.query('SELECT id, status FROM e_reports WHERE id = ? LIMIT 1', [id]);
  if (!report) throw ApiError.notFound('e-Report tidak ditemukan');
  if (![EREPORT_STATUS.DRAFT, EREPORT_STATUS.REJECTED].includes(report.status)) throw ApiError.badRequest(`e-Report hanya bisa di-submit dari status draft atau rejected, status saat ini: "${report.status}"`);
  await pool.query('UPDATE e_reports SET status = ?, submitted_by = ?, submitted_at = NOW(), reject_reason = NULL, updated_at = NOW() WHERE id = ?', [EREPORT_STATUS.SUBMITTED, userId, id]);
  return mysqlGetEReportWithItems(pool, id);
};

// ─── MySQL: Documents ───

const computeDocStatus = (expiryDate) => {
  if (!expiryDate) return REG_DOC_STATUS.ACTIVE;
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const exp = new Date(expiryDate);
  if (exp <= now) return REG_DOC_STATUS.EXPIRED;
  if (exp <= thirtyDays) return REG_DOC_STATUS.EXPIRING_SOON;
  return REG_DOC_STATUS.ACTIVE;
};

const mysqlGetDocuments = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  // Company docs from app_settings
  const appSettingService = require('./appSetting.service');
  let raw;
  try { raw = await appSettingService.getSettings(); } catch (_) { raw = null; }

  const companyDocs = [];
  if (raw) {
    const licenses = raw.company?.licenses || {};
    const pharmacist = raw.company?.responsiblePharmacist || {};
    const licenseEntries = [
      { type: 'PBF', data: licenses.pbf }, { type: 'SIUP', data: licenses.siup },
      { type: 'TDP', data: licenses.tdp }, { type: 'NIB', data: licenses.nib ? { number: licenses.nib.number } : null },
      { type: 'CDOB', data: licenses.cdob },
    ];
    for (const entry of licenseEntries) {
      if (!entry.data) continue;
      const doc = { type: entry.type, number: entry.data.number || null, issuedDate: entry.data.issuedDate || null, expiryDate: entry.data.expiryDate || null, holder: null, status: computeDocStatus(entry.data.expiryDate) };
      const [[regDoc]] = await pool.query("SELECT id, file_name FROM regulation_documents WHERE category = ? AND type = ? LIMIT 1", [REG_DOC_CATEGORY.COMPANY, entry.type]);
      if (regDoc) { doc._id = regDoc.id; doc.fileName = regDoc.file_name; }
      companyDocs.push(doc);
    }
    if (pharmacist.sipaNumber || pharmacist.sipaExpiry) {
      const doc = { type: 'SIPA', number: pharmacist.sipaNumber || null, issuedDate: null, expiryDate: pharmacist.sipaExpiry || null, holder: pharmacist.name || null, status: computeDocStatus(pharmacist.sipaExpiry) };
      const [[rd]] = await pool.query("SELECT id, file_name FROM regulation_documents WHERE category = ? AND type = 'SIPA' LIMIT 1", [REG_DOC_CATEGORY.COMPANY]);
      if (rd) { doc._id = rd.id; doc.fileName = rd.file_name; }
      companyDocs.push(doc);
    }
    if (pharmacist.straNumber || pharmacist.straExpiry) {
      const doc = { type: 'STRA', number: pharmacist.straNumber || null, issuedDate: null, expiryDate: pharmacist.straExpiry || null, holder: pharmacist.name || null, status: computeDocStatus(pharmacist.straExpiry) };
      const [[rd]] = await pool.query("SELECT id, file_name FROM regulation_documents WHERE category = ? AND type = 'STRA' LIMIT 1", [REG_DOC_CATEGORY.COMPANY]);
      if (rd) { doc._id = rd.id; doc.fileName = rd.file_name; }
      companyDocs.push(doc);
    }
  }

  // Supplier docs
  const [suppliers] = await pool.query('SELECT id, name, izin_sarana_number, izin_sarana_expiry_date, cdob_cdakb_number, cdob_cdakb_expiry_date, sip_sik_number, sip_sik_expiry_date FROM suppliers WHERE is_active = 1');
  const supplierDocs = [];
  for (const s of suppliers) {
    if (s.cdob_cdakb_number || s.cdob_cdakb_expiry_date) {
      supplierDocs.push({ entityName: s.name, type: 'CDOB/CDAKB', number: s.cdob_cdakb_number || null, expiryDate: s.cdob_cdakb_expiry_date || null, status: computeDocStatus(s.cdob_cdakb_expiry_date) });
    }
    if (s.izin_sarana_number || s.izin_sarana_expiry_date) {
      supplierDocs.push({ entityName: s.name, type: 'Izin Sarana', number: s.izin_sarana_number || null, expiryDate: s.izin_sarana_expiry_date || null, status: computeDocStatus(s.izin_sarana_expiry_date) });
    }
    if (s.sip_sik_number || s.sip_sik_expiry_date) {
      supplierDocs.push({ entityName: s.name, type: 'SIP/SIK', number: s.sip_sik_number || null, expiryDate: s.sip_sik_expiry_date || null, status: computeDocStatus(s.sip_sik_expiry_date) });
    }
  }

  // Customer docs
  const [customers] = await pool.query('SELECT id, name, type, izin_sarana_number, izin_sarana_expiry_date FROM customers WHERE is_active = 1');
  const customerDocs = [];
  for (const c of customers) {
    if (c.izin_sarana_number || c.izin_sarana_expiry_date) {
      customerDocs.push({ entityName: c.name, customerType: c.type, siaNumber: c.izin_sarana_number || null, siaExpiry: c.izin_sarana_expiry_date || null, status: computeDocStatus(c.izin_sarana_expiry_date) });
    }
  }

  return { company: companyDocs, supplier: supplierDocs, customer: customerDocs };
};

const mysqlGetDocStats = async () => {
  const docs = await mysqlGetDocuments();
  const all = [...docs.company, ...docs.supplier, ...docs.customer];
  return { total: all.length, active: all.filter((d) => d.status === REG_DOC_STATUS.ACTIVE).length, expiringSoon: all.filter((d) => d.status === REG_DOC_STATUS.EXPIRING_SOON).length, expired: all.filter((d) => d.status === REG_DOC_STATUS.EXPIRED).length };
};

const mysqlUploadDocument = async (id, file, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[regDoc]] = await pool.query('SELECT id FROM regulation_documents WHERE id = ? LIMIT 1', [id]);
  if (!regDoc) throw ApiError.notFound('Dokumen tidak ditemukan');
  await pool.query('UPDATE regulation_documents SET file_name = ?, file_path = ?, uploaded_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?', [file.originalname, file.path, userId, id]);
  const [[updated]] = await pool.query('SELECT * FROM regulation_documents WHERE id = ? LIMIT 1', [id]);
  return { id: updated.id, _id: updated.id, category: updated.category, type: updated.type, fileName: updated.file_name, filePath: updated.file_path, uploadedAt: updated.uploaded_at };
};

const mysqlSyncCompanyDocuments = async () => {
  const pool = getMySQLPool();
  if (!pool) return;
  const types = ['PBF', 'SIUP', 'TDP', 'NIB', 'CDOB', 'SIPA', 'STRA'];
  for (const type of types) {
    const [[exists]] = await pool.query("SELECT id FROM regulation_documents WHERE category = ? AND type = ? LIMIT 1", [REG_DOC_CATEGORY.COMPANY, type]);
    if (!exists) {
      const id = new mongoose.Types.ObjectId().toString();
      await pool.query('INSERT INTO regulation_documents (id, category, type, status, created_at, updated_at) VALUES (?,?,?,?,NOW(),NOW())', [id, REG_DOC_CATEGORY.COMPANY, type, REG_DOC_STATUS.ACTIVE]);
    }
  }
};

// ─── Exported Functions with Provider Branching ───

const isMysql = () => config.dbProvider === 'mysql';

const getSPList = (q) => isMysql() ? mysqlGetSPList(q) : mongoGetSPList(q);
const getSPStats = () => isMysql() ? mysqlGetSPStats() : mongoGetSPStats();
const getSPById = (id) => isMysql() ? mysqlGetSPById(id) : mongoGetSPById(id);
const createSP = (data, userId) => isMysql() ? mysqlCreateSP(data, userId) : mongoCreateSP(data, userId);
const updateSPStatus = (id, newStatus, userId, rejectReason) => isMysql() ? mysqlUpdateSPStatus(id, newStatus, userId, rejectReason) : mongoUpdateSPStatus(id, newStatus, userId, rejectReason);
const expireOverdueSP = () => isMysql() ? mysqlExpireOverdueSP() : mongoExpireOverdueSP();
const getEReports = (q) => isMysql() ? mysqlGetEReports(q) : mongoGetEReports(q);
const getEReportStats = () => isMysql() ? mysqlGetEReportStats() : mongoGetEReportStats();
const generateEReport = (data, userId) => isMysql() ? mysqlGenerateEReport(data, userId) : mongoGenerateEReport(data, userId);
const submitEReport = (id, userId) => isMysql() ? mysqlSubmitEReport(id, userId) : mongoSubmitEReport(id, userId);
const getDocuments = () => isMysql() ? mysqlGetDocuments() : mongoGetDocuments();
const getDocStats = () => isMysql() ? mysqlGetDocStats() : mongoGetDocStats();
const uploadDocument = (id, file, userId) => isMysql() ? mysqlUploadDocument(id, file, userId) : mongoUploadDocument(id, file, userId);
const syncCompanyDocuments = () => isMysql() ? mysqlSyncCompanyDocuments() : mongoSyncCompanyDocuments();

module.exports = {
  getSPList,
  getSPStats,
  getSPById,
  createSP,
  updateSPStatus,
  expireOverdueSP,
  getEReports,
  getEReportStats,
  generateEReport,
  submitEReport,
  getDocuments,
  getDocStats,
  uploadDocument,
  syncCompanyDocuments,
};
