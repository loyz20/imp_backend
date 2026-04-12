const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Memo = require('../models/Memo');
const ChartOfAccount = require('../models/ChartOfAccount');
const JournalEntry = require('../models/JournalEntry');
const BankTransaction = require('../models/BankTransaction');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const {
  INVOICE_STATUS,
  FINANCE_PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_SOURCE_TYPE,
  MEMO_TYPE,
  MEMO_STATUS,
  ACCOUNT_CATEGORY,
  JOURNAL_SOURCE,
  JOURNAL_STATUS,
  MATCH_STATUS,
  GOLONGAN_ALKES,
} = require('../constants');
const config = require('../config');
const { getMySQLPool } = require('../config/database');

// ═══════════════════════════════════════════════════════════════
// ─── HELPERS ───
// ═══════════════════════════════════════════════════════════════

const debitNormalCategories = [ACCOUNT_CATEGORY.ASSET, ACCOUNT_CATEGORY.EXPENSE];

const toStartOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const toEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const getPeriodRange = (queryParams = {}, defaultPeriod = 'current_month') => {
  const now = new Date();
  const period = queryParams.period || defaultPeriod;

  let start;
  let end;

  if (period === 'last_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (period === 'current_year') {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now);
  } else if (period === 'custom' && queryParams.dateFrom && queryParams.dateTo) {
    start = toStartOfDay(queryParams.dateFrom);
    end = toEndOfDay(queryParams.dateTo);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now);
  }

  return {
    period,
    start,
    end,
  };
};

const toAccountBalance = (category, totalDebit, totalCredit) => {
  if (debitNormalCategories.includes(category)) {
    return (totalDebit || 0) - (totalCredit || 0);
  }
  return (totalCredit || 0) - (totalDebit || 0);
};

const postedJournalMatch = {
  $or: [
    { status: JOURNAL_STATUS.POSTED },
    { status: { $exists: false } },
    { status: null },
  ],
};

/**
 * Auto-create invoice from a completed delivery
 */
const mongoCreateInvoiceFromDelivery = async (delivery, userId) => {
  // Get SO for pricing and payment terms
  const so = await SalesOrder.findById(delivery.salesOrderId)
    .populate('items.productId', 'name sku satuan');
  if (!so) return null;

  const settings = await AppSetting.getSettings();
  const ppnRate = settings?.company?.tax?.defaultPpnRate || 11;
  const isPkp = settings?.company?.tax?.isPkp !== false;

  // Map delivery items to invoice items with SO pricing
  const invoiceItems = [];
  for (const dItem of delivery.items) {
    const soItem = so.items.find(
      (si) => si.productId._id.toString() === dItem.productId.toString(),
    );
    if (!soItem) continue;

    const itemDiscount = Math.round(
      dItem.quantityShipped * soItem.unitPrice * (soItem.discount / 100),
    );

    invoiceItems.push({
      productId: dItem.productId,
      satuan: dItem.satuan,
      quantity: dItem.quantityShipped,
      unitPrice: soItem.unitPrice,
      discount: itemDiscount,
      subtotal: Math.round(dItem.quantityShipped * soItem.unitPrice) - itemDiscount,
      batchNumber: dItem.batchNumber,
      expiryDate: dItem.expiryDate,
    });
  }

  if (invoiceItems.length === 0) return null;

  const subtotal = invoiceItems.reduce((sum, item) => sum + item.subtotal, 0);
  const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
  const totalAmount = subtotal + ppnAmount;

  const invoice = new Invoice({
    salesOrderId: delivery.salesOrderId,
    deliveryId: delivery._id,
    customerId: delivery.customerId,
    status: INVOICE_STATUS.SENT,
    invoiceDate: new Date(),
    sentAt: delivery.deliveredAt || new Date(),
    dueDate: new Date(Date.now() + (so.paymentTermDays || 30) * 24 * 60 * 60 * 1000),
    items: invoiceItems,
    subtotal,
    ppnRate: isPkp ? ppnRate : 0,
    ppnAmount,
    discount: 0,
    totalAmount,
    paidAmount: 0,
    remainingAmount: totalAmount,
    paymentTermDays: so.paymentTermDays || 30,
    createdBy: userId,
    updatedBy: userId,
  });

  await invoice.save();
  return invoice;
};

/**
 * Determine if a golongan is alkes
 */
const alkesGolonganValues = new Set(Object.values(GOLONGAN_ALKES));
const isAlkesGolongan = (golongan) => alkesGolonganValues.has(golongan);

/**
 * Create invoice(s) from multiple Sales Orders (surat jalan)
 * Splits into separate invoices for obat (F) and alkes (A) if mixed
 * Returns array of invoices
 */
const mongoCreateInvoiceFromMultipleSOs = async (orders, userId) => {
  const settings = await AppSetting.getSettings();
  const ppnRate = settings?.company?.tax?.defaultPpnRate || 11;
  const isPkp = settings?.company?.tax?.isPkp !== false;

  let maxPaymentTermDays = 30;
  const obatItems = [];
  const alkesItems = [];

  for (const so of orders) {
    if (so.paymentTermDays > maxPaymentTermDays) maxPaymentTermDays = so.paymentTermDays;

    for (const soItem of so.items || []) {
      const golongan = soItem.productId?.golongan || soItem.golongan || '';
      const itemDiscount = Math.round(
        soItem.quantity * soItem.unitPrice * ((soItem.discount || 0) / 100),
      );

      const invoiceItem = {
        productId: soItem.productId?._id || soItem.productId,
        satuan: soItem.satuan,
        quantity: soItem.quantity,
        unitPrice: soItem.unitPrice,
        discount: itemDiscount,
        subtotal: Math.round(soItem.quantity * soItem.unitPrice) - itemDiscount,
        batchNumber: soItem.batchNumber || null,
        expiryDate: soItem.expiryDate || null,
      };

      if (isAlkesGolongan(golongan)) {
        alkesItems.push(invoiceItem);
      } else {
        obatItems.push(invoiceItem);
      }
    }
  }

  if (obatItems.length === 0 && alkesItems.length === 0) {
    throw ApiError.badRequest('Tidak ada item untuk dijadikan invoice');
  }

  const salesOrderIds = orders.map((so) => so._id);
  const customerId = orders[0].customerId?._id || orders[0].customerId;
  const invoices = [];

  const createInvoiceForCategory = async (items, category) => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
    const totalAmount = subtotal + ppnAmount;

    const invoice = new Invoice({
      salesOrderIds,
      customerId,
      invoiceCategory: category,
      status: INVOICE_STATUS.SENT,
      invoiceDate: new Date(),
      sentAt: new Date(),
      dueDate: new Date(Date.now() + maxPaymentTermDays * 24 * 60 * 60 * 1000),
      items,
      subtotal,
      ppnRate: isPkp ? ppnRate : 0,
      ppnAmount,
      discount: 0,
      totalAmount,
      paidAmount: 0,
      remainingAmount: totalAmount,
      paymentTermDays: maxPaymentTermDays,
      createdBy: userId,
      updatedBy: userId,
    });

    await invoice.save();

    // Create revenue journal: DR Piutang / CR Pendapatan / CR PPN Keluaran
    try {
      await mongoCreateSalesRevenueJournal(invoice);
    } catch (err) {
      logger.error(`Failed to create sales revenue journal for ${invoice.invoiceNumber}: ${err.message}`);
    }

    return invoice;
  };

  if (obatItems.length > 0) {
    invoices.push(await createInvoiceForCategory(obatItems, 'obat'));
  }
  if (alkesItems.length > 0) {
    invoices.push(await createInvoiceForCategory(alkesItems, 'alkes'));
  }

  return invoices;
};

/**
 * Auto-create purchase invoice from a verified Goods Receiving
 * DR Persediaan / CR Hutang — jurnal sudah dibuat di createJournalFromGR
 * Ini hanya membuat dokumen Invoice tipe purchase untuk tracking hutang
 */
const mongoCreatePurchaseInvoiceFromGR = async (gr, po, userId) => {
  // Prevent duplicate: check if invoice already exists for this GR
  const existing = await Invoice.findOne({ goodsReceivingId: gr._id });
  if (existing) return existing;

  const manualInvoiceNumber = (gr.invoiceNumber || '').trim();
  if (!manualInvoiceNumber) {
    throw ApiError.badRequest('Nomor faktur supplier wajib diisi untuk membuat invoice pembelian');
  }

  const existingInvoiceNumber = await Invoice.findOne({ invoiceNumber: manualInvoiceNumber })
    .select('_id invoiceNumber')
    .lean();
  if (existingInvoiceNumber) {
    throw ApiError.conflict(`Nomor faktur supplier sudah digunakan: ${manualInvoiceNumber}`);
  }

  const settings = await AppSetting.getSettings();
  const ppnRate = settings?.company?.tax?.defaultPpnRate || 11;
  const isPkp = settings?.company?.tax?.isPkp !== false;
  const defaultPaymentTermDays = settings?.invoice?.defaultPaymentTermDays || 30;

  // Map GR items to invoice items using GR unit price as source of truth
  const invoiceItems = [];
  for (const grItem of gr.items) {
    const poItem = po?.items?.find(
      (pi) => pi.productId.toString() === grItem.productId.toString(),
    );
    const unitPrice = Number.isFinite(grItem.unitPrice)
      ? grItem.unitPrice
      : (poItem?.unitPrice || 0);
    const itemDiscount = 0;

    invoiceItems.push({
      productId: grItem.productId,
      satuan: grItem.satuan,
      quantity: grItem.receivedQty,
      unitPrice,
      discount: itemDiscount,
      subtotal: Math.round(grItem.receivedQty * unitPrice) - itemDiscount,
      batchNumber: grItem.batchNumber,
      expiryDate: grItem.expiryDate,
    });
  }

  if (invoiceItems.length === 0) return null;

  const subtotal = invoiceItems.reduce((sum, item) => sum + item.subtotal, 0);
  const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
  const totalAmount = subtotal + ppnAmount;
  const invoiceDate = gr.receivingDate || new Date();

  const invoice = new Invoice({
    invoiceNumber: manualInvoiceNumber,
    invoiceType: 'purchase',
    purchaseOrderId: gr.purchaseOrderId || null,
    goodsReceivingId: gr._id,
    supplierId: gr.supplierId,
    status: INVOICE_STATUS.SENT,
    sentAt: gr.verifiedAt || new Date(),
    invoiceDate,
    dueDate: new Date(invoiceDate.getTime() + ((po?.paymentTermDays || defaultPaymentTermDays) * 24 * 60 * 60 * 1000)),
    items: invoiceItems,
    subtotal,
    ppnRate: isPkp ? ppnRate : 0,
    ppnAmount,
    discount: 0,
    totalAmount,
    paidAmount: 0,
    remainingAmount: totalAmount,
    paymentTermDays: po?.paymentTermDays || defaultPaymentTermDays,
    notes: `No. Faktur Supplier: ${manualInvoiceNumber}`,
    createdBy: userId,
    updatedBy: userId,
  });

  await invoice.save();
  return invoice;
};

// ═══════════════════════════════════════════════════════════════
// ─── ACCOUNTS RECEIVABLE (AR) ───
// ═══════════════════════════════════════════════════════════════

const mongoGetReceivables = async (queryParams) => {
  const { search, aging, sort } = queryParams;
  const now = new Date();

  const matchStage = {
    status: { $in: ['sent', 'partially_paid', 'overdue'] },
    remainingAmount: { $gt: 0 },
  };

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: '$customer' },
  ];

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { 'customer.name': new RegExp(search, 'i') },
          { 'customer.code': new RegExp(search, 'i') },
        ],
      },
    });
  }

  pipeline.push(
    {
      $addFields: {
        agingDays: {
          $divide: [{ $subtract: [now, '$dueDate'] }, 86400000],
        },
      },
    },
    {
      $group: {
        _id: '$customerId',
        customer: { $first: '$customer' },
        invoiceCount: { $sum: 1 },
        totalOutstanding: { $sum: '$remainingAmount' },
        invoices: {
          $push: {
            invoiceId: '$_id',
            invoiceNumber: '$invoiceNumber',
            totalAmount: '$totalAmount',
            remainingAmount: '$remainingAmount',
            status: '$status',
            dueDate: '$dueDate',
            agingDays: '$agingDays',
          },
        },
        agingCurrent: {
          $sum: { $cond: [{ $lte: ['$agingDays', 30] }, '$remainingAmount', 0] },
        },
        aging31to60: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$agingDays', 30] }, { $lte: ['$agingDays', 60] }] },
              '$remainingAmount',
              0,
            ],
          },
        },
        aging61to90: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$agingDays', 60] }, { $lte: ['$agingDays', 90] }] },
              '$remainingAmount',
              0,
            ],
          },
        },
        aging90plus: {
          $sum: { $cond: [{ $gt: ['$agingDays', 90] }, '$remainingAmount', 0] },
        },
      },
    },
  );

  // Filter by aging bucket
  if (aging) {
    const agingFilter = {};
    if (aging === 'current') agingFilter.agingCurrent = { $gt: 0 };
    else if (aging === '31-60') agingFilter.aging31to60 = { $gt: 0 };
    else if (aging === '61-90') agingFilter.aging61to90 = { $gt: 0 };
    else if (aging === '90+') agingFilter.aging90plus = { $gt: 0 };
    pipeline.push({ $match: agingFilter });
  }

  // Sort
  const sortField = sort || '-totalOutstanding';
  const sortDir = sortField.startsWith('-') ? -1 : 1;
  const sortKey = sortField.replace(/^-/, '');
  pipeline.push({ $sort: { [sortKey]: sortDir } });

  // Pagination
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 10));

  const countPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline = [...pipeline, { $skip: (page - 1) * limit }, { $limit: limit }];

  const [countResult, docs] = await Promise.all([
    Invoice.aggregate(countPipeline),
    Invoice.aggregate(dataPipeline),
  ]);

  const totalDocs = (countResult[0] || {}).total || 0;
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

