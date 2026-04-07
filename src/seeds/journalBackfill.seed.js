const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');
const {
  INVOICE_STATUS,
  FINANCE_PAYMENT_STATUS,
  PAYMENT_TYPE,
  JOURNAL_SOURCE,
} = require('../constants');

const ChartOfAccount = require('../models/ChartOfAccount');
const JournalEntry = require('../models/JournalEntry');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const GoodsReceiving = require('../models/GoodsReceiving');
const PurchaseOrder = require('../models/PurchaseOrder');
const StockBatch = require('../models/StockBatch');
const AppSetting = require('../models/AppSetting');

const getAccounts = async () => {
  const [kasBank, piutang, persediaan, hutangUsaha, ppn, pendapatan, hpp] = await Promise.all([
    ChartOfAccount.findOne({ code: '1100' }),
    ChartOfAccount.findOne({ code: '1200' }),
    ChartOfAccount.findOne({ code: '1300' }),
    ChartOfAccount.findOne({ code: '2100' }),
    ChartOfAccount.findOne({ code: '2110' }),
    ChartOfAccount.findOne({ code: '4100' }),
    ChartOfAccount.findOne({ code: '5100' }),
  ]);

  if (!kasBank || !piutang || !persediaan || !hutangUsaha || !pendapatan || !hpp) {
    throw new Error('Akun COA inti tidak lengkap. Jalankan seed COA terlebih dahulu.');
  }

  return {
    kasBank,
    piutang,
    persediaan,
    hutangUsaha,
    ppn,
    pendapatan,
    hpp,
  };
};

const applyBalanceDeltas = async (entries) => {
  for (const entry of entries) {
    await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
      $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
    });
  }
};

const createJournalIfMissing = async (payload) => {
  if (!payload.sourceId) return { created: false, reason: 'missing-source-id' };

  const exists = await JournalEntry.findOne({
    source: payload.source,
    sourceId: payload.sourceId,
  })
    .select('_id')
    .lean();

  if (exists) return { created: false, reason: 'already-exists' };

  const journal = new JournalEntry(payload);
  await journal.save();
  await applyBalanceDeltas(payload.entries);
  return { created: true, journalId: journal._id };
};

const backfillInvoiceJournals = async (accounts) => {
  const invoiceFilter = {
    invoiceType: 'sales',
    status: { $in: [INVOICE_STATUS.SENT, INVOICE_STATUS.PARTIALLY_PAID, INVOICE_STATUS.PAID, INVOICE_STATUS.OVERDUE] },
  };

  const invoices = await Invoice.find(invoiceFilter)
    .select('_id invoiceNumber status totalAmount ppnAmount ppnRate sentAt updatedBy createdAt')
    .lean();

  let created = 0;
  let skipped = 0;

  for (const inv of invoices) {
    const entries = [
      {
        accountId: accounts.piutang._id,
        debit: inv.totalAmount,
        credit: 0,
        description: `Piutang dari invoice ${inv.invoiceNumber}`,
      },
      {
        accountId: accounts.pendapatan._id,
        debit: 0,
        credit: inv.totalAmount - (inv.ppnAmount || 0),
        description: 'Pendapatan penjualan',
      },
    ];

    if ((inv.ppnAmount || 0) > 0 && accounts.ppn) {
      entries.push({
        accountId: accounts.ppn._id,
        debit: 0,
        credit: inv.ppnAmount,
        description: `PPN Keluaran ${inv.ppnRate || 0}%`,
      });
    }

    const result = await createJournalIfMissing({
      date: inv.sentAt || inv.createdAt || new Date(),
      description: `Invoice ${inv.invoiceNumber}`,
      source: JOURNAL_SOURCE.INVOICE,
      sourceId: inv._id,
      sourceNumber: inv.invoiceNumber,
      entries,
      createdBy: inv.updatedBy || null,
    });

    if (result.created) created += 1;
    else skipped += 1;
  }

  return { total: invoices.length, created, skipped };
};

