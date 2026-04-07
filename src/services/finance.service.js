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
} = require('../constants');

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
const createInvoiceFromDelivery = async (delivery, userId) => {
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
 * Auto-create purchase invoice from a verified Goods Receiving
 * DR Persediaan / CR Hutang — jurnal sudah dibuat di createJournalFromGR
 * Ini hanya membuat dokumen Invoice tipe purchase untuk tracking hutang
 */
const createPurchaseInvoiceFromGR = async (gr, po, userId) => {
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

const getReceivables = async (queryParams) => {
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

const getPayables = async (queryParams) => {
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

const createReceivablePayment = async (data, userId) => {
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

const payReceivable = async (invoiceId, data, userId) => {
  const payment = await createReceivablePayment({ ...data, invoiceId }, userId);
  const verificationNotes = data.verificationNotes ?? data.notes ?? '';
  await verifyPayment(payment._id, verificationNotes, userId);
  return getPaymentById(payment._id);
};

const createPayablePayment = async (data, userId) => {
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

const payPayable = async (invoiceId, data, userId) => {
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

const createMemo = async (data, userId) => {
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

const approveMemo = async (id, notes, userId) => {
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

const getChartOfAccounts = async (queryParams) => {
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

const createChartOfAccount = async (data, userId) => {
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

const updateChartOfAccount = async (id, data, userId) => {
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

const deleteChartOfAccount = async (id) => {
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

const getJournalEntries = async (queryParams) => {
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

const createManualJournal = async (data, userId) => {
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

const approveManualJournal = async (id, notes, userId) => {
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

const getLedger = async (queryParams) => {
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

const getBalanceSheetReport = async (queryParams) => {
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

const getProfitLossReport = async (queryParams) => {
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

const getCashFlowReport = async (queryParams) => {
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
 * DR PPN Masukan (2110) = ppnAmount (jika PKP)
 * CR Hutang Usaha (2100) = totalAmount
 */
const createJournalFromGR = async (gr, po) => {
  const persediaan = await ChartOfAccount.findOne({ code: '1300' });
  const hutangUsaha = await ChartOfAccount.findOne({ code: '2100' });
  const ppnMasukan = await ChartOfAccount.findOne({ code: '2110' });

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
const createCOGSJournal = async (delivery) => {
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

const getBankTransactions = async (queryParams) => {
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

const createBankTransaction = async (data, userId) => {
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
const createReturnCOGSReversal = async (ret) => {
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

module.exports = {
  // Integrations
  createInvoiceFromDelivery,
  createPurchaseInvoiceFromGR,
  createJournalFromGR,
  createCOGSJournal,
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