// ═══════════════════════════════════════════════════════════════
// ─── ACCOUNTS PAYABLE (AP) ───
// ═══════════════════════════════════════════════════════════════

const mongoGetPayables = async (queryParams) => {
  const { search, aging, sort, dateFrom, dateTo } = queryParams;
  const now = new Date();

  const matchStage = {
    invoiceType: 'purchase',
    status: { $in: [INVOICE_STATUS.SENT, INVOICE_STATUS.PARTIALLY_PAID, INVOICE_STATUS.OVERDUE] },
    remainingAmount: { $gt: 0 },
  };

  if (dateFrom || dateTo) {
    matchStage.invoiceDate = {};
    if (dateFrom) matchStage.invoiceDate.$gte = new Date(dateFrom);
    if (dateTo) matchStage.invoiceDate.$lte = new Date(dateTo);
  }

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'suppliers',
        localField: 'supplierId',
        foreignField: '_id',
        as: 'supplier',
      },
    },
    { $unwind: '$supplier' },
  ];

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { invoiceNumber: new RegExp(search, 'i') },
          { 'supplier.name': new RegExp(search, 'i') },
          { 'supplier.code': new RegExp(search, 'i') },
        ],
      },
    });
  }

  pipeline.push(
    {
      $addFields: {
        agingDays: { $divide: [{ $subtract: [now, '$dueDate'] }, 86400000] },
      },
    },
    {
      $group: {
        _id: '$supplierId',
        supplier: { $first: '$supplier' },
        invoiceCount: { $sum: 1 },
        poCount: { $sum: 1 },
        totalOutstanding: { $sum: '$remainingAmount' },
        invoices: {
          $push: {
            invoiceId: '$_id',
            invoiceNumber: '$invoiceNumber',
            totalAmount: '$totalAmount',
            remainingAmount: '$remainingAmount',
            status: '$status',
            dueDate: '$dueDate',
            agingDays: '$agingDays',
          },
        },
        agingCurrent: {
          $sum: { $cond: [{ $lte: ['$agingDays', 30] }, '$remainingAmount', 0] },
        },
        aging31to60: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$agingDays', 30] }, { $lte: ['$agingDays', 60] }] },
              '$remainingAmount',
              0,
            ],
          },
        },
        aging61to90: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$agingDays', 60] }, { $lte: ['$agingDays', 90] }] },
              '$remainingAmount',
              0,
            ],
          },
        },
        aging90plus: {
          $sum: { $cond: [{ $gt: ['$agingDays', 90] }, '$remainingAmount', 0] },
        },
      },
    },
  );

  if (aging) {
    const agingFilter = {};
    if (aging === 'current') agingFilter.agingCurrent = { $gt: 0 };
    else if (aging === '31-60') agingFilter.aging31to60 = { $gt: 0 };
    else if (aging === '61-90') agingFilter.aging61to90 = { $gt: 0 };
    else if (aging === '90+') agingFilter.aging90plus = { $gt: 0 };
    pipeline.push({ $match: agingFilter });
  }

  const sortField = sort || '-totalOutstanding';
  const sortDir = sortField.startsWith('-') ? -1 : 1;
  const sortKey = sortField.replace(/^-/, '');
  pipeline.push({ $sort: { [sortKey]: sortDir } });

  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 10));

  const countPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline = [...pipeline, { $skip: (page - 1) * limit }, { $limit: limit }];

  const [countResult, docs] = await Promise.all([
    Invoice.aggregate(countPipeline),
    Invoice.aggregate(dataPipeline),
  ]);

  const totalDocs = (countResult[0] || {}).total || 0;
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

const ensureReceivableInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice piutang tidak ditemukan');

  if (invoice.invoiceType !== 'sales') {
    throw ApiError.badRequest('Endpoint receivables hanya menerima invoice penjualan');
  }

  if (invoice.status === INVOICE_STATUS.DRAFT) {
    throw ApiError.badRequest('Invoice masih draft. Kirim invoice terlebih dahulu sebelum membuat pembayaran piutang');
  }

  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    throw ApiError.badRequest('Invoice dibatalkan dan tidak bisa diproses sebagai piutang');
  }

  if ((invoice.remainingAmount || 0) <= 0) {
    throw ApiError.badRequest('Invoice sudah lunas');
  }

  return invoice;
};

const ensurePayableInvoice = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw ApiError.notFound('Invoice hutang tidak ditemukan');

  if (invoice.invoiceType !== 'purchase') {
    throw ApiError.badRequest('Endpoint payables hanya menerima invoice pembelian (hasil Goods Receiving)');
  }

  if (invoice.status === INVOICE_STATUS.DRAFT) {
    throw ApiError.badRequest('Invoice pembelian masih draft dan belum bisa dibayar');
  }

  if (invoice.status === INVOICE_STATUS.CANCELLED) {
    throw ApiError.badRequest('Invoice pembelian dibatalkan dan tidak bisa diproses sebagai hutang');
  }

  if ((invoice.remainingAmount || 0) <= 0) {
    throw ApiError.badRequest('Invoice pembelian sudah lunas');
  }

  return invoice;
};

const mongoCreateReceivablePayment = async (data, userId) => {
  const invoice = await ensureReceivableInvoice(data.invoiceId);

  const payload = {
    invoiceId: invoice._id,
    customerId: invoice.customerId,
    type: PAYMENT_TYPE.INCOMING,
    sourceType: PAYMENT_SOURCE_TYPE.SALES_INVOICE,
    amount: data.amount,
    paymentDate: data.paymentDate,
    paymentMethod: data.paymentMethod,
    referenceNumber: data.referenceNumber,
    bankAccount: data.bankAccount,
    notes: data.notes,
  };

  return createPayment(payload, userId);
};

const mongoPayReceivable = async (invoiceId, data, userId) => {
  const payment = await createReceivablePayment({ ...data, invoiceId }, userId);
  const verificationNotes = data.verificationNotes ?? data.notes ?? '';
  await verifyPayment(payment._id, verificationNotes, userId);
  return getPaymentById(payment._id);
};

const mongoCreatePayablePayment = async (data, userId) => {
  const payableInvoice = await ensurePayableInvoice(data.invoiceId);

  const payload = {
    invoiceId: payableInvoice._id,
    supplierId: payableInvoice.supplierId,
    type: PAYMENT_TYPE.OUTGOING,
    sourceType: PAYMENT_SOURCE_TYPE.PURCHASE_INVOICE,
    amount: data.amount,
    paymentDate: data.paymentDate,
    paymentMethod: data.paymentMethod,
    referenceNumber: data.referenceNumber,
    bankAccount: data.bankAccount,
    notes: data.notes,
  };

  return createPayment(payload, userId);
};

const mongoPayPayable = async (invoiceId, data, userId) => {
  const payment = await createPayablePayment({ ...data, invoiceId }, userId);
  const verificationNotes = data.verificationNotes ?? data.notes ?? '';
  await verifyPayment(payment._id, verificationNotes, userId);
  return getPaymentById(payment._id);
};

const getPaymentById = async (id) => {
  const payment = await Payment.findById(id)
    .populate('invoiceId', 'invoiceNumber totalAmount remainingAmount status')
    .populate('customerId', 'name code')
    .populate('supplierId', 'name code')
    .populate('verifiedBy', 'name')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!payment) throw ApiError.notFound('Payment tidak ditemukan');

  const obj = payment.toJSON();
  obj.invoice = obj.invoiceId;
  obj.customer = obj.customerId;
  obj.supplier = obj.supplierId;
  delete obj.invoiceId;
  delete obj.customerId;
  delete obj.supplierId;
  return obj;
};

const createPayment = async (data, userId) => {
  // Validate invoice amount if linked and infer source from invoice type.
  if (data.invoiceId) {
    const invoice = await Invoice.findById(data.invoiceId);
    if (!invoice) throw ApiError.notFound('Invoice tidak ditemukan');

    if (!data.sourceType) {
      data.sourceType = invoice.invoiceType === 'purchase'
        ? PAYMENT_SOURCE_TYPE.PURCHASE_INVOICE
        : PAYMENT_SOURCE_TYPE.SALES_INVOICE;
    }

    if (invoice.status === INVOICE_STATUS.DRAFT) {
      throw ApiError.badRequest('Invoice masih draft dan belum bisa diproses pembayarannya');
    }

    if (invoice.status === INVOICE_STATUS.CANCELLED) {
      throw ApiError.badRequest('Invoice dibatalkan dan tidak bisa diproses pembayarannya');
    }

    if (invoice.invoiceType === 'sales' && data.type !== PAYMENT_TYPE.INCOMING) {
      throw ApiError.badRequest('Pembayaran invoice penjualan harus bertipe incoming');
    }

    if (invoice.invoiceType === 'purchase' && data.type !== PAYMENT_TYPE.OUTGOING) {
      throw ApiError.badRequest('Pembayaran invoice pembelian harus bertipe outgoing');
    }

    if (data.amount > invoice.remainingAmount) {
      throw ApiError.badRequest(
        `Jumlah pembayaran (Rp ${data.amount.toLocaleString('id-ID')}) melebihi sisa invoice (Rp ${invoice.remainingAmount.toLocaleString('id-ID')})`,
      );
    }

    if (!data.customerId && invoice.customerId) {
      data.customerId = invoice.customerId;
    }

    if (!data.supplierId && invoice.supplierId) {
      data.supplierId = invoice.supplierId;
    }
  }

  if (!data.sourceType) {
    if (data.purchaseOrderId) data.sourceType = PAYMENT_SOURCE_TYPE.PURCHASE_ORDER;
    else if (data.type === PAYMENT_TYPE.INCOMING) data.sourceType = PAYMENT_SOURCE_TYPE.OTHER_INCOMING;
    else data.sourceType = PAYMENT_SOURCE_TYPE.OTHER_OUTGOING;
  }

  if (data.sourceType === PAYMENT_SOURCE_TYPE.SALES_INVOICE && data.type !== PAYMENT_TYPE.INCOMING) {
    throw ApiError.badRequest('sourceType sales_invoice hanya boleh untuk pembayaran incoming');
  }

  if (
    (data.sourceType === PAYMENT_SOURCE_TYPE.PURCHASE_ORDER
      || data.sourceType === PAYMENT_SOURCE_TYPE.PURCHASE_INVOICE)
    && data.type !== PAYMENT_TYPE.OUTGOING
  ) {
    throw ApiError.badRequest('sourceType hutang hanya boleh untuk pembayaran outgoing');
  }

  // Validate PO amount if linked (outgoing payment)
  if (data.purchaseOrderId) {
    const po = await PurchaseOrder.findById(data.purchaseOrderId);
    if (!po) throw ApiError.notFound('Purchase Order tidak ditemukan');
    if (data.amount > (po.remainingAmount || po.totalAmount)) {
      throw ApiError.badRequest(
        `Jumlah pembayaran (Rp ${data.amount.toLocaleString('id-ID')}) melebihi sisa hutang PO (Rp ${(po.remainingAmount || po.totalAmount).toLocaleString('id-ID')})`,
      );
    }
    // Auto-fill supplier from PO
    if (!data.supplierId && po.supplierId) {
      data.supplierId = po.supplierId;
    }
    if (data.sourceType === PAYMENT_SOURCE_TYPE.PURCHASE_ORDER && data.type !== PAYMENT_TYPE.OUTGOING) {
      throw ApiError.badRequest('Pembayaran purchase order harus bertipe outgoing');
    }
  }

  data.status = FINANCE_PAYMENT_STATUS.PENDING;
  data.createdBy = userId;
  data.updatedBy = userId;

  const payment = new Payment(data);
  await payment.save();
  return payment;
};

const verifyPayment = async (id, notes, userId) => {
  const payment = await Payment.findById(id);
  if (!payment) throw ApiError.notFound('Payment tidak ditemukan');
  if (payment.status !== FINANCE_PAYMENT_STATUS.PENDING) {
    throw ApiError.badRequest('Payment hanya bisa diverifikasi saat status pending');
  }

  payment.status = FINANCE_PAYMENT_STATUS.VERIFIED;
  payment.verifiedAt = new Date();
  payment.verifiedBy = userId;
  payment.verificationNotes = notes || '';
  payment.updatedBy = userId;
  await payment.save();

  // Side effect: update invoice if linked
  if (payment.invoiceId) {
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice) {
      invoice.paidAmount += payment.amount;
      invoice.remainingAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);

      if (invoice.remainingAmount <= 0) {
        invoice.status = INVOICE_STATUS.PAID;
        invoice.paidAt = new Date();
      } else if (invoice.paidAmount > 0) {
        invoice.status = INVOICE_STATUS.PARTIALLY_PAID;
      }
      invoice.updatedBy = userId;
      await invoice.save();
    }
  }

  // Side effect: update PO paidAmount if linked (outgoing payment to supplier)
  if (payment.purchaseOrderId) {
    const po = await PurchaseOrder.findById(payment.purchaseOrderId);
    if (po) {
      po.paidAmount = (po.paidAmount || 0) + payment.amount;
      po.remainingAmount = Math.max(0, po.totalAmount - po.paidAmount);
      po.updatedBy = userId;
      await po.save();
    }
  }

  // Auto-create journal entry
  await createJournalFromPayment(payment);

  return payment;
};

