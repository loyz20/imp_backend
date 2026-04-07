/**
 * Audit script: check all existing transactions and their journal status
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
  const StockMutation = require('../src/models/StockMutation');
  const ChartOfAccount = require('../src/models/ChartOfAccount');

  // Check models that might not exist
  let Delivery, Customer, Memo;
  try { Delivery = require('../src/models/Delivery'); } catch(e) { console.log('No Delivery model'); }
  try { Customer = require('../src/models/Customer'); } catch(e) { console.log('No Customer model'); }
  try { Memo = require('../src/models/Memo'); } catch(e) { console.log('No Memo model'); }

  console.log('=== CHART OF ACCOUNTS ===');
  const coas = await ChartOfAccount.find({}, { code: 1, name: 1, balance: 1 }).sort('code').lean();
  coas.forEach(c => console.log(`  ${c.code} ${c.name}: ${c.balance}`));

  console.log('\n=== SALES ORDERS ===');
  const sos = await SalesOrder.find({}, { soNumber: 1, status: 1, orderDate: 1, totalAmount: 1 }).lean();
  console.log(`Total: ${sos.length}`);
  sos.forEach(s => console.log(`  ${s.soNumber} | ${s.status} | ${s.orderDate?.toISOString().split('T')[0]} | ${s.totalAmount}`));

  console.log('\n=== PURCHASE ORDERS ===');
  const pos = await PurchaseOrder.find({}, { poNumber: 1, status: 1, orderDate: 1, totalAmount: 1, paidAmount: 1, remainingAmount: 1 }).lean();
  console.log(`Total: ${pos.length}`);
  pos.forEach(p => console.log(`  ${p.poNumber} | ${p.status} | ${p.orderDate?.toISOString().split('T')[0]} | ${p.totalAmount} | paid:${p.paidAmount||0}`));

  console.log('\n=== GOODS RECEIVING ===');
  const grs = await GoodsReceiving.find({}, { receivingNumber: 1, status: 1, purchaseOrderId: 1, receivingDate: 1, items: 1 }).lean();
  console.log(`Total: ${grs.length}`);
  grs.forEach(g => {
    const totalQty = g.items.reduce((s, i) => s + i.receivedQty, 0);
    console.log(`  ${g.receivingNumber} | ${g.status} | PO:${g.purchaseOrderId || 'none'} | ${g.receivingDate?.toISOString().split('T')[0]} | items:${g.items.length} totalQty:${totalQty}`);
  });

  if (Delivery) {
    console.log('\n=== DELIVERIES ===');
    const dels = await Delivery.find({}, { deliveryNumber: 1, status: 1, salesOrderId: 1, deliveredAt: 1, items: 1 }).lean();
    console.log(`Total: ${dels.length}`);
    dels.forEach(d => {
      const totalQty = d.items ? d.items.reduce((s, i) => s + (i.quantityShipped || 0), 0) : 0;
      console.log(`  ${d.deliveryNumber} | ${d.status} | SO:${d.salesOrderId} | delivered:${d.deliveredAt?.toISOString().split('T')[0] || 'N/A'} | qty:${totalQty}`);
    });
  }

  console.log('\n=== INVOICES ===');
  const invs = await Invoice.find({}, { invoiceNumber: 1, status: 1, invoiceDate: 1, totalAmount: 1, subtotal: 1, ppnAmount: 1, paidAmount: 1, deliveryId: 1 }).lean();
  console.log(`Total: ${invs.length}`);
  invs.forEach(i => console.log(`  ${i.invoiceNumber} | ${i.status} | ${i.invoiceDate?.toISOString().split('T')[0]} | total:${i.totalAmount} sub:${i.subtotal} ppn:${i.ppnAmount} paid:${i.paidAmount} delivery:${i.deliveryId || 'none'}`));

  console.log('\n=== PAYMENTS ===');
  const pays = await Payment.find({}, { paymentNumber: 1, status: 1, type: 1, amount: 1, invoiceId: 1, purchaseOrderId: 1, paymentDate: 1 }).lean();
  console.log(`Total: ${pays.length}`);
  pays.forEach(p => console.log(`  ${p.paymentNumber} | ${p.status} | ${p.type} | ${p.amount} | inv:${p.invoiceId || 'none'} po:${p.purchaseOrderId || 'none'} | ${p.paymentDate?.toISOString().split('T')[0]}`));

  if (Memo) {
    console.log('\n=== MEMOS ===');
    const memos = await Memo.find({}, { memoNumber: 1, status: 1, type: 1, totalAmount: 1 }).lean();
    console.log(`Total: ${memos.length}`);
    memos.forEach(m => console.log(`  ${m.memoNumber} | ${m.status} | ${m.type} | ${m.totalAmount}`));
  }

  console.log('\n=== JOURNAL ENTRIES ===');
  const journals = await JournalEntry.find({}, { description: 1, source: 1, sourceNumber: 1, date: 1, entries: 1 }).lean();
  console.log(`Total: ${journals.length}`);
  journals.forEach(j => {
    console.log(`  ${j.source} | ${j.sourceNumber} | ${j.date?.toISOString().split('T')[0]}`);
    j.entries.forEach(e => {
      const acc = coas.find(c => c._id.toString() === e.accountId.toString());
      console.log(`    ${acc?.code || '?'} ${acc?.name || '?'} DR:${e.debit} CR:${e.credit}`);
    });
  });

  console.log('\n=== STOCK BATCHES ===');
  const batches = await StockBatch.find({}, { productId: 1, batchNumber: 1, quantity: 1, unitPrice: 1, status: 1, expiryDate: 1 }).lean();
  console.log(`Total: ${batches.length}`);
  batches.forEach(b => console.log(`  ${b.batchNumber} | qty:${b.quantity} | price:${b.unitPrice} | ${b.status} | exp:${b.expiryDate?.toISOString().split('T')[0]}`));

  console.log('\n=== STOCK MUTATIONS ===');
  const mutations = await StockMutation.find({}, { type: 1, referenceType: 1, quantity: 1, productId: 1 }).lean();
  console.log(`Total: ${mutations.length}`);
  const mutSummary = {};
  mutations.forEach(m => {
    const key = `${m.type}-${m.referenceType}`;
    mutSummary[key] = (mutSummary[key] || 0) + 1;
  });
  Object.entries(mutSummary).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