const backfillPaymentJournals = async (accounts) => {
  const payments = await Payment.find({ status: FINANCE_PAYMENT_STATUS.VERIFIED })
    .select('_id paymentNumber type amount verifiedAt paymentDate verifiedBy createdAt')
    .lean();

  let created = 0;
  let skipped = 0;

  for (const pay of payments) {
    const isIncoming = pay.type === PAYMENT_TYPE.INCOMING;

    const entries = [
      {
        accountId: isIncoming ? accounts.kasBank._id : accounts.hutangUsaha._id,
        debit: pay.amount,
        credit: 0,
        description: isIncoming ? 'Penerimaan pembayaran' : 'Pelunasan hutang',
      },
      {
        accountId: isIncoming ? accounts.piutang._id : accounts.kasBank._id,
        debit: 0,
        credit: pay.amount,
        description: isIncoming ? 'Pelunasan piutang' : 'Pengeluaran kas/bank',
      },
    ];

    const result = await createJournalIfMissing({
      date: pay.verifiedAt || pay.paymentDate || pay.createdAt || new Date(),
      description: `Payment ${pay.paymentNumber}`,
      source: JOURNAL_SOURCE.PAYMENT,
      sourceId: pay._id,
      sourceNumber: pay.paymentNumber,
      entries,
      createdBy: pay.verifiedBy || null,
    });

    if (result.created) created += 1;
    else skipped += 1;
  }

  return { total: payments.length, created, skipped };
};

const backfillGRJournals = async (accounts) => {
  const settings = await AppSetting.getSettings();
  const ppnRate = settings?.company?.tax?.defaultPpnRate || 11;
  const isPkp = settings?.company?.tax?.isPkp !== false;

  const grs = await GoodsReceiving.find({
    purchaseOrderId: { $ne: null },
    status: { $in: ['verified', 'completed'] },
  })
    .select('_id invoiceNumber verifiedAt updatedBy purchaseOrderId items')
    .lean();

  let created = 0;
  let skipped = 0;

  for (const gr of grs) {
    const po = await PurchaseOrder.findById(gr.purchaseOrderId)
      .select('items')
      .lean();

    if (!po) {
      skipped += 1;
      continue;
    }

    let subtotal = 0;
    for (const grItem of gr.items || []) {
      const poItem = (po.items || []).find(
        (pi) => String(pi.productId) === String(grItem.productId),
      );
      if (!poItem) continue;
      const unitPrice = Number.isFinite(grItem.unitPrice) ? grItem.unitPrice : poItem.unitPrice;
      subtotal += Math.round((grItem.receivedQty || 0) * unitPrice);
    }

    if (subtotal <= 0) {
      skipped += 1;
      continue;
    }

    const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
    const totalAmount = subtotal + ppnAmount;

    const entries = [
      {
        accountId: accounts.persediaan._id,
        debit: subtotal,
        credit: 0,
        description: `Persediaan masuk dari ${gr.invoiceNumber}`,
      },
      {
        accountId: accounts.hutangUsaha._id,
        debit: 0,
        credit: totalAmount,
        description: `Hutang atas penerimaan ${gr.invoiceNumber}`,
      },
    ];

    if (ppnAmount > 0 && accounts.ppn) {
      entries.push({
        accountId: accounts.ppn._id,
        debit: ppnAmount,
        credit: 0,
        description: `PPN Masukan ${ppnRate}%`,
      });
    }

    const result = await createJournalIfMissing({
      date: gr.verifiedAt || new Date(),
      description: `Penerimaan Barang ${gr.invoiceNumber}`,
      source: JOURNAL_SOURCE.GOODS_RECEIVING,
      sourceId: gr._id,
      sourceNumber: gr.invoiceNumber,
      entries,
      createdBy: gr.updatedBy || null,
    });

    if (result.created) created += 1;
    else skipped += 1;
  }

  return { total: grs.length, created, skipped };
};


const runBackfill = async () => {
  const accounts = await getAccounts();

  const invoice = await backfillInvoiceJournals(accounts);
  const payment = await backfillPaymentJournals(accounts);
  const goodsReceiving = await backfillGRJournals(accounts);

  const journalCount = await JournalEntry.countDocuments();

  logger.info(`Backfill invoice journals: ${JSON.stringify(invoice)}`);
  logger.info(`Backfill payment journals: ${JSON.stringify(payment)}`);
  logger.info(`Backfill goods receiving journals: ${JSON.stringify(goodsReceiving)}`);
  logger.info(`Total journal entries after backfill: ${journalCount}`);
};

module.exports = runBackfill;

if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(config.mongo.uri);
      logger.info('MongoDB connected for journal backfill');
      await runBackfill();
      await mongoose.disconnect();
      logger.info('MongoDB disconnected');
      process.exit(0);
    } catch (error) {
      logger.error(`Journal backfill failed: ${error.message}`);
      try {
        await mongoose.disconnect();
      } catch {
        // noop
      }
      process.exit(1);
    }
  })();
}