// ═══════════════════════════════════════════════════════════════
// ─── MEMOS ───
// ═══════════════════════════════════════════════════════════════

const mongoCreateMemo = async (data, userId) => {
  // Validate at least customerId or supplierId
  if (!data.customerId && !data.supplierId) {
    throw ApiError.badRequest('Customer atau Supplier wajib diisi');
  }

  data.status = MEMO_STATUS.DRAFT;
  data.createdBy = userId;
  data.updatedBy = userId;

  const memo = new Memo(data);
  await memo.save();
  return memo;
};

const mongoApproveMemo = async (id, notes, userId) => {
  const memo = await Memo.findById(id);
  if (!memo) throw ApiError.notFound('Memo tidak ditemukan');
  if (memo.status !== MEMO_STATUS.DRAFT) {
    throw ApiError.badRequest('Memo hanya bisa disetujui dari status draft');
  }

  const now = new Date();
  memo.status = MEMO_STATUS.POSTED;
  memo.approvedAt = now;
  memo.postedAt = now;
  memo.approvedBy = userId;
  memo.approvalNotes = notes || '';
  memo.updatedBy = userId;
  await memo.save();

  // Side effect: update invoice if linked
  if (memo.invoiceId) {
    const invoice = await Invoice.findById(memo.invoiceId);
    if (invoice) {
      if (memo.type === MEMO_TYPE.CREDIT_MEMO) {
        invoice.remainingAmount = Math.max(0, invoice.remainingAmount - memo.totalAmount);
        invoice.paidAmount = invoice.totalAmount - invoice.remainingAmount;
      } else {
        invoice.remainingAmount += memo.totalAmount;
      }

      if (invoice.remainingAmount <= 0) {
        invoice.status = INVOICE_STATUS.PAID;
        invoice.paidAt = new Date();
      } else if (invoice.paidAmount > 0) {
        invoice.status = INVOICE_STATUS.PARTIALLY_PAID;
      }
      invoice.updatedBy = userId;
      await invoice.save();
    }
  }

  // Auto-create journal entry
  await createJournalFromMemo(memo);

  return memo;
};

// ═══════════════════════════════════════════════════════════════
// ─── GENERAL LEDGER ───
// ═══════════════════════════════════════════════════════════════

const mongoGetChartOfAccounts = async (queryParams) => {
  const { category, search, includeInactive } = queryParams;
  const filter = includeInactive === 'true' ? {} : { isActive: true };

  if (category) filter.category = category;
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ code: regex }, { name: regex }];
  }

  const accounts = await ChartOfAccount.find(filter).sort({ code: 1 }).lean();

  // Build tree structure
  const accountMap = {};
  accounts.forEach((acc) => {
    accountMap[acc._id.toString()] = { ...acc, children: [] };
  });

  const tree = [];
  accounts.forEach((acc) => {
    const node = accountMap[acc._id.toString()];
    if (acc.parentId && accountMap[acc.parentId.toString()]) {
      accountMap[acc.parentId.toString()].children.push(node);
    } else {
      tree.push(node);
    }
  });

  return tree;
};

const mongoCreateChartOfAccount = async (data, userId) => {
  const code = String(data.code || '').trim();
  const name = String(data.name || '').trim();

  const existingByCode = await ChartOfAccount.findOne({ code });
  if (existingByCode) {
    throw ApiError.badRequest(`Kode akun ${code} sudah digunakan`);
  }

  let parent = null;
  if (data.parentId) {
    parent = await ChartOfAccount.findById(data.parentId);
    if (!parent) throw ApiError.notFound('Parent account tidak ditemukan');

    // Enforce category consistency to keep hierarchy predictable.
    if (parent.category !== data.category) {
      throw ApiError.badRequest('Kategori akun harus sama dengan parent account');
    }
  }

  const account = await ChartOfAccount.create({
    code,
    name,
    category: data.category,
    parentId: parent ? parent._id : null,
    level: parent ? (parent.level || 0) + 1 : 0,
    description: data.description || '',
    isActive: typeof data.isActive === 'boolean' ? data.isActive : true,
    balance: 0,
    createdBy: userId,
    updatedBy: userId,
  });

  return account;
};

const mongoUpdateChartOfAccount = async (id, data, userId) => {
  const account = await ChartOfAccount.findById(id);
  if (!account) throw ApiError.notFound('Akun COA tidak ditemukan');

  if (data.code && data.code !== account.code) {
    const existingByCode = await ChartOfAccount.findOne({ code: data.code });
    if (existingByCode && existingByCode._id.toString() !== id) {
      throw ApiError.badRequest(`Kode akun ${data.code} sudah digunakan`);
    }
    account.code = String(data.code).trim();
  }

  if (typeof data.name === 'string') account.name = data.name.trim();
  if (typeof data.description === 'string') account.description = data.description.trim();
  if (typeof data.isActive === 'boolean') account.isActive = data.isActive;

  const nextCategory = data.category || account.category;
  if (data.category) account.category = data.category;

  if (data.parentId) {
    if (data.parentId.toString() === id.toString()) {
      throw ApiError.badRequest('Akun tidak boleh menjadi parent dirinya sendiri');
    }

    const parent = await ChartOfAccount.findById(data.parentId);
    if (!parent) throw ApiError.notFound('Parent account tidak ditemukan');

    if (parent.category !== nextCategory) {
      throw ApiError.badRequest('Kategori akun harus sama dengan parent account');
    }

    // Prevent circular hierarchy by walking up parent chain.
    let cursor = parent;
    while (cursor) {
      if (cursor._id.toString() === id.toString()) {
        throw ApiError.badRequest('Parent account menyebabkan circular hierarchy');
      }
      if (!cursor.parentId) break;
      // eslint-disable-next-line no-await-in-loop
      cursor = await ChartOfAccount.findById(cursor.parentId);
    }

    account.parentId = parent._id;
    account.level = (parent.level || 0) + 1;
  } else if (Object.prototype.hasOwnProperty.call(data, 'parentId') && !data.parentId) {
    account.parentId = null;
    account.level = 0;
  }

  account.updatedBy = userId;
  await account.save();
  return account;
};

const mongoDeleteChartOfAccount = async (id) => {
  const account = await ChartOfAccount.findById(id);
  if (!account) throw ApiError.notFound('Akun COA tidak ditemukan');

  const [childCount, journalUsageCount] = await Promise.all([
    ChartOfAccount.countDocuments({ parentId: id }),
    JournalEntry.countDocuments({ 'entries.accountId': id }),
  ]);

  if (childCount > 0) {
    throw ApiError.badRequest('Akun tidak bisa dihapus karena masih memiliki akun turunan');
  }

  if (journalUsageCount > 0) {
    throw ApiError.badRequest('Akun tidak bisa dihapus karena sudah dipakai pada jurnal');
  }

  await account.deleteOne();
};

const mongoGetJournalEntries = async (queryParams) => {
  const {
    search,
    accountCategory,
    status,
    dateFrom,
    dateTo,
    sort,
  } = queryParams;
  const filter = {};
  const andClauses = [];

  if (status === JOURNAL_STATUS.POSTED) {
    andClauses.push(postedJournalMatch);
  } else if (status) {
    filter.status = status;
  }

  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    andClauses.push({
      $or: [
      { journalNumber: regex },
      { description: regex },
      ],
    });
  }

  if (accountCategory) {
    const accountIds = (await ChartOfAccount.find({ category: accountCategory })
      .select('_id')
      .lean())
      .map((acc) => acc._id);

    if (accountIds.length === 0) {
      return {
        docs: [],
        pagination: {
          totalDocs: 0,
          totalPages: 0,
          page: Math.max(1, parseInt(queryParams.page, 10) || 1),
          limit: Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20)),
          hasNextPage: false,
          hasPrevPage: false,
          nextPage: null,
          prevPage: null,
        },
      };
    }

    filter['entries.accountId'] = { $in: accountIds };
  }

  if (andClauses.length > 0) {
    filter.$and = andClauses;
  }

  const result = await paginate(JournalEntry, {
    filter,
    page: queryParams.page,
    limit: queryParams.limit || 20,
    sort: sort || '-date',
    populate: [
      { path: 'entries.accountId', select: 'code name' },
      { path: 'createdBy', select: 'name' },
      { path: 'approvedBy', select: 'name' },
    ],
  });

  // Map accountId to account in entries
  const docs = result.docs.map((doc) => {
    const obj = { ...doc };
    if (obj.entries) {
      obj.entries = obj.entries.map((entry) => ({
        ...entry,
        account: entry.accountId,
        accountId: undefined,
      }));
    }
    return obj;
  });

  return { docs, pagination: result.pagination };
};

const mongoCreateManualJournal = async (data, userId) => {
  const entries = (data.entries || []).map((entry) => ({
    accountId: entry.accountId,
    debit: Number(entry.debit || 0),
    credit: Number(entry.credit || 0),
    description: entry.description || '',
  }));

  const uniqueAccountIds = [...new Set(entries.map((entry) => String(entry.accountId)))];
  const accounts = await ChartOfAccount.find({
    _id: { $in: uniqueAccountIds },
    isActive: true,
  })
    .select('_id')
    .lean();

  if (accounts.length !== uniqueAccountIds.length) {
    throw ApiError.badRequest('Satu atau lebih account jurnal tidak ditemukan atau tidak aktif');
  }

  const journal = await JournalEntry.create({
    date: new Date(data.date),
    description: String(data.description || '').trim(),
    source: JOURNAL_SOURCE.MANUAL,
    sourceNumber: data.reference ? String(data.reference).trim() : null,
    status: JOURNAL_STATUS.PENDING_APPROVAL,
    entries,
    createdBy: userId,
    updatedBy: userId,
  });

  return JournalEntry.findById(journal._id)
    .populate('entries.accountId', 'code name category')
    .populate('createdBy', 'name')
    .lean();
};

const mongoApproveManualJournal = async (id, notes, userId) => {
  const journal = await JournalEntry.findById(id);
  if (!journal) throw ApiError.notFound('Jurnal tidak ditemukan');

  if (journal.source !== JOURNAL_SOURCE.MANUAL) {
    throw ApiError.badRequest('Hanya jurnal manual yang bisa melalui approval');
  }

  if (journal.status !== JOURNAL_STATUS.PENDING_APPROVAL) {
    throw ApiError.badRequest('Jurnal sudah diposting atau tidak dalam status pending approval');
  }

  if (journal.createdBy && String(journal.createdBy) === String(userId)) {
    throw ApiError.badRequest('Pembuat jurnal tidak boleh meng-approve jurnalnya sendiri');
  }

  journal.status = JOURNAL_STATUS.POSTED;
  journal.approvedAt = new Date();
  journal.approvedBy = userId;
  journal.approvalNotes = notes || '';
  journal.updatedBy = userId;
  await journal.save();

  const balanceOps = journal.entries.map((entry) => ({
    updateOne: {
      filter: { _id: entry.accountId },
      update: { $inc: { balance: (entry.debit || 0) - (entry.credit || 0) } },
    },
  }));

  if (balanceOps.length > 0) {
    await ChartOfAccount.bulkWrite(balanceOps);
  }

  return JournalEntry.findById(journal._id)
    .populate('entries.accountId', 'code name category')
    .populate('createdBy', 'name')
    .populate('approvedBy', 'name')
    .lean();
};

