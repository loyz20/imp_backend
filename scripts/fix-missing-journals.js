const config = require('../src/config');
const mongoose = require('mongoose');
const Invoice = require('../src/models/Invoice');
const ChartOfAccount = require('../src/models/ChartOfAccount');
const JournalEntry = require('../src/models/JournalEntry');
const { JOURNAL_SOURCE } = require('../src/constants');

async function main() {
  await mongoose.connect(config.mongo.uri);
  console.log('Connected to DB');

  // Find sent invoices that don't have a journal yet
  const sentInvoices = await Invoice.find({ status: 'sent' }).lean();
  console.log('Sent invoices:', sentInvoices.length);

  for (const invoice of sentInvoices) {
    // Check if journal already exists
    const existing = await JournalEntry.findOne({
      source: JOURNAL_SOURCE.INVOICE,
      sourceId: invoice._id,
    });
    if (existing) {
      console.log(`Journal already exists for ${invoice.invoiceNumber}, skipping`);
      continue;
    }

    const piutang = await ChartOfAccount.findOne({ code: '1200' });
    const pendapatan = await ChartOfAccount.findOne({ code: '4100' });
    const ppn = await ChartOfAccount.findOne({ code: '2110' });

    if (!piutang || !pendapatan) {
      console.log('Missing COA accounts!');
      continue;
    }

    const entries = [
      {
        accountId: piutang._id,
        debit: invoice.totalAmount,
        credit: 0,
        description: `Piutang dari invoice ${invoice.invoiceNumber}`,
      },
      {
        accountId: pendapatan._id,
        debit: 0,
        credit: invoice.totalAmount - (invoice.ppnAmount || 0),
        description: 'Pendapatan penjualan',
      },
    ];

    if (invoice.ppnAmount > 0 && ppn) {
      entries.push({
        accountId: ppn._id,
        debit: 0,
        credit: invoice.ppnAmount,
        description: `PPN Keluaran ${invoice.ppnRate}%`,
      });
    }

    const journal = new JournalEntry({
      date: invoice.sentAt || new Date(),
      description: `Invoice ${invoice.invoiceNumber}`,
      source: JOURNAL_SOURCE.INVOICE,
      sourceId: invoice._id,
      sourceNumber: invoice.invoiceNumber,
      entries,
      createdBy: invoice.updatedBy,
    });

    await journal.save();

    // Update COA balances
    for (const entry of entries) {
      await ChartOfAccount.findByIdAndUpdate(entry.accountId, {
        $inc: { balance: (entry.debit || 0) - (entry.credit || 0) },
      });
    }

    console.log(`Created journal for ${invoice.invoiceNumber} (total: ${invoice.totalAmount})`);
  }

  // Show final COA balances
  const coas = await ChartOfAccount.find(
    { code: { $in: ['1200', '1300', '2100', '2110', '4100', '5100'] } },
    { code: 1, name: 1, balance: 1 },
  ).sort('code').lean();
  console.log('\nCOA Balances:');
  coas.forEach((c) => console.log(`  ${c.code} ${c.name}: ${c.balance}`));

  // Test finance report
  const reportService = require('../src/services/report.service');
  const report = await reportService.getFinanceReport({ period: 'monthly' });
  console.log('\nFinance Report (monthly):');
  console.log(JSON.stringify(report.profitLoss, null, 2));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
