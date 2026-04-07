/**
 * Comprehensive fix: create all missing journals and invoices
 * for existing transactions retroactively
 */
const config = require('../src/config');
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(config.mongo.uri);
  console.log('Connected to DB\n');

  const Invoice = require('../src/models/Invoice');
  const Payment = require('../src/models/Payment');
  const JournalEntry = require('../src/models/JournalEntry');
  const PurchaseOrder = require('../src/models/PurchaseOrder');
  const GoodsReceiving = require('../src/models/GoodsReceiving');
  const SalesOrder = require('../src/models/SalesOrder');
  const StockBatch = require('../src/models/StockBatch');
  const Delivery = require('../src/models/Delivery');
  const ChartOfAccount = require('../src/models/ChartOfAccount');
  const AppSetting = require('../src/models/AppSetting');
  const Product = require('../src/models/Product');
  const Customer = require('../src/models/Customer');
  const { JOURNAL_SOURCE } = require('../src/constants');

  // Preload COA accounts
  const COA = {};
  const coaList = await ChartOfAccount.find({}).lean();
  coaList.forEach(c => { COA[c.code] = c; });

  const settings = await AppSetting.getSettings();
  const ppnRate = settings?.company?.tax?.defaultPpnRate || 11;
  const isPkp = settings?.company?.tax?.isPkp !== false;

  let created = 0;

  // Helper: create journal and update balances
  async function createJournal(data) {
    const existing = await JournalEntry.findOne({
      source: data.source,
      sourceId: data.sourceId,
    });
    if (existing) {
      console.log(`  [SKIP] Journal already exists for ${data.source}:${data.sourceNumber}`);
      return;
    }

    const journal = new JournalEntry(data);
    await journal.save();

    for (const entry of data.entries) {
      await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
        $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
      });
    }

    created++;
    console.log(`  [OK] Created journal: ${data.source} - ${data.sourceNumber}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 1. Create journals for all verified GRs (DR Persediaan, CR Hutang Usaha + PPN)
  // ═══════════════════════════════════════════════════════════
  console.log('=== 1. GOODS RECEIVING JOURNALS ===');
  const grs = await GoodsReceiving.find({ status: { $in: ['verified', 'completed'] } }).lean();

  for (const gr of grs) {
    if (!gr.purchaseOrderId) {
      console.log(`  [SKIP] GR ${gr.receivingNumber} has no PO`);
      continue;
    }

    const po = await PurchaseOrder.findById(gr.purchaseOrderId).lean();
    if (!po) {
      console.log(`  [SKIP] PO not found for GR ${gr.receivingNumber}`);
      continue;
    }

    // Calculate received value from PO pricing
    let subtotal = 0;
    for (const grItem of gr.items) {
      const poItem = po.items.find(
        pi => pi.productId.toString() === grItem.productId.toString()
      );
      if (!poItem) continue;
      const itemDiscount = poItem.discount || 0;
      subtotal += Math.round(grItem.receivedQty * poItem.unitPrice * (1 - itemDiscount / 100));
    }

    const ppnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
    const totalAmount = subtotal + ppnAmount;

    const entries = [
      {
        accountId: COA['1300']._id,
        debit: subtotal,
        credit: 0,
        description: `Persediaan masuk dari ${gr.receivingNumber}`,
      },
      {
        accountId: COA['2100']._id,
        debit: 0,
        credit: totalAmount,
        description: `Hutang atas penerimaan ${gr.receivingNumber}`,
      },
    ];

    if (ppnAmount > 0 && COA['2110']) {
      entries.push({
        accountId: COA['2110']._id,
        debit: ppnAmount,
        credit: 0,
        description: `PPN Masukan ${ppnRate}%`,
      });
    }

    await createJournal({
      date: gr.verifiedAt || gr.receivingDate || new Date(),
      description: `Penerimaan Barang ${gr.receivingNumber}`,
      source: JOURNAL_SOURCE.GOODS_RECEIVING,
      sourceId: gr._id,
      sourceNumber: gr.receivingNumber,
      entries,
      createdBy: gr.verifiedBy || gr.createdBy,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 2. Create missing invoices for delivered deliveries
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== 2. MISSING INVOICES ===');
  const deliveries = await Delivery.find({ status: 'delivered' }).lean();

  for (const delivery of deliveries) {
    // Check if invoice exists for this delivery
    const existingInv = await Invoice.findOne({ deliveryId: delivery._id });
    if (existingInv) {
      console.log(`  [SKIP] Invoice already exists for ${delivery.deliveryNumber}: ${existingInv.invoiceNumber}`);
      continue;
    }

    const so = await SalesOrder.findById(delivery.salesOrderId).populate('items.productId', 'name sku satuan').lean();
    if (!so) {
      console.log(`  [SKIP] SO not found for ${delivery.deliveryNumber}`);
      continue;
    }

    // Map delivery items to invoice items with SO pricing
    const invoiceItems = [];
    for (const dItem of delivery.items) {
      const soItem = so.items.find(
        si => si.productId._id.toString() === dItem.productId.toString()
      );
      if (!soItem) continue;

      const itemDiscount = Math.round(
        dItem.quantityShipped * soItem.unitPrice * (soItem.discount / 100)
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

    if (invoiceItems.length === 0) continue;

    const subtotal = invoiceItems.reduce((sum, item) => sum + item.subtotal, 0);
    const invPpnAmount = isPkp ? Math.round(subtotal * ppnRate / 100) : 0;
    const totalAmount = subtotal + invPpnAmount;

    const invoice = new Invoice({
      salesOrderId: delivery.salesOrderId,
      deliveryId: delivery._id,
      customerId: delivery.customerId,
      invoiceDate: delivery.deliveredAt || new Date(),
      dueDate: new Date((delivery.deliveredAt || Date.now()).valueOf() + (so.paymentTermDays || 30) * 86400000),
      items: invoiceItems,
      subtotal,
      ppnRate: isPkp ? ppnRate : 0,
      ppnAmount: invPpnAmount,
      discount: 0,
      totalAmount,
      paidAmount: 0,
      remainingAmount: totalAmount,
      paymentTermDays: so.paymentTermDays || 30,
      status: 'sent',
      sentAt: delivery.deliveredAt || new Date(),
      createdBy: delivery.createdBy || delivery.updatedBy,
      updatedBy: delivery.updatedBy,
    });

    await invoice.save();
    console.log(`  [OK] Created invoice ${invoice.invoiceNumber} for ${delivery.deliveryNumber} (total: ${totalAmount})`);

    // Create journal for this invoice
    const invEntries = [
      {
        accountId: COA['1200']._id,
        debit: totalAmount,
        credit: 0,
        description: `Piutang dari invoice ${invoice.invoiceNumber}`,
      },
      {
        accountId: COA['4100']._id,
        debit: 0,
        credit: totalAmount - (invPpnAmount || 0),
        description: 'Pendapatan penjualan',
      },
    ];

    if (invPpnAmount > 0 && COA['2110']) {
      invEntries.push({
        accountId: COA['2110']._id,
        debit: 0,
        credit: invPpnAmount,
        description: `PPN Keluaran ${ppnRate}%`,
      });
    }

    await createJournal({
      date: invoice.sentAt || new Date(),
      description: `Invoice ${invoice.invoiceNumber}`,
      source: JOURNAL_SOURCE.INVOICE,
      sourceId: invoice._id,
      sourceNumber: invoice.invoiceNumber,
      entries: invEntries,
      createdBy: invoice.createdBy,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 3. Create COGS journals for all delivered deliveries
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== 3. COGS JOURNALS (HPP) ===');

  for (const delivery of deliveries) {
    // Check if COGS journal already exists
    const existingCogs = await JournalEntry.findOne({
      source: JOURNAL_SOURCE.DELIVERY,
      sourceId: delivery._id,
    });
    if (existingCogs) {
      console.log(`  [SKIP] COGS journal already exists for ${delivery.deliveryNumber}`);
      continue;
    }

    let totalCOGS = 0;
    for (const item of delivery.items) {
      // Look up the batch for cost
      if (item.batchNumber) {
        const batch = await StockBatch.findOne({
          productId: item.productId,
          batchNumber: item.batchNumber,
        }).lean();
        if (batch) {
          totalCOGS += Math.round(item.quantityShipped * (batch.unitPrice || 0));
          continue;
        }
      }
      // Fallback: find any batch for this product
      const batches = await StockBatch.find({ productId: item.productId }).lean();
      if (batches.length > 0) {
        const avgPrice = batches.reduce((s, b) => s + (b.unitPrice || 0), 0) / batches.length;
        totalCOGS += Math.round(item.quantityShipped * avgPrice);
      }
    }

    if (totalCOGS <= 0) {
      console.log(`  [SKIP] No COGS calculable for ${delivery.deliveryNumber}`);
      continue;
    }

    await createJournal({
      date: delivery.deliveredAt || new Date(),
      description: `HPP Delivery ${delivery.deliveryNumber}`,
      source: JOURNAL_SOURCE.DELIVERY,
      sourceId: delivery._id,
      sourceNumber: delivery.deliveryNumber,
      entries: [
        {
          accountId: COA['5100']._id,
          debit: totalCOGS,
          credit: 0,
          description: `HPP pengiriman ${delivery.deliveryNumber}`,
        },
        {
          accountId: COA['1300']._id,
          debit: 0,
          credit: totalCOGS,
          description: `Pengurangan persediaan ${delivery.deliveryNumber}`,
        },
      ],
      createdBy: delivery.updatedBy,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 4. Update PO remainingAmount for all POs
  // ═══════════════════════════════════════════════════════════
  console.log('\n=== 4. UPDATE PO REMAINING AMOUNTS ===');
  const allPOs = await PurchaseOrder.find({});
  for (const po of allPOs) {
    po.remainingAmount = Math.max(0, po.totalAmount - (po.paidAmount || 0));
    await po.save();
    console.log(`  [OK] ${po.poNumber} remaining: ${po.remainingAmount}`);
  }

  // ═══════════════════════════════════════════════════════════
  // 5. Summary
  // ═══════════════════════════════════════════════════════════
  console.log(`\n=== SUMMARY ===`);
  console.log(`Created ${created} new journal entries`);

  // Final COA balances
  const finalCoas = await ChartOfAccount.find(
    { code: { $in: ['1200', '1300', '2100', '2110', '4100', '5100'] } },
    { code: 1, name: 1, balance: 1 }
  ).sort('code').lean();
  console.log('\nKey COA Balances:');
  finalCoas.forEach(c => console.log(`  ${c.code} ${c.name}: ${c.balance.toLocaleString('id-ID')}`));

  // Final invoice count
  const totalInvoices = await Invoice.countDocuments();
  const totalJournals = await JournalEntry.countDocuments();
  console.log(`\nTotal Invoices: ${totalInvoices}`);
  console.log(`Total Journal Entries: ${totalJournals}`);

  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(e => { console.error(e); process.exit(1); });