const mongoGetLedger = async (queryParams) => {
  const { accountId } = queryParams;
  const { period, start, end } = getPeriodRange(queryParams, 'current_month');
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(queryParams.limit, 10) || 50));
  const accountObjectId = new mongoose.Types.ObjectId(accountId);

  const account = await ChartOfAccount.findById(accountObjectId).lean();
  if (!account) throw ApiError.notFound('Akun tidak ditemukan');

  const [openingAgg, periodAgg, detailAgg] = await Promise.all([
    JournalEntry.aggregate([
      {
        $match: {
          ...postedJournalMatch,
          date: { $lt: start },
          'entries.accountId': accountObjectId,
        },
      },
      { $unwind: '$entries' },
      { $match: { 'entries.accountId': accountObjectId } },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: '$entries.debit' },
          totalCredit: { $sum: '$entries.credit' },
        },
      },
    ]),
    JournalEntry.aggregate([
      {
        $match: {
          ...postedJournalMatch,
          date: { $gte: start, $lte: end },
          'entries.accountId': accountObjectId,
        },
      },
      { $unwind: '$entries' },
      { $match: { 'entries.accountId': accountObjectId } },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: '$entries.debit' },
          totalCredit: { $sum: '$entries.credit' },
        },
      },
    ]),
    JournalEntry.aggregate([
      {
        $match: {
          ...postedJournalMatch,
          date: { $gte: start, $lte: end },
          'entries.accountId': accountObjectId,
        },
      },
      { $unwind: '$entries' },
      { $match: { 'entries.accountId': accountObjectId } },
      { $sort: { date: 1, createdAt: 1, _id: 1 } },
      {
        $project: {
          _id: 0,
          journalId: '$_id',
          journalNumber: 1,
          date: 1,
          description: 1,
          source: 1,
          sourceNumber: 1,
          lineDescription: '$entries.description',
          debit: '$entries.debit',
          credit: '$entries.credit',
        },
      },
      {
        $facet: {
          metadata: [{ $count: 'totalDocs' }],
          docs: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        },
      },
    ]),
  ]);

  const openingTotals = openingAgg[0] || {};
  const periodTotals = periodAgg[0] || {};
  const openingBalance = toAccountBalance(
    account.category,
    openingTotals.totalDebit || 0,
    openingTotals.totalCredit || 0,
  );

  const totalDebit = periodTotals.totalDebit || 0;
  const totalCredit = periodTotals.totalCredit || 0;
  const movement = toAccountBalance(account.category, totalDebit, totalCredit);
  const closingBalance = openingBalance + movement;

  const detailContainer = detailAgg[0] || { metadata: [], docs: [] };
  const totalDocs = (detailContainer.metadata[0] || {}).totalDocs || 0;
  const totalPages = Math.ceil(totalDocs / limit);

  let runningBalance = openingBalance;
  const transactions = (detailContainer.docs || []).map((doc) => {
    runningBalance += toAccountBalance(account.category, doc.debit || 0, doc.credit || 0);
    return {
      ...doc,
      balanceAfter: runningBalance,
    };
  });

  return {
    account: {
      id: account._id,
      code: account.code,
      name: account.name,
      category: account.category,
    },
    period,
    dateFrom: start,
    dateTo: end,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance,
    transactions,
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

const mongoGetBalanceSheetReport = async (queryParams) => {
  const { period, end } = getPeriodRange(queryParams, 'current_month');

  const accounts = await ChartOfAccount.find({
    isActive: true,
    category: { $in: [ACCOUNT_CATEGORY.ASSET, ACCOUNT_CATEGORY.LIABILITY, ACCOUNT_CATEGORY.EQUITY] },
  })
    .sort({ code: 1 })
    .lean();

  const totals = await JournalEntry.aggregate([
    {
      $match: {
        ...postedJournalMatch,
        date: { $lte: end },
      },
    },
    { $unwind: '$entries' },
    {
      $group: {
        _id: '$entries.accountId',
        totalDebit: { $sum: '$entries.debit' },
        totalCredit: { $sum: '$entries.credit' },
      },
    },
  ]);

  const totalsMap = Object.fromEntries(
    totals.map((item) => [String(item._id), item]),
  );

  const assets = [];
  const liabilities = [];
  const equity = [];

  accounts.forEach((account) => {
    const sum = totalsMap[String(account._id)] || {};
    const totalDebit = sum.totalDebit || 0;
    const totalCredit = sum.totalCredit || 0;
    const balance = toAccountBalance(account.category, totalDebit, totalCredit);

    const row = {
      accountId: account._id,
      code: account.code,
      name: account.name,
      totalDebit,
      totalCredit,
      balance,
    };

    if (account.category === ACCOUNT_CATEGORY.ASSET) assets.push(row);
    if (account.category === ACCOUNT_CATEGORY.LIABILITY) liabilities.push(row);
    if (account.category === ACCOUNT_CATEGORY.EQUITY) equity.push(row);
  });

  const totalAssets = assets.reduce((sum, row) => sum + row.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, row) => sum + row.balance, 0);
  const totalEquity = equity.reduce((sum, row) => sum + row.balance, 0);
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = totalAssets - totalLiabilitiesAndEquity;

  return {
    period,
    asOfDate: end,
    assets,
    liabilities,
    equity,
    summary: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
      difference,
      isBalanced: Math.abs(difference) < 1,
    },
  };
};

const mongoGetProfitLossReport = async (queryParams) => {
  const { period, start, end } = getPeriodRange(queryParams, 'current_month');

  const accounts = await ChartOfAccount.find({
    isActive: true,
    category: { $in: [ACCOUNT_CATEGORY.REVENUE, ACCOUNT_CATEGORY.EXPENSE] },
  })
    .sort({ code: 1 })
    .lean();

  const totals = await JournalEntry.aggregate([
    {
      $match: {
        ...postedJournalMatch,
        date: { $gte: start, $lte: end },
      },
    },
    { $unwind: '$entries' },
    {
      $group: {
        _id: '$entries.accountId',
        totalDebit: { $sum: '$entries.debit' },
        totalCredit: { $sum: '$entries.credit' },
      },
    },
  ]);

  const totalsMap = Object.fromEntries(
    totals.map((item) => [String(item._id), item]),
  );

  const revenue = [];
  const expense = [];

  accounts.forEach((account) => {
    const sum = totalsMap[String(account._id)] || {};
    const totalDebit = sum.totalDebit || 0;
    const totalCredit = sum.totalCredit || 0;
    const balance = toAccountBalance(account.category, totalDebit, totalCredit);

    const row = {
      accountId: account._id,
      code: account.code,
      name: account.name,
      totalDebit,
      totalCredit,
      amount: balance,
    };

    if (account.category === ACCOUNT_CATEGORY.REVENUE) revenue.push(row);
    if (account.category === ACCOUNT_CATEGORY.EXPENSE) expense.push(row);
  });

  const totalRevenue = revenue.reduce((sum, row) => sum + row.amount, 0);
  const totalExpense = expense.reduce((sum, row) => sum + row.amount, 0);

  return {
    period,
    dateFrom: start,
    dateTo: end,
    revenue,
    expense,
    summary: {
      totalRevenue,
      totalExpense,
      netProfit: totalRevenue - totalExpense,
    },
  };
};

const mongoGetCashFlowReport = async (queryParams) => {
  const { period, start, end } = getPeriodRange(queryParams, 'current_month');

  const [paymentFlows, cashAccounts] = await Promise.all([
    Payment.aggregate([
      {
        $match: {
          status: FINANCE_PAYMENT_STATUS.VERIFIED,
          paymentDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { type: '$type', sourceType: '$sourceType' },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          type: '$_id.type',
          sourceType: '$_id.sourceType',
          amount: 1,
          count: 1,
        },
      },
    ]),
    ChartOfAccount.find({
      isActive: true,
      category: ACCOUNT_CATEGORY.ASSET,
      code: /^11/,
    })
      .select('_id code name category')
      .lean(),
  ]);

  const incoming = paymentFlows.filter((row) => row.type === PAYMENT_TYPE.INCOMING);
  const outgoing = paymentFlows.filter((row) => row.type === PAYMENT_TYPE.OUTGOING);

  const totalIncoming = incoming.reduce((sum, row) => sum + row.amount, 0);
  const totalOutgoing = outgoing.reduce((sum, row) => sum + row.amount, 0);
  const netCashFlow = totalIncoming - totalOutgoing;

  let openingBalance = 0;
  let closingBalance = netCashFlow;

  if (cashAccounts.length > 0) {
    const cashIds = cashAccounts.map((account) => account._id);

    const [openingCashAgg, periodCashAgg] = await Promise.all([
      JournalEntry.aggregate([
        {
          $match: {
            ...postedJournalMatch,
            date: { $lt: start },
            'entries.accountId': { $in: cashIds },
          },
        },
        { $unwind: '$entries' },
        { $match: { 'entries.accountId': { $in: cashIds } } },
        {
          $group: {
            _id: null,
            totalDebit: { $sum: '$entries.debit' },
            totalCredit: { $sum: '$entries.credit' },
          },
        },
      ]),
      JournalEntry.aggregate([
        {
          $match: {
            ...postedJournalMatch,
            date: { $gte: start, $lte: end },
            'entries.accountId': { $in: cashIds },
          },
        },
        { $unwind: '$entries' },
        { $match: { 'entries.accountId': { $in: cashIds } } },
        {
          $group: {
            _id: null,
            totalDebit: { $sum: '$entries.debit' },
            totalCredit: { $sum: '$entries.credit' },
          },
        },
      ]),
    ]);

    const openingCash = openingCashAgg[0] || {};
    const periodCash = periodCashAgg[0] || {};

    openingBalance = toAccountBalance(
      ACCOUNT_CATEGORY.ASSET,
      openingCash.totalDebit || 0,
      openingCash.totalCredit || 0,
    );

    const periodMovement = toAccountBalance(
      ACCOUNT_CATEGORY.ASSET,
      periodCash.totalDebit || 0,
      periodCash.totalCredit || 0,
    );

    closingBalance = openingBalance + periodMovement;
  }

  return {
    period,
    dateFrom: start,
    dateTo: end,
    openingBalance,
    closingBalance,
    incoming,
    outgoing,
    summary: {
      totalIncoming,
      totalOutgoing,
      netCashFlow,
    },
  };
};

// ─── Journal Auto-Creation Helpers ───

const createJournalFromPayment = async (payment) => {
  const isIncoming = payment.type === PAYMENT_TYPE.INCOMING;

  let debitAccount;
  let creditAccount;

  if (isIncoming) {
    // Debit: Kas/Bank (1100), Credit: Piutang (1200)
    debitAccount = await ChartOfAccount.findOne({ code: '1100' });
    creditAccount = await ChartOfAccount.findOne({ code: '1200' });
  } else {
    // Debit: Hutang Usaha (2100), Credit: Kas/Bank (1100)
    debitAccount = await ChartOfAccount.findOne({ code: '2100' });
    creditAccount = await ChartOfAccount.findOne({ code: '1100' });
  }

  if (!debitAccount || !creditAccount) return;

  const entries = [
    {
      accountId: debitAccount._id,
      debit: payment.amount,
      credit: 0,
      description: isIncoming ? 'Penerimaan pembayaran' : 'Pelunasan hutang',
    },
    {
      accountId: creditAccount._id,
      debit: 0,
      credit: payment.amount,
      description: isIncoming ? 'Pelunasan piutang' : 'Pengeluaran kas/bank',
    },
  ];

  const journal = new JournalEntry({
    date: payment.verifiedAt || new Date(),
    description: `Payment ${payment.paymentNumber}`,
    source: JOURNAL_SOURCE.PAYMENT,
    sourceId: payment._id,
    sourceNumber: payment.paymentNumber,
    entries,
    createdBy: payment.verifiedBy,
  });

  await journal.save();

  for (const entry of entries) {
    await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
      $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
    });
  }
};

/**
 * Auto-create journal when GR is verified
 * DR Persediaan (1300) = subtotal barang
 * DR PPN Masukan (1410) = ppnAmount (jika PKP)
 * CR Hutang Usaha (2100) = totalAmount
 */
const mongoCreateJournalFromGR = async (gr, po) => {
  const persediaan = await ChartOfAccount.findOne({ code: '1300' });
  const hutangUsaha = await ChartOfAccount.findOne({ code: '2100' });
  const ppnMasukan = await ChartOfAccount.findOne({ code: '1410' });

  if (!persediaan || !hutangUsaha) return;

  // Calculate received value with GR unit price (fallback to PO)
  let subtotal = 0;
  for (const grItem of gr.items) {
    const poItem = po?.items?.find(
      (pi) => pi.productId.toString() === grItem.productId.toString(),
    );
    const unitPrice = Number.isFinite(grItem.unitPrice)
      ? grItem.unitPrice
      : (poItem?.unitPrice || 0);
    subtotal += Math.round(grItem.receivedQty * unitPrice);
  }

  const settings = await AppSetting.getSettings();
  const ppnRate = settings?.company?.tax?.defaultPpnRate || 11;
  const isPkp = settings?.company?.tax?.isPkp !== false;
  const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
  const totalAmount = subtotal + ppnAmount;

  const entries = [
    {
      accountId: persediaan._id,
      debit: subtotal,
      credit: 0,
      description: `Persediaan masuk dari ${gr.invoiceNumber}`,
    },
    {
      accountId: hutangUsaha._id,
      debit: 0,
      credit: totalAmount,
      description: `Hutang atas penerimaan ${gr.invoiceNumber}`,
    },
  ];

  if (ppnAmount > 0 && ppnMasukan) {
    entries.push({
      accountId: ppnMasukan._id,
      debit: ppnAmount,
      credit: 0,
      description: `PPN Masukan ${ppnRate}%`,
    });
  }

  const journal = new JournalEntry({
    date: gr.verifiedAt || new Date(),
    description: `Penerimaan Barang ${gr.invoiceNumber}`,
    source: JOURNAL_SOURCE.GOODS_RECEIVING,
    sourceId: gr._id,
    sourceNumber: gr.invoiceNumber,
    entries,
    createdBy: gr.verifiedBy || gr.updatedBy,
  });

  await journal.save();

  for (const entry of entries) {
    await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
      $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
    });
  }

  // Keep legacy PO finance fields in sync when PO exists.
  if (po) {
    po.remainingAmount = Math.max(0, po.totalAmount - (po.paidAmount || 0));
    await po.save();
  }
};

/**
 * Auto-create COGS journal when delivery is completed
 * DR HPP / COGS (5100) = cost of goods delivered
 * CR Persediaan (1300) = cost of goods delivered
 */
const mongoCreateCOGSJournal = async (delivery) => {
  const hpp = await ChartOfAccount.findOne({ code: '5100' });
  const persediaan = await ChartOfAccount.findOne({ code: '1300' });

  if (!hpp || !persediaan) return;

  // Calculate COGS from stock batch unit prices
  const StockBatch = require('../models/StockBatch');
  let totalCOGS = 0;

  for (const item of delivery.items) {
    // Find batch by product + batchNumber for cost lookup
    if (item.batchNumber) {
      const batch = await StockBatch.findOne({
        productId: item.productId,
        batchNumber: item.batchNumber,
      });
      if (batch) {
        totalCOGS += Math.round(item.quantityShipped * (batch.unitPrice || 0));
        continue;
      }
    }
    // Fallback: average cost from all batches
    const batches = await StockBatch.find({ productId: item.productId, quantity: { $gt: 0 } });
    if (batches.length > 0) {
      const avgPrice = batches.reduce((s, b) => s + (b.unitPrice || 0), 0) / batches.length;
      totalCOGS += Math.round(item.quantityShipped * avgPrice);
    }
  }

  if (totalCOGS <= 0) return;

  const entries = [
    {
      accountId: hpp._id,
      debit: totalCOGS,
      credit: 0,
      description: `HPP pengiriman ${delivery.deliveryNumber}`,
    },
    {
      accountId: persediaan._id,
      debit: 0,
      credit: totalCOGS,
      description: `Pengurangan persediaan ${delivery.deliveryNumber}`,
    },
  ];

  const journal = new JournalEntry({
    date: delivery.deliveredAt || new Date(),
    description: `HPP Delivery ${delivery.deliveryNumber}`,
    source: JOURNAL_SOURCE.DELIVERY,
    sourceId: delivery._id,
    sourceNumber: delivery.deliveryNumber,
    entries,
    createdBy: delivery.updatedBy,
  });

  await journal.save();

  for (const entry of entries) {
    await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
      $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
    });
  }
};

/**
 * Auto-create Sales Revenue journal when sales invoice is created
 * DR Piutang Usaha (1200) = totalAmount (incl PPN)
 * CR Pendapatan Penjualan (4100) = subtotal
 * CR PPN Keluaran (2110) = ppnAmount (if PKP)
 */
const mongoCreateSalesRevenueJournal = async (invoice) => {
  const piutang = await ChartOfAccount.findOne({ code: '1200' });
  const pendapatan = await ChartOfAccount.findOne({ code: '4100' });
  const ppnKeluaran = await ChartOfAccount.findOne({ code: '2110' });

  if (!piutang || !pendapatan) return;

  const entries = [
    {
      accountId: piutang._id,
      debit: invoice.totalAmount,
      credit: 0,
      description: `Piutang penjualan ${invoice.invoiceNumber}`,
    },
    {
      accountId: pendapatan._id,
      debit: 0,
      credit: invoice.subtotal,
      description: `Pendapatan penjualan ${invoice.invoiceNumber}`,
    },
  ];

  if (invoice.ppnAmount > 0 && ppnKeluaran) {
    entries.push({
      accountId: ppnKeluaran._id,
      debit: 0,
      credit: invoice.ppnAmount,
      description: `PPN Keluaran ${invoice.ppnRate || 11}%`,
    });
  }

  const journal = new JournalEntry({
    date: invoice.invoiceDate || new Date(),
    description: `Invoice Penjualan ${invoice.invoiceNumber}`,
    source: JOURNAL_SOURCE.INVOICE,
    sourceId: invoice._id,
    sourceNumber: invoice.invoiceNumber,
    entries,
    createdBy: invoice.createdBy,
  });

  await journal.save();

  for (const entry of entries) {
    await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
      $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
    });
  }
};

const createJournalFromMemo = async (memo) => {
  const isCreditMemo = memo.type === MEMO_TYPE.CREDIT_MEMO;

  let debitAccount;
  let creditAccount;

  if (isCreditMemo) {
    // Credit Memo: Debit Pendapatan (4100), Credit Piutang (1200)
    debitAccount = await ChartOfAccount.findOne({ code: '4100' });
    creditAccount = await ChartOfAccount.findOne({ code: '1200' });
  } else {
    // Debit Memo: Debit Piutang (1200), Credit Pendapatan (4100)
    debitAccount = await ChartOfAccount.findOne({ code: '1200' });
    creditAccount = await ChartOfAccount.findOne({ code: '4100' });
  }

  if (!debitAccount || !creditAccount) return;

  const entries = [
    {
      accountId: debitAccount._id,
      debit: memo.totalAmount,
      credit: 0,
      description: isCreditMemo ? 'Credit memo - pengurangan pendapatan' : 'Debit memo - penambahan piutang',
    },
    {
      accountId: creditAccount._id,
      debit: 0,
      credit: memo.totalAmount,
      description: isCreditMemo ? 'Credit memo - pengurangan piutang' : 'Debit memo - penambahan pendapatan',
    },
  ];

  const journal = new JournalEntry({
    date: memo.postedAt || new Date(),
    description: `Memo ${memo.memoNumber}`,
    source: JOURNAL_SOURCE.MEMO,
    sourceId: memo._id,
    sourceNumber: memo.memoNumber,
    entries,
    createdBy: memo.approvedBy,
  });

  await journal.save();

  for (const entry of entries) {
    await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
      $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
    });
  }
};

// ═══════════════════════════════════════════════════════════════
// ─── BANK TRANSACTIONS ───
// ═══════════════════════════════════════════════════════════════

const mongoGetBankTransactions = async (queryParams) => {
  const { search, matchStatus, dateFrom, dateTo, sort } = queryParams;
  const filter = {};

  if (matchStatus) filter.matchStatus = matchStatus;

  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) filter.date.$lte = new Date(dateTo);
  }

  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { description: regex },
      { reference: regex },
      { bankAccount: regex },
    ];
  }

  const result = await paginate(BankTransaction, {
    filter,
    page: queryParams.page,
    limit: queryParams.limit || 20,
    sort: sort || '-date',
    populate: [
      { path: 'matchedPaymentId', select: 'paymentNumber amount type' },
      { path: 'createdBy', select: 'name' },
    ],
  });

  const docs = result.docs.map((doc) => {
    const obj = { ...doc };
    obj.matchedPayment = obj.matchedPaymentId;
    delete obj.matchedPaymentId;
    return obj;
  });

  return { docs, pagination: result.pagination };
};

const mongoCreateBankTransaction = async (data, userId) => {
  data.matchStatus = MATCH_STATUS.UNMATCHED;
  data.createdBy = userId;
  data.updatedBy = userId;

  const txn = new BankTransaction(data);
  await txn.save();
  return txn;
};

// ═══════════════════════════════════════════════════════════════
// ─── RETURN INTEGRATION ───
// ═══════════════════════════════════════════════════════════════

/**
 * Create COGS reversal journal when customer return restocks items
 * DR Persediaan (1300), CR HPP (5100)
 */
const mongoCreateReturnCOGSReversal = async (ret) => {
  const StockBatch = require('../models/StockBatch');
  const { DISPOSITION } = require('../constants');

  const persediaan = await ChartOfAccount.findOne({ code: '1300' });
  const hpp = await ChartOfAccount.findOne({ code: '5100' });
  if (!persediaan || !hpp) return;

  let totalCOGS = 0;

  for (const item of ret.items) {
    // Only reverse COGS for restocked items
    if (item.disposition !== DISPOSITION.RESTOCK) continue;
    if (!item.quantityReturned || item.quantityReturned <= 0) continue;

    // Get cost from batch
    if (item.batchNumber && item.productId) {
      const batch = await StockBatch.findOne({
        productId: item.productId,
        batchNumber: item.batchNumber,
      });
      if (batch) {
        totalCOGS += Math.round(item.quantityReturned * (batch.unitPrice || 0));
        continue;
      }
    }

    // Fallback: average cost
    if (item.productId) {
      const batches = await StockBatch.find({ productId: item.productId, quantity: { $gt: 0 } });
      if (batches.length > 0) {
        const avgPrice = batches.reduce((s, b) => s + (b.unitPrice || 0), 0) / batches.length;
        totalCOGS += Math.round(item.quantityReturned * avgPrice);
      }
    }
  }

  if (totalCOGS <= 0) return;

  const journal = new JournalEntry({
    date: new Date(),
    description: `Pembalikan HPP dari retur ${ret.returnNumber}`,
    source: JOURNAL_SOURCE.RETURN,
    sourceId: ret._id,
    sourceNumber: ret.returnNumber,
    entries: [
      {
        accountId: persediaan._id,
        debit: totalCOGS,
        credit: 0,
        description: `Persediaan masuk dari retur ${ret.returnNumber}`,
      },
      {
        accountId: hpp._id,
        debit: 0,
        credit: totalCOGS,
        description: `Pembalikan HPP dari retur ${ret.returnNumber}`,
      },
    ],
    createdBy: ret.updatedBy,
  });

  await journal.save();
};

// ─── MySQL Helpers ───

const mysqlGetCoaByCode = async (pool, code) => {
  const [[row]] = await pool.query('SELECT id, code, name, category, balance FROM chart_of_accounts WHERE code = ? LIMIT 1', [code]).catch(() => [[]]);
  return row || null;
};

const mysqlGenerateJournalNumber = async (conn) => {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `JRN-${ymd}-`;
  const [rows] = await conn.query('SELECT journal_number FROM journal_entries WHERE journal_number LIKE ? ORDER BY journal_number DESC LIMIT 1', [`${prefix}%`]);
  const seq = rows.length > 0 ? parseInt(rows[0].journal_number.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

const mysqlCreateJournalWithLines = async (pool, journalData) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = new mongoose.Types.ObjectId().toString();
    const journalNumber = journalData.number || await mysqlGenerateJournalNumber(conn);
    const status = journalData.status || JOURNAL_STATUS?.POSTED || 'posted';
    await conn.query('INSERT INTO journal_entries (id, journal_number, date, description, source, source_id, source_number, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())', [id, journalNumber, journalData.date || new Date(), journalData.description, journalData.source, journalData.sourceId || null, journalData.sourceNumber || '', status, journalData.createdBy || null]);
    for (let i = 0; i < (journalData.entries || []).length; i++) {
      const e = journalData.entries[i];
      const lineId = new mongoose.Types.ObjectId().toString();
      // eslint-disable-next-line no-await-in-loop
      await conn.query('INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, debit, credit, description, sort_order) VALUES (?,?,?,?,?,?,?)', [lineId, id, e.accountId, e.debit || 0, e.credit || 0, e.description || '', i]);
      // eslint-disable-next-line no-await-in-loop
      await conn.query('UPDATE chart_of_accounts SET balance = balance + ? WHERE id = ?', [(e.debit || 0) - (e.credit || 0), e.accountId]);
    }
    await conn.commit();
    return id;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const mysqlGetPpnSettings = async (pool) => {
  const [[row]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'company' LIMIT 1").catch(() => [[]]);
  const settings = row ? JSON.parse(row.setting_value || '{}') : {};
  return { ppnRate: settings?.tax?.defaultPpnRate || 11, isPkp: settings?.tax?.isPkp !== false };
};

// ─── MySQL Cross-Service Integration Functions ───

const mysqlCreateInvoiceFromDelivery = async (delivery, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[soRow]] = await pool.query('SELECT id, payment_term_days, ppn_rate FROM sales_orders WHERE id = ? LIMIT 1', [delivery.salesOrderId || delivery._id || delivery.id]);
  if (!soRow) return null;
  const [soItems] = await pool.query('SELECT soi.*, p.name as product_name FROM sales_order_items soi LEFT JOIN products p ON soi.product_id = p.id WHERE soi.sales_order_id = ?', [soRow.id]);
  const { ppnRate, isPkp } = await mysqlGetPpnSettings(pool);
  const invoiceItems = [];
  for (const dItem of delivery.items || []) {
    const productId = dItem.productId?._id || dItem.productId;
    const soItem = soItems.find((si) => si.product_id === productId?.toString());
    if (!soItem) continue;
    const itemDiscount = Math.round((dItem.quantityShipped || dItem.quantity || 0) * soItem.unit_price * ((soItem.discount || 0) / 100));
    invoiceItems.push({ productId: productId?.toString(), satuan: dItem.satuan || soItem.satuan, quantity: dItem.quantityShipped || dItem.quantity || 0, unitPrice: soItem.unit_price, discount: itemDiscount, subtotal: Math.round((dItem.quantityShipped || dItem.quantity || 0) * soItem.unit_price) - itemDiscount, batchNumber: dItem.batchNumber || null, expiryDate: dItem.expiryDate || null });
  }
  if (invoiceItems.length === 0) return null;
  const subtotal = invoiceItems.reduce((s, i) => s + i.subtotal, 0);
  const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
  const totalAmount = subtotal + ppnAmount;
  const id = new mongoose.Types.ObjectId().toString();
  const paymentTermDays = soRow.payment_term_days || 30;
  await pool.query('INSERT INTO invoices (id, invoice_type, sales_order_id, customer_id, status, invoice_date, sent_at, due_date, subtotal, ppn_rate, ppn_amount, discount, total_amount, paid_amount, remaining_amount, payment_term_days, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,NOW(),NOW(),?,?,?,?,0,?,0,?,?,?,?,NOW(),NOW())', [id, 'sales', delivery.salesOrderId || delivery.id, delivery.customerId?._id || delivery.customerId, INVOICE_STATUS.SENT, new Date(Date.now() + paymentTermDays * 86400000), subtotal, isPkp ? ppnRate : 0, ppnAmount, totalAmount, totalAmount, paymentTermDays, userId, userId]);
  for (let i = 0; i < invoiceItems.length; i++) {
    const item = invoiceItems[i]; const itemId = new mongoose.Types.ObjectId().toString();
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO invoice_items (id, invoice_id, product_id, satuan, quantity, unit_price, discount, subtotal, batch_number, expiry_date, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.satuan, item.quantity, item.unitPrice, item.discount, item.subtotal, item.batchNumber, item.expiryDate, i]);
  }
  return { id, _id: id };
};

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Generate sales invoice number for MySQL: NNNN/F/IMP/IV/2026 or NNNN/A/IMP/IV/2026
 */
const mysqlGenerateSalesInvoiceNumber = async (pool, category) => {
  const now = new Date();
  const year = now.getFullYear();
  const romanMonth = ROMAN_MONTHS[now.getMonth()];
  const typeCode = category === 'obat' ? 'F' : 'A';
  const suffix = `/${typeCode}/IMP/${romanMonth}/${year}`;

  const [rows] = await pool.query(
    'SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1',
    [`%${suffix}`],
  );

  let nextNum = 1;
  if (rows.length > 0) {
    const lastNum = parseInt(rows[0].invoice_number.split('/')[0], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${String(nextNum).padStart(4, '0')}${suffix}`;
};

/**
 * Create invoice(s) from multiple Sales Orders (MySQL)
 * Splits into separate invoices for obat (F) and alkes (A) if mixed
 * Returns array of invoices
 */
const mysqlCreateInvoiceFromMultipleSOs = async (orders, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const { ppnRate, isPkp } = await mysqlGetPpnSettings(pool);

  let maxPaymentTermDays = 30;
  const obatItems = [];
  const alkesItems = [];

  for (const so of orders) {
    if (so.paymentTermDays > maxPaymentTermDays) maxPaymentTermDays = so.paymentTermDays;

    for (const soItem of so.items || []) {
      const golongan = soItem.productId?.golongan || soItem.golongan || '';
      const unitPrice = Number(soItem.unitPrice || 0);
      const discount = Number(soItem.discount || 0);
      const qty = Number(soItem.quantity || 0);
      const itemDiscount = Math.round(qty * unitPrice * (discount / 100));

      const invoiceItem = {
        productId: soItem.productId?._id || soItem.productId,
        satuan: soItem.satuan,
        quantity: qty,
        unitPrice,
        discount: itemDiscount,
        subtotal: Math.round(qty * unitPrice) - itemDiscount,
        batchNumber: soItem.batchNumber || null,
        expiryDate: soItem.expiryDate || null,
      };

      if (isAlkesGolongan(golongan)) {
        alkesItems.push(invoiceItem);
      } else {
        obatItems.push(invoiceItem);
      }
    }
  }

  if (obatItems.length === 0 && alkesItems.length === 0) {
    throw ApiError.badRequest('Tidak ada item untuk dijadikan invoice');
  }

  const salesOrderIdsJson = JSON.stringify(orders.map((so) => so._id || so.id));
  const customerId = orders[0].customerId?._id || orders[0].customerId;
  const invoices = [];

  const createInvoiceForCategory = async (items, category) => {
    const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
    const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
    const totalAmount = subtotal + ppnAmount;
    const id = new mongoose.Types.ObjectId().toString();
    const invoiceNumber = await mysqlGenerateSalesInvoiceNumber(pool, category);

    await pool.query(
      'INSERT INTO invoices (id, invoice_number, invoice_type, invoice_category, sales_order_id, customer_id, status, invoice_date, sent_at, due_date, subtotal, ppn_rate, ppn_amount, discount, total_amount, paid_amount, remaining_amount, payment_term_days, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW(),?,?,?,?,0,?,0,?,?,?,?,NOW(),NOW())',
      [id, invoiceNumber, 'sales', category, salesOrderIdsJson, customerId, INVOICE_STATUS.SENT, new Date(Date.now() + maxPaymentTermDays * 86400000), subtotal, isPkp ? ppnRate : 0, ppnAmount, totalAmount, totalAmount, maxPaymentTermDays, userId, userId],
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemId = new mongoose.Types.ObjectId().toString();
      // eslint-disable-next-line no-await-in-loop
      await pool.query('INSERT INTO invoice_items (id, invoice_id, product_id, satuan, quantity, unit_price, discount, subtotal, batch_number, expiry_date, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.satuan, item.quantity, item.unitPrice, item.discount, item.subtotal, item.batchNumber, item.expiryDate, i]);
    }

    return { id, _id: id, invoiceNumber, invoiceCategory: category, subtotal, ppnRate: isPkp ? ppnRate : 0, ppnAmount, totalAmount, invoiceDate: new Date(), createdBy: userId };
  };

  if (obatItems.length > 0) {
    const inv = await createInvoiceForCategory(obatItems, 'obat');
    // Create revenue journal: DR Piutang / CR Pendapatan / CR PPN Keluaran
    try { await mysqlCreateSalesRevenueJournal(inv); } catch (err) { logger.error(`Failed to create sales revenue journal for ${inv.invoiceNumber}: ${err.message}`); }
    invoices.push(inv);
  }
  if (alkesItems.length > 0) {
    const inv = await createInvoiceForCategory(alkesItems, 'alkes');
    try { await mysqlCreateSalesRevenueJournal(inv); } catch (err) { logger.error(`Failed to create sales revenue journal for ${inv.invoiceNumber}: ${err.message}`); }
    invoices.push(inv);
  }

  return invoices;
};

const mysqlCreatePurchaseInvoiceFromGR = async (gr, po, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const grId = gr._id || gr.id;
  const [[existing]] = await pool.query('SELECT id FROM invoices WHERE goods_receiving_id = ? LIMIT 1', [grId]);
  if (existing) return { id: existing.id, _id: existing.id };
  const manualInvoiceNumber = (gr.invoiceNumber || '').trim();
  if (!manualInvoiceNumber) throw ApiError.badRequest('Nomor faktur supplier wajib diisi untuk membuat invoice pembelian');
  const [[existingNum]] = await pool.query('SELECT id FROM invoices WHERE invoice_number = ? LIMIT 1', [manualInvoiceNumber]);
  if (existingNum) throw ApiError.conflict(`Nomor faktur supplier sudah digunakan: ${manualInvoiceNumber}`);
  const { ppnRate, isPkp } = await mysqlGetPpnSettings(pool);
  const [[settingRow]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'invoice' LIMIT 1").catch(() => [[]]);
  const invSettings = settingRow ? JSON.parse(settingRow.setting_value || '{}') : {};
  const defaultPaymentTermDays = invSettings?.defaultPaymentTermDays || 30;
  const paymentTermDays = po?.paymentTermDays || defaultPaymentTermDays;
  const invoiceItems = [];
  for (const grItem of gr.items || []) {
    const productId = grItem.productId?._id || grItem.productId;
    const poItem = po?.items?.find((pi) => (pi.productId?._id || pi.productId)?.toString() === productId?.toString());
    const unitPrice = Number.isFinite(grItem.unitPrice) ? grItem.unitPrice : (poItem?.unitPrice || 0);
    invoiceItems.push({ productId: productId?.toString(), satuan: grItem.satuan, quantity: grItem.receivedQty, unitPrice, discount: 0, subtotal: Math.round(grItem.receivedQty * unitPrice), batchNumber: grItem.batchNumber, expiryDate: grItem.expiryDate });
  }
  if (invoiceItems.length === 0) return null;
  const subtotal = invoiceItems.reduce((s, i) => s + i.subtotal, 0);
  const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
  const totalAmount = subtotal + ppnAmount;
  const invoiceDate = gr.receivingDate || new Date();
  const id = new mongoose.Types.ObjectId().toString();
  const supplierId = gr.supplierId?._id || gr.supplierId;
  await pool.query('INSERT INTO invoices (id, invoice_number, invoice_type, purchase_order_id, goods_receiving_id, supplier_id, status, invoice_date, sent_at, due_date, subtotal, ppn_rate, ppn_amount, discount, total_amount, paid_amount, remaining_amount, payment_term_days, notes, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,0,?,?,?,?,?,NOW(),NOW())', [id, manualInvoiceNumber, 'purchase', po?.id || po?._id || null, grId, supplierId, INVOICE_STATUS.SENT, invoiceDate, gr.verifiedAt || new Date(), new Date(invoiceDate.getTime() + paymentTermDays * 86400000), subtotal, isPkp ? ppnRate : 0, ppnAmount, totalAmount, totalAmount, paymentTermDays, `No. Faktur Supplier: ${manualInvoiceNumber}`, userId, userId]);
  for (let i = 0; i < invoiceItems.length; i++) {
    const item = invoiceItems[i]; const itemId = new mongoose.Types.ObjectId().toString();
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO invoice_items (id, invoice_id, product_id, satuan, quantity, unit_price, discount, subtotal, batch_number, expiry_date, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.satuan, item.quantity, item.unitPrice, item.discount, item.subtotal, item.batchNumber, item.expiryDate, i]);
  }
  return { id, _id: id };
};

const mysqlCreateJournalFromGR = async (gr, po) => {
  const pool = getMySQLPool();
  if (!pool) return;
  const [persediaan, hutangUsaha, ppnMasukan] = await Promise.all([mysqlGetCoaByCode(pool, '1300'), mysqlGetCoaByCode(pool, '2100'), mysqlGetCoaByCode(pool, '1410')]);
  if (!persediaan || !hutangUsaha) return;
  let subtotal = 0;
  for (const grItem of gr.items || []) {
    const productId = grItem.productId?._id || grItem.productId;
    const poItem = po?.items?.find((pi) => (pi.productId?._id || pi.productId)?.toString() === productId?.toString());
    const unitPrice = Number.isFinite(grItem.unitPrice) ? grItem.unitPrice : (poItem?.unitPrice || 0);
    subtotal += Math.round((grItem.receivedQty || 0) * unitPrice);
  }
  const { ppnRate, isPkp } = await mysqlGetPpnSettings(pool);
  const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
  const totalAmount = subtotal + ppnAmount;
  const entries = [{ accountId: persediaan.id, debit: subtotal, credit: 0, description: `Persediaan masuk dari ${gr.invoiceNumber || ''}` }, { accountId: hutangUsaha.id, debit: 0, credit: totalAmount, description: `Hutang atas penerimaan ${gr.invoiceNumber || ''}` }];
  if (ppnAmount > 0 && ppnMasukan) entries.push({ accountId: ppnMasukan.id, debit: ppnAmount, credit: 0, description: `PPN Masukan ${ppnRate}%` });
  await mysqlCreateJournalWithLines(pool, { date: gr.verifiedAt || new Date(), description: `Penerimaan Barang ${gr.invoiceNumber || ''}`, source: JOURNAL_SOURCE.GOODS_RECEIVING, sourceId: gr._id || gr.id, sourceNumber: gr.invoiceNumber || '', entries, createdBy: gr.verifiedBy || gr.updatedBy });
};

const mysqlCreateCOGSJournal = async (delivery) => {
  const pool = getMySQLPool();
  if (!pool) return;
  const [hpp, persediaan] = await Promise.all([mysqlGetCoaByCode(pool, '5100'), mysqlGetCoaByCode(pool, '1300')]);
  if (!hpp || !persediaan) return;
  let totalCOGS = 0;
  for (const item of delivery.items || []) {
    const productId = (item.productId?._id || item.productId || '').toString();
    if (item.batchNumber) {
      const [[batch]] = await pool.query('SELECT unit_price FROM stock_batches WHERE product_id = ? AND batch_number = ? LIMIT 1', [productId, item.batchNumber]).catch(() => [[]]);
      if (batch) { totalCOGS += Math.round((item.quantityShipped || item.quantity || 0) * (batch.unit_price || 0)); continue; }
    }
    const [[avgRow]] = await pool.query('SELECT AVG(unit_price) as avg_price FROM stock_batches WHERE product_id = ? AND quantity > 0', [productId]).catch(() => [[]]);
    if (avgRow?.avg_price) totalCOGS += Math.round((item.quantityShipped || item.quantity || 0) * avgRow.avg_price);
  }
  if (totalCOGS <= 0) return;
  const entries = [{ accountId: hpp.id, debit: totalCOGS, credit: 0, description: `HPP pengiriman ${delivery.deliveryNumber || delivery.invoiceNumber || ''}` }, { accountId: persediaan.id, debit: 0, credit: totalCOGS, description: `Pengurangan persediaan ${delivery.deliveryNumber || delivery.invoiceNumber || ''}` }];
  await mysqlCreateJournalWithLines(pool, { date: delivery.deliveredAt || new Date(), description: `HPP Delivery ${delivery.deliveryNumber || delivery.invoiceNumber || ''}`, source: JOURNAL_SOURCE.DELIVERY, sourceId: delivery._id || delivery.id, sourceNumber: delivery.deliveryNumber || delivery.invoiceNumber || '', entries, createdBy: delivery.updatedBy });
};

/**
 * MySQL: Auto-create Sales Revenue journal when sales invoice is created
 * DR Piutang Usaha (1200) = totalAmount (incl PPN)
 * CR Pendapatan Penjualan (4100) = subtotal
 * CR PPN Keluaran (2110) = ppnAmount (if PKP)
 */
const mysqlCreateSalesRevenueJournal = async (invoice) => {
  const pool = getMySQLPool();
  if (!pool) return;
  const [piutang, pendapatan, ppnKeluaran] = await Promise.all([
    mysqlGetCoaByCode(pool, '1200'),
    mysqlGetCoaByCode(pool, '4100'),
    mysqlGetCoaByCode(pool, '2110'),
  ]);
  if (!piutang || !pendapatan) return;

  const entries = [
    { accountId: piutang.id, debit: invoice.totalAmount, credit: 0, description: `Piutang penjualan ${invoice.invoiceNumber}` },
    { accountId: pendapatan.id, debit: 0, credit: invoice.subtotal, description: `Pendapatan penjualan ${invoice.invoiceNumber}` },
  ];

  if (invoice.ppnAmount > 0 && ppnKeluaran) {
    entries.push({ accountId: ppnKeluaran.id, debit: 0, credit: invoice.ppnAmount, description: `PPN Keluaran ${invoice.ppnRate || 11}%` });
  }

  await mysqlCreateJournalWithLines(pool, {
    date: invoice.invoiceDate || new Date(),
    description: `Invoice Penjualan ${invoice.invoiceNumber}`,
    source: JOURNAL_SOURCE.INVOICE,
    sourceId: invoice._id || invoice.id,
    sourceNumber: invoice.invoiceNumber,
    entries,
    createdBy: invoice.createdBy,
  });
};

const mysqlCreateJournalFromPayment = async (payment) => {
  const pool = getMySQLPool();
  if (!pool) return;
  const isIncoming = payment.invoiceType === 'sales';
  let debitAccount, creditAccount;
  if (isIncoming) {
    // Debit: Kas/Bank (1100), Credit: Piutang (1200)
    [debitAccount, creditAccount] = await Promise.all([mysqlGetCoaByCode(pool, '1100'), mysqlGetCoaByCode(pool, '1200')]);
  } else {
    // Debit: Hutang Usaha (2100), Credit: Kas/Bank (1100)
    [debitAccount, creditAccount] = await Promise.all([mysqlGetCoaByCode(pool, '2100'), mysqlGetCoaByCode(pool, '1100')]);
  }
  if (!debitAccount || !creditAccount) return;
  const entries = [
    { accountId: debitAccount.id, debit: payment.amount, credit: 0, description: isIncoming ? 'Penerimaan pembayaran' : 'Pelunasan hutang' },
    { accountId: creditAccount.id, debit: 0, credit: payment.amount, description: isIncoming ? 'Pelunasan piutang' : 'Pengeluaran kas/bank' },
  ];
  await mysqlCreateJournalWithLines(pool, { date: payment.paymentDate || new Date(), description: `Payment ${payment.referenceNumber || payment.id}`, source: JOURNAL_SOURCE.PAYMENT, sourceId: payment.id, sourceNumber: payment.referenceNumber || '', entries, createdBy: payment.createdBy });
};

const mysqlCreateJournalFromMemo = async (memo) => {
  const pool = getMySQLPool();
  if (!pool) return;
  const isCreditMemo = memo.type === MEMO_TYPE.CREDIT_MEMO;
  let debitAccount, creditAccount;
  if (isCreditMemo) {
    // Credit Memo: Debit Pendapatan (4100), Credit Piutang (1200)
    [debitAccount, creditAccount] = await Promise.all([mysqlGetCoaByCode(pool, '4100'), mysqlGetCoaByCode(pool, '1200')]);
  } else {
    // Debit Memo: Debit Piutang (1200), Credit Pendapatan (4100)
    [debitAccount, creditAccount] = await Promise.all([mysqlGetCoaByCode(pool, '1200'), mysqlGetCoaByCode(pool, '4100')]);
  }
  if (!debitAccount || !creditAccount) return;
  const amount = memo.amount || 0;
  const entries = [
    { accountId: debitAccount.id, debit: amount, credit: 0, description: isCreditMemo ? 'Credit memo - pengurangan pendapatan' : 'Debit memo - penambahan piutang' },
    { accountId: creditAccount.id, debit: 0, credit: amount, description: isCreditMemo ? 'Credit memo - pengurangan piutang' : 'Debit memo - penambahan pendapatan' },
  ];
  await mysqlCreateJournalWithLines(pool, { date: new Date(), description: `Memo ${memo.id}`, source: JOURNAL_SOURCE.MEMO, sourceId: memo.id, sourceNumber: '', entries, createdBy: memo.approvedBy || memo.createdBy });
};

// ─── MySQL AR/AP Functions ───

const mysqlGetReceivables = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { search, aging, page = 1, limit = 20 } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = ["inv.status IN ('sent','partially_paid','overdue')", 'inv.remaining_amount > 0', "inv.invoice_type = 'sales'"]; const params = [];
  if (search) { whereClauses.push('(c.name LIKE ? OR inv.invoice_number LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  const where = `WHERE ${whereClauses.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM invoices inv LEFT JOIN customers c ON inv.customer_id = c.id ${where}`, params);
  const [rows] = await pool.query(`SELECT inv.*, c.name as customer_name, c.code as customer_code, DATEDIFF(NOW(), inv.due_date) as days_overdue FROM invoices inv LEFT JOIN customers c ON inv.customer_id = c.id ${where} ORDER BY inv.due_date ASC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, invoiceNumber: r.invoice_number, status: r.status, customerId: { _id: r.customer_id, name: r.customer_name, code: r.customer_code }, invoiceDate: r.invoice_date, dueDate: r.due_date, totalAmount: Number(r.total_amount), paidAmount: Number(r.paid_amount), remainingAmount: Number(r.remaining_amount), daysOverdue: Math.max(0, r.days_overdue || 0) })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetPayables = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { search, page = 1, limit = 20 } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = ["inv.status IN ('sent','partially_paid','overdue')", 'inv.remaining_amount > 0', "inv.invoice_type = 'purchase'"]; const params = [];
  if (search) { whereClauses.push('(s.name LIKE ? OR inv.invoice_number LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  const where = `WHERE ${whereClauses.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM invoices inv LEFT JOIN suppliers s ON inv.supplier_id = s.id ${where}`, params);
  const [rows] = await pool.query(`SELECT inv.*, s.name as supplier_name, s.code as supplier_code, DATEDIFF(NOW(), inv.due_date) as days_overdue FROM invoices inv LEFT JOIN suppliers s ON inv.supplier_id = s.id ${where} ORDER BY inv.due_date ASC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, invoiceNumber: r.invoice_number, status: r.status, supplierId: { _id: r.supplier_id, name: r.supplier_name, code: r.supplier_code }, invoiceDate: r.invoice_date, dueDate: r.due_date, totalAmount: Number(r.total_amount), paidAmount: Number(r.paid_amount), remainingAmount: Number(r.remaining_amount), daysOverdue: Math.max(0, r.days_overdue || 0) })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlPayReceivable = async (invoiceId, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[inv]] = await pool.query('SELECT id, invoice_type, remaining_amount, status FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
  if (!inv) throw ApiError.notFound('Invoice tidak ditemukan');
  const payAmount = Number(data.amount);
  if (payAmount <= 0 || payAmount > inv.remaining_amount) throw ApiError.badRequest('Jumlah pembayaran tidak valid');
  const payId = new mongoose.Types.ObjectId().toString();
  await pool.query('INSERT INTO payments (id, invoice_id, amount, payment_date, payment_method, reference_number, notes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())', [payId, invoiceId, payAmount, data.paymentDate || new Date(), data.paymentMethod || 'transfer', data.referenceNumber || null, data.notes || null, userId]);
  const newRemaining = Number(inv.remaining_amount) - payAmount;
  const newStatus = newRemaining <= 0 ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIALLY_PAID;
  await pool.query('UPDATE invoices SET paid_amount = paid_amount + ?, remaining_amount = ?, status = ?, updated_at = NOW() WHERE id = ?', [payAmount, newRemaining, newStatus, invoiceId]);
  // Auto-create journal entry for payment
  try {
    await mysqlCreateJournalFromPayment({ id: payId, invoiceType: inv.invoice_type, amount: payAmount, paymentDate: data.paymentDate || new Date(), referenceNumber: data.referenceNumber || null, createdBy: userId });
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error(`Failed to create journal for payment ${payId}: ${err.message}`);
  }
  return { id: payId, _id: payId, invoiceId, amount: payAmount };
};

const mysqlPayPayable = async (invoiceId, data, userId) => mysqlPayReceivable(invoiceId, data, userId);
const mysqlCreateReceivablePayment = async (data, userId) => mysqlPayReceivable(data.invoiceId, data, userId);
const mysqlCreatePayablePayment = async (data, userId) => mysqlPayReceivable(data.invoiceId, data, userId);

const mysqlCreateMemo = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const id = new mongoose.Types.ObjectId().toString();
  await pool.query('INSERT INTO memos (id, type, invoice_id, amount, reason, status, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())', [id, data.type, data.invoiceId || null, data.amount, data.reason || '', MEMO_STATUS.PENDING, userId, userId]);
  return { id, _id: id, type: data.type, amount: data.amount, status: MEMO_STATUS.PENDING };
};

const mysqlApproveMemo = async (id, notes, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[memo]] = await pool.query('SELECT id, status, type, invoice_id, amount FROM memos WHERE id = ? LIMIT 1', [id]);
  if (!memo) throw ApiError.notFound('Memo tidak ditemukan');
  if (memo.status !== MEMO_STATUS.PENDING) throw ApiError.badRequest('Memo sudah diproses');
  await pool.query('UPDATE memos SET status = ?, approval_notes = ?, approved_by = ?, approved_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?', [MEMO_STATUS.APPROVED, notes || '', userId, userId, id]);
  // Auto-create journal entry for memo
  try {
    await mysqlCreateJournalFromMemo({ id, type: memo.type, amount: Number(memo.amount), approvedBy: userId });
  } catch (err) {
    const logger = require('../utils/logger');
    logger.error(`Failed to create journal for memo ${id}: ${err.message}`);
  }
  return { id, _id: id, status: MEMO_STATUS.APPROVED };
};

// ─── MySQL COA Functions ───

const mysqlGetChartOfAccounts = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { search, category, page = 1, limit = 100 } = queryParams || {};
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];
  if (search) { whereClauses.push('(coa.code LIKE ? OR coa.name LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  if (category) { whereClauses.push('coa.category = ?'); params.push(category); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM chart_of_accounts coa ${where}`, params);
  const [rows] = await pool.query(`SELECT * FROM chart_of_accounts coa ${where} ORDER BY coa.code ASC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, code: r.code, name: r.name, category: r.category, level: r.level, parentId: r.parent_id || null, description: r.description || '', balance: Number(r.balance), isActive: Boolean(r.is_active) })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlCreateChartOfAccount = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id FROM chart_of_accounts WHERE code = ? LIMIT 1', [data.code]);
  if (existing) throw ApiError.conflict(`Kode akun ${data.code} sudah digunakan`);
  const id = new mongoose.Types.ObjectId().toString();
  const level = data.level !== undefined ? data.level : 0;
  const parentId = data.parentId || null;
  const description = data.description || null;
  await pool.query('INSERT INTO chart_of_accounts (id, code, name, category, level, parent_id, description, balance, is_active, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,1,?,?,NOW(),NOW())', [id, data.code, data.name, data.category, level, parentId, description, userId, userId]);
  return { id, _id: id, code: data.code, name: data.name, category: data.category, level, parentId, description: description || '', balance: 0 };
};

const mysqlUpdateChartOfAccount = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id FROM chart_of_accounts WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Akun tidak ditemukan');
  const setClauses = ['updated_by = ?', 'updated_at = NOW()']; const values = [userId];
  if (data.name !== undefined) { setClauses.push('name = ?'); values.push(data.name); }
  if (data.category !== undefined) { setClauses.push('category = ?'); values.push(data.category); }
  if (data.level !== undefined) { setClauses.push('level = ?'); values.push(data.level); }
  if (data.parentId !== undefined) { setClauses.push('parent_id = ?'); values.push(data.parentId || null); }
  if (data.description !== undefined) { setClauses.push('description = ?'); values.push(data.description || null); }
  values.push(id);
  await pool.query(`UPDATE chart_of_accounts SET ${setClauses.join(', ')} WHERE id = ?`, values);
  const [[row]] = await pool.query('SELECT * FROM chart_of_accounts WHERE id = ? LIMIT 1', [id]);
  return { id: row.id, _id: row.id, code: row.code, name: row.name, category: row.category, level: row.level, parentId: row.parent_id || null, description: row.description || '', balance: Number(row.balance) };
};

const mysqlDeleteChartOfAccount = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id FROM chart_of_accounts WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Akun tidak ditemukan');
  const [[hasJournal]] = await pool.query('SELECT id FROM journal_entry_lines WHERE account_id = ? LIMIT 1', [id]);
  if (hasJournal) throw ApiError.badRequest('Akun tidak dapat dihapus karena sudah digunakan dalam jurnal');
  await pool.query('DELETE FROM chart_of_accounts WHERE id = ?', [id]);
};

// ─── MySQL Journal Functions ───

const mysqlGetJournalEntries = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 20, search, source, dateFrom, dateTo } = queryParams || {};
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];
  if (search) { whereClauses.push('(je.description LIKE ? OR je.source_number LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  if (source) { whereClauses.push('je.source = ?'); params.push(source); }
  if (dateFrom) { whereClauses.push('je.date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('je.date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM journal_entries je ${where}`, params);
  const [rows] = await pool.query(`SELECT je.*, u.name as created_by_name FROM journal_entries je LEFT JOIN users u ON je.created_by = u.id ${where} ORDER BY je.date DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  const jeIds = rows.map((r) => r.id); let linesMap = {};
  if (jeIds.length > 0) {
    const [lines] = await pool.query(`SELECT jel.*, coa.code, coa.name as account_name FROM journal_entry_lines jel LEFT JOIN chart_of_accounts coa ON jel.account_id = coa.id WHERE jel.journal_entry_id IN (${jeIds.map(() => '?').join(',')}) ORDER BY jel.sort_order ASC`, jeIds);
    for (const l of lines) { (linesMap[l.journal_entry_id] = linesMap[l.journal_entry_id] || []).push(l); }
  }
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, journalNumber: r.journal_number, date: r.date, description: r.description, source: r.source, sourceNumber: r.source_number, status: r.status, entries: (linesMap[r.id] || []).map((l) => ({ accountId: { _id: l.account_id, code: l.code, name: l.account_name }, debit: Number(l.debit), credit: Number(l.credit), description: l.description })), createdBy: r.created_by ? { _id: r.created_by, name: r.created_by_name } : null, createdAt: r.created_at })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlCreateManualJournal = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  if (!data.entries || data.entries.length < 2) throw ApiError.badRequest('Jurnal harus memiliki minimal 2 entri');
  const totalDebit = data.entries.reduce((s, e) => s + (e.debit || 0), 0);
  const totalCredit = data.entries.reduce((s, e) => s + (e.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw ApiError.badRequest('Total debit harus sama dengan total kredit');
  const id = await mysqlCreateJournalWithLines(pool, { date: data.date || new Date(), description: data.description, source: JOURNAL_SOURCE.MANUAL, sourceId: null, sourceNumber: data.referenceNumber || '', entries: data.entries, createdBy: userId });
  return { id, _id: id, description: data.description, status: JOURNAL_STATUS?.PENDING || 'pending' };
};

const mysqlApproveManualJournal = async (id, notes, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[row]] = await pool.query('SELECT id, status FROM journal_entries WHERE id = ? LIMIT 1', [id]);
  if (!row) throw ApiError.notFound('Jurnal tidak ditemukan');
  await pool.query('UPDATE journal_entries SET status = ?, approved_by = ?, approved_at = NOW(), approval_notes = ?, updated_at = NOW() WHERE id = ?', [JOURNAL_STATUS?.POSTED || 'posted', userId, notes || '', id]);
  return { id, _id: id, status: JOURNAL_STATUS?.POSTED || 'posted' };
};

const mysqlGetLedger = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { accountId, dateFrom, dateTo, page = 1, limit = 50 } = queryParams || {};
  if (!accountId) throw ApiError.badRequest('accountId diperlukan');
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = ['jel.account_id = ?']; const params = [accountId];
  if (dateFrom) { whereClauses.push('je.date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('je.date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = `WHERE ${whereClauses.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM journal_entry_lines jel JOIN journal_entries je ON jel.journal_entry_id = je.id ${where}`, params);
  const [rows] = await pool.query(`SELECT jel.*, je.date, je.description, je.source_number FROM journal_entry_lines jel JOIN journal_entries je ON jel.journal_entry_id = je.id ${where} ORDER BY je.date ASC, jel.sort_order LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  return { docs: rows.map((r) => ({ date: r.date, description: r.description, sourceNumber: r.source_number, debit: Number(r.debit), credit: Number(r.credit) })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetBalanceSheetReport = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [rows] = await pool.query("SELECT category, SUM(balance) as total FROM chart_of_accounts WHERE category IN ('asset','liability','equity') GROUP BY category");
  const map = {}; for (const r of rows) map[r.category] = Number(r.total || 0);
  return { assets: map.asset || 0, liabilities: map.liability || 0, equity: map.equity || 0 };
};

const mysqlGetProfitLossReport = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { dateFrom, dateTo } = queryParams || {};
  const whereClauses = []; const params = [];
  if (dateFrom) { whereClauses.push('je.date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('je.date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT coa.category, SUM(jel.debit - jel.credit) as net FROM journal_entry_lines jel JOIN journal_entries je ON jel.journal_entry_id = je.id JOIN chart_of_accounts coa ON jel.account_id = coa.id ${where} GROUP BY coa.category`, params);
  const map = {}; for (const r of rows) map[r.category] = Number(r.net || 0);
  const revenue = -(map.revenue || 0);
  const expense = map.expense || 0;
  return { revenue, expense, netProfit: revenue - expense };
};

const mysqlGetCashFlowReport = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { dateFrom, dateTo } = queryParams || {};
  const whereClauses = []; const params = [];
  if (dateFrom) { whereClauses.push('payment_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('payment_date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[rowIn]] = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments JOIN invoices ON payments.invoice_id = invoices.id WHERE invoices.invoice_type = 'sales' ${where.replace('payment_date', 'payments.payment_date')}`, params);
  const [[rowOut]] = await pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments JOIN invoices ON payments.invoice_id = invoices.id WHERE invoices.invoice_type = 'purchase' ${where.replace('payment_date', 'payments.payment_date')}`, params);
  return { inflow: Number(rowIn.total || 0), outflow: Number(rowOut.total || 0), netCashFlow: Number(rowIn.total || 0) - Number(rowOut.total || 0) };
};

const mysqlGetBankTransactions = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 20 } = queryParams || {};
  const offset = (Number(page) - 1) * Number(limit);
  const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM bank_transactions');
  const [rows] = await pool.query('SELECT bt.*, u.name as created_by_name FROM bank_transactions bt LEFT JOIN users u ON bt.created_by = u.id ORDER BY bt.transaction_date DESC LIMIT ? OFFSET ?', [Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, transactionDate: r.transaction_date, type: r.type, amount: Number(r.amount), description: r.description, referenceNumber: r.reference_number, createdBy: r.created_by ? { _id: r.created_by, name: r.created_by_name } : null, createdAt: r.created_at })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlCreateBankTransaction = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const id = new mongoose.Types.ObjectId().toString();
  await pool.query('INSERT INTO bank_transactions (id, transaction_date, type, amount, description, reference_number, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())', [id, data.transactionDate || new Date(), data.type, data.amount, data.description || '', data.referenceNumber || null, userId, userId]);
  return { id, _id: id, type: data.type, amount: data.amount };
};

const mysqlCreateReturnCOGSReversal = async (ret) => {
  const pool = getMySQLPool();
  if (!pool) return;
  const { DISPOSITION } = require('../constants');
  const [hpp, persediaan] = await Promise.all([mysqlGetCoaByCode(pool, '5100'), mysqlGetCoaByCode(pool, '1300')]);
  if (!hpp || !persediaan) return;
  let totalCOGS = 0;
  for (const item of ret.items || []) {
    // Only reverse COGS for restocked items
    if (item.disposition !== DISPOSITION.RESTOCK) continue;
    const qty = item.quantityReturned || item.quantity || 0;
    if (qty <= 0) continue;
    const productId = (item.productId?._id || item.productId || '').toString();
    // Try batch-specific price first
    if (item.batchNumber) {
      const [[batch]] = await pool.query('SELECT unit_price FROM stock_batches WHERE product_id = ? AND batch_number = ? LIMIT 1', [productId, item.batchNumber]).catch(() => [[]]);
      if (batch?.unit_price) { totalCOGS += Math.round(qty * batch.unit_price); continue; }
    }
    // Fallback: average cost
    const [[avgRow]] = await pool.query('SELECT AVG(unit_price) as avg_price FROM stock_batches WHERE product_id = ? AND quantity > 0', [productId]).catch(() => [[]]);
    if (avgRow?.avg_price) totalCOGS += Math.round(qty * avgRow.avg_price);
  }
  if (totalCOGS <= 0) return;
  const entries = [{ accountId: persediaan.id, debit: totalCOGS, credit: 0, description: `Reversal HPP retur ${ret.returnNumber || ''}` }, { accountId: hpp.id, debit: 0, credit: totalCOGS, description: `Reversal COGS ${ret.returnNumber || ''}` }];
  await mysqlCreateJournalWithLines(pool, { date: new Date(), description: `Reversal COGS Retur ${ret.returnNumber || ''}`, source: JOURNAL_SOURCE.RETURN, sourceId: ret._id || ret.id, sourceNumber: ret.returnNumber || '', entries, createdBy: ret.updatedBy });
};

// ─── Exported Functions with Provider Branching ───

const createInvoiceFromDelivery = (delivery, userId) => config.dbProvider === 'mysql' ? mysqlCreateInvoiceFromDelivery(delivery, userId) : mongoCreateInvoiceFromDelivery(delivery, userId);
const createInvoiceFromMultipleSOs = (orders, userId) => config.dbProvider === 'mysql' ? mysqlCreateInvoiceFromMultipleSOs(orders, userId) : mongoCreateInvoiceFromMultipleSOs(orders, userId);
const createPurchaseInvoiceFromGR = (gr, po, userId) => config.dbProvider === 'mysql' ? mysqlCreatePurchaseInvoiceFromGR(gr, po, userId) : mongoCreatePurchaseInvoiceFromGR(gr, po, userId);
const createJournalFromGR = (gr, po) => config.dbProvider === 'mysql' ? mysqlCreateJournalFromGR(gr, po) : mongoCreateJournalFromGR(gr, po);
const createCOGSJournal = (delivery) => config.dbProvider === 'mysql' ? mysqlCreateCOGSJournal(delivery) : mongoCreateCOGSJournal(delivery);
const createSalesRevenueJournal = (invoice) => config.dbProvider === 'mysql' ? mysqlCreateSalesRevenueJournal(invoice) : mongoCreateSalesRevenueJournal(invoice);
const getReceivables = (q) => config.dbProvider === 'mysql' ? mysqlGetReceivables(q) : mongoGetReceivables(q);
const createReceivablePayment = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateReceivablePayment(data, userId) : mongoCreateReceivablePayment(data, userId);
const payReceivable = (invoiceId, data, userId) => config.dbProvider === 'mysql' ? mysqlPayReceivable(invoiceId, data, userId) : mongoPayReceivable(invoiceId, data, userId);
const getPayables = (q) => config.dbProvider === 'mysql' ? mysqlGetPayables(q) : mongoGetPayables(q);
const createPayablePayment = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreatePayablePayment(data, userId) : mongoCreatePayablePayment(data, userId);
const payPayable = (invoiceId, data, userId) => config.dbProvider === 'mysql' ? mysqlPayPayable(invoiceId, data, userId) : mongoPayPayable(invoiceId, data, userId);
const createMemo = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateMemo(data, userId) : mongoCreateMemo(data, userId);
const approveMemo = (id, notes, userId) => config.dbProvider === 'mysql' ? mysqlApproveMemo(id, notes, userId) : mongoApproveMemo(id, notes, userId);
const getChartOfAccounts = (q) => config.dbProvider === 'mysql' ? mysqlGetChartOfAccounts(q) : mongoGetChartOfAccounts(q);
const createChartOfAccount = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateChartOfAccount(data, userId) : mongoCreateChartOfAccount(data, userId);
const updateChartOfAccount = (id, data, userId) => config.dbProvider === 'mysql' ? mysqlUpdateChartOfAccount(id, data, userId) : mongoUpdateChartOfAccount(id, data, userId);
const deleteChartOfAccount = (id) => config.dbProvider === 'mysql' ? mysqlDeleteChartOfAccount(id) : mongoDeleteChartOfAccount(id);
const getJournalEntries = (q) => config.dbProvider === 'mysql' ? mysqlGetJournalEntries(q) : mongoGetJournalEntries(q);
const createManualJournal = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateManualJournal(data, userId) : mongoCreateManualJournal(data, userId);
const approveManualJournal = (id, notes, userId) => config.dbProvider === 'mysql' ? mysqlApproveManualJournal(id, notes, userId) : mongoApproveManualJournal(id, notes, userId);
const getLedger = (q) => config.dbProvider === 'mysql' ? mysqlGetLedger(q) : mongoGetLedger(q);
const getBalanceSheetReport = (q) => config.dbProvider === 'mysql' ? mysqlGetBalanceSheetReport(q) : mongoGetBalanceSheetReport(q);
const getProfitLossReport = (q) => config.dbProvider === 'mysql' ? mysqlGetProfitLossReport(q) : mongoGetProfitLossReport(q);
const getCashFlowReport = (q) => config.dbProvider === 'mysql' ? mysqlGetCashFlowReport(q) : mongoGetCashFlowReport(q);
const getBankTransactions = (q) => config.dbProvider === 'mysql' ? mysqlGetBankTransactions(q) : mongoGetBankTransactions(q);
const createBankTransaction = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateBankTransaction(data, userId) : mongoCreateBankTransaction(data, userId);
const createReturnCOGSReversal = (ret) => config.dbProvider === 'mysql' ? mysqlCreateReturnCOGSReversal(ret) : mongoCreateReturnCOGSReversal(ret);

module.exports = {
  // Integrations
  createInvoiceFromDelivery,
  createInvoiceFromMultipleSOs,
  createPurchaseInvoiceFromGR,
  createJournalFromGR,
  createCOGSJournal,
  createSalesRevenueJournal,
  // AR
  getReceivables,
  createReceivablePayment,
  payReceivable,
  // AP
  getPayables,
  createPayablePayment,
  payPayable,
  // Memos
  createMemo,
  approveMemo,
  // GL
  getChartOfAccounts,
  createChartOfAccount,
  updateChartOfAccount,
  deleteChartOfAccount,
  getJournalEntries,
  createManualJournal,
  approveManualJournal,
  getLedger,
  getBalanceSheetReport,
  getProfitLossReport,
  getCashFlowReport,
  // Bank Transactions
  getBankTransactions,
  createBankTransaction,
  // Return Integration
  createReturnCOGSReversal,
};
