const { randomUUID } = require('crypto');
const ApiError = require('../utils/ApiError');
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
  SO_STATUS,
} = require('../constants');
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
    const id = randomUUID();
    const journalNumber = journalData.number || await mysqlGenerateJournalNumber(conn);
    const status = journalData.status || JOURNAL_STATUS?.POSTED || 'posted';
    await conn.query('INSERT INTO journal_entries (id, journal_number, date, description, source, source_id, source_number, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())', [id, journalNumber, journalData.date || new Date(), journalData.description, journalData.source, journalData.sourceId || null, journalData.sourceNumber || '', status, journalData.createdBy || null]);
    for (let i = 0; i < (journalData.entries || []).length; i++) {
      const e = journalData.entries[i];
      const lineId = randomUUID();
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

const isAlkesGolongan = (golongan) => {
  const normalized = String(golongan || '').toLowerCase().trim();
  if (!normalized) return false;

  return Object.values(GOLONGAN_ALKES).includes(normalized)
    || normalized.includes('alkes')
    || normalized.includes('alat_kesehatan');
};

const parseSalesOrderIds = (rawSalesOrderId) => {
  if (!rawSalesOrderId) return [];
  try {
    const parsed = JSON.parse(rawSalesOrderId);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    return parsed ? [parsed] : [];
  } catch {
    const raw = String(rawSalesOrderId);
    const tokens = raw.match(/[0-9a-fA-F-]{8,36}/g) || [];
    if (tokens.length > 0) return tokens;
    return [raw];
  }
};

const mysqlGetSalesOrderReferences = async (pool, salesOrderIds = []) => {
  if (!Array.isArray(salesOrderIds) || salesOrderIds.length === 0) return [];
  const normalizedIds = salesOrderIds.map((id) => String(id || '').trim()).filter(Boolean);
  const fullIds = normalizedIds.filter((id) => id.length === 36);
  const partialIds = normalizedIds.filter((id) => id.length > 0 && id.length < 36);

  let exactRows = [];
  if (fullIds.length > 0) {
    const [rows] = await pool.query(
      `SELECT id, surat_jalan_number, faktur_number
       FROM sales_orders
       WHERE id IN (${fullIds.map(() => '?').join(',')})`,
      fullIds,
    );
    exactRows = rows;
  }

  const byId = new Map(exactRows.map((r) => [r.id, r]));
  const result = [];
  for (const id of normalizedIds) {
    if (byId.has(id)) {
      result.push(byId.get(id));
      continue;
    }
    if (id.length < 36) {
      // Backward-compat for truncated legacy values in invoices.sales_order_id.
      // eslint-disable-next-line no-await-in-loop
      const [[partialMatch]] = await pool.query(
        'SELECT id, surat_jalan_number, faktur_number FROM sales_orders WHERE id LIKE ? LIMIT 1',
        [`${id}%`],
      );
      if (partialMatch) result.push(partialMatch);
    }
  }
  return result;
};

// ─── MySQL Cross-Service Integration Functions ───

const mysqlCreateInvoiceFromDelivery = async (delivery, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[soRow]] = await pool.query('SELECT id, so_category, payment_term_days, ppn_rate FROM sales_orders WHERE id = ? LIMIT 1', [delivery.salesOrderId || delivery._id || delivery.id]);
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
  const id = randomUUID();
  const invoiceCategory = soRow.so_category || 'obat';
  const invoiceNumber = await mysqlGenerateSalesInvoiceNumber(pool, invoiceCategory);
  const paymentTermDays = soRow.payment_term_days || 30;
  await pool.query('INSERT INTO invoices (id, invoice_number, invoice_type, invoice_category, sales_order_id, customer_id, status, invoice_date, sent_at, due_date, subtotal, ppn_rate, ppn_amount, discount, total_amount, paid_amount, remaining_amount, payment_term_days, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW(),?,?,?,?,0,?,0,?,?,?,?,NOW(),NOW())', [id, invoiceNumber, 'sales', invoiceCategory, delivery.salesOrderId || delivery.id, delivery.customerId?._id || delivery.customerId, INVOICE_STATUS.SENT, new Date(Date.now() + paymentTermDays * 86400000), subtotal, isPkp ? ppnRate : 0, ppnAmount, totalAmount, totalAmount, paymentTermDays, userId, userId]);
  for (let i = 0; i < invoiceItems.length; i++) {
    const item = invoiceItems[i]; const itemId = randomUUID();
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
    const id = randomUUID();
    const invoiceNumber = await mysqlGenerateSalesInvoiceNumber(pool, category);

    await pool.query(
      'INSERT INTO invoices (id, invoice_number, invoice_type, invoice_category, sales_order_id, customer_id, status, invoice_date, sent_at, due_date, subtotal, ppn_rate, ppn_amount, discount, total_amount, paid_amount, remaining_amount, payment_term_days, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW(),?,?,?,?,0,?,0,?,?,?,?,NOW(),NOW())',
      [id, invoiceNumber, 'sales', category, salesOrderIdsJson, customerId, INVOICE_STATUS.SENT, new Date(Date.now() + maxPaymentTermDays * 86400000), subtotal, isPkp ? ppnRate : 0, ppnAmount, totalAmount, totalAmount, maxPaymentTermDays, userId, userId],
    );

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemId = randomUUID();
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
  const id = randomUUID();
  const supplierId = gr.supplierId?._id || gr.supplierId;
  await pool.query('INSERT INTO invoices (id, invoice_number, invoice_type, purchase_order_id, goods_receiving_id, supplier_id, status, invoice_date, sent_at, due_date, subtotal, ppn_rate, ppn_amount, discount, total_amount, paid_amount, remaining_amount, payment_term_days, notes, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,0,?,?,?,?,?,NOW(),NOW())', [id, manualInvoiceNumber, 'purchase', po?.id || po?._id || null, grId, supplierId, INVOICE_STATUS.SENT, invoiceDate, gr.verifiedAt || new Date(), new Date(invoiceDate.getTime() + paymentTermDays * 86400000), subtotal, isPkp ? ppnRate : 0, ppnAmount, totalAmount, totalAmount, paymentTermDays, `No. Faktur Supplier: ${manualInvoiceNumber}`, userId, userId]);
  for (let i = 0; i < invoiceItems.length; i++) {
    const item = invoiceItems[i]; const itemId = randomUUID();
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
  const { search, aging, status, page = 1, limit = 20 } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = ["inv.invoice_type = 'sales'"]; const params = [];
  if (status === 'paid') {
    whereClauses.push("inv.status = 'paid'");
  } else if (status === 'all') {
    // no status filter
  } else {
    whereClauses.push("inv.status IN ('sent','partially_paid','overdue')");
    whereClauses.push('inv.remaining_amount > 0');
  }
  if (search) { whereClauses.push('(c.name LIKE ? OR inv.invoice_number LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  const where = `WHERE ${whereClauses.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM invoices inv LEFT JOIN customers c ON inv.customer_id = c.id ${where}`, params);
  const [rows] = await pool.query(`SELECT inv.*, c.name as customer_name, c.code as customer_code, DATEDIFF(NOW(), inv.due_date) as days_overdue FROM invoices inv LEFT JOIN customers c ON inv.customer_id = c.id ${where} ORDER BY inv.due_date ASC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, invoiceNumber: r.invoice_number, status: r.status, customerId: { _id: r.customer_id, name: r.customer_name, code: r.customer_code }, invoiceDate: r.invoice_date, dueDate: r.due_date, totalAmount: Number(r.total_amount), paidAmount: Number(r.paid_amount), remainingAmount: Number(r.remaining_amount), daysOverdue: Math.max(0, r.days_overdue || 0) })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetPayables = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { search, status, page = 1, limit = 20 } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = ["inv.invoice_type = 'purchase'"]; const params = [];
  if (status === 'paid') {
    whereClauses.push("inv.status = 'paid'");
  } else if (status === 'all') {
    // no status filter
  } else {
    whereClauses.push("inv.status IN ('sent','partially_paid','overdue')");
    whereClauses.push('inv.remaining_amount > 0');
  }
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
  const payId = randomUUID();
  await pool.query('INSERT INTO payments (id, invoice_id, amount, payment_date, payment_method, reference_number, notes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())', [payId, invoiceId, payAmount, data.paymentDate || new Date(), data.paymentMethod || 'transfer', data.referenceNumber || null, data.notes || null, userId]);
  const newRemaining = Number(inv.remaining_amount) - payAmount;
  const newStatus = newRemaining <= 0 ? INVOICE_STATUS.PAID : INVOICE_STATUS.PARTIALLY_PAID;
  await pool.query('UPDATE invoices SET paid_amount = paid_amount + ?, remaining_amount = ?, status = ?, updated_at = NOW() WHERE id = ?', [payAmount, newRemaining, newStatus, invoiceId]);

  // Side effect: complete linked SOs when sales invoice is fully paid
  if (newRemaining <= 0 && inv.invoice_type === 'sales') {
    const [[invFull]] = await pool.query('SELECT sales_order_id FROM invoices WHERE id = ? LIMIT 1', [invoiceId]);
    if (invFull?.sales_order_id) {
      let soIds;
      try { soIds = JSON.parse(invFull.sales_order_id); } catch { soIds = [invFull.sales_order_id]; }
      if (Array.isArray(soIds) && soIds.length > 0) {
        await pool.query(`UPDATE sales_orders SET status = ?, completed_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id IN (${soIds.map(() => '?').join(',')}) AND status = ?`, [SO_STATUS.COMPLETED, userId, ...soIds, SO_STATUS.AWAITING_PAYMENT]);
      }
    }
  }

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
  const id = randomUUID();
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
  const id = randomUUID();
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
  const id = randomUUID();
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

const createInvoiceFromDelivery = (delivery, userId) => mysqlCreateInvoiceFromDelivery(delivery, userId);
const createInvoiceFromMultipleSOs = (orders, userId) => mysqlCreateInvoiceFromMultipleSOs(orders, userId);
const createPurchaseInvoiceFromGR = (gr, po, userId) => mysqlCreatePurchaseInvoiceFromGR(gr, po, userId);
const createJournalFromGR = (gr, po) => mysqlCreateJournalFromGR(gr, po);
const createCOGSJournal = (delivery) => mysqlCreateCOGSJournal(delivery);
const createSalesRevenueJournal = (invoice) => mysqlCreateSalesRevenueJournal(invoice);
const getReceivables = (q) => mysqlGetReceivables(q);
const createReceivablePayment = (data, userId) => mysqlCreateReceivablePayment(data, userId);
const payReceivable = (invoiceId, data, userId) => mysqlPayReceivable(invoiceId, data, userId);
const getPayables = (q) => mysqlGetPayables(q);
const createPayablePayment = (data, userId) => mysqlCreatePayablePayment(data, userId);
const payPayable = (invoiceId, data, userId) => mysqlPayPayable(invoiceId, data, userId);
const createMemo = (data, userId) => mysqlCreateMemo(data, userId);
const approveMemo = (id, notes, userId) => mysqlApproveMemo(id, notes, userId);
const getChartOfAccounts = (q) => mysqlGetChartOfAccounts(q);
const createChartOfAccount = (data, userId) => mysqlCreateChartOfAccount(data, userId);
const updateChartOfAccount = (id, data, userId) => mysqlUpdateChartOfAccount(id, data, userId);
const deleteChartOfAccount = (id) => mysqlDeleteChartOfAccount(id);
const getJournalEntries = (q) => mysqlGetJournalEntries(q);
const createManualJournal = (data, userId) => mysqlCreateManualJournal(data, userId);
const approveManualJournal = (id, notes, userId) => mysqlApproveManualJournal(id, notes, userId);
const getLedger = (q) => mysqlGetLedger(q);
const getBalanceSheetReport = (q) => mysqlGetBalanceSheetReport(q);
const getProfitLossReport = (q) => mysqlGetProfitLossReport(q);
const getCashFlowReport = (q) => mysqlGetCashFlowReport(q);
const getBankTransactions = (q) => mysqlGetBankTransactions(q);
const createBankTransaction = (data, userId) => mysqlCreateBankTransaction(data, userId);
const createReturnCOGSReversal = (ret) => mysqlCreateReturnCOGSReversal(ret);

const mysqlGetInvoiceById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[row]] = await pool.query(
    `SELECT inv.*, c.name as customer_name, c.code as customer_code, c.type as customer_type, c.phone as customer_phone, c.address_street as customer_address_street, c.address_city as customer_address_city, c.address_province as customer_address_province,
     s.name as supplier_name, s.code as supplier_code,
     u1.name as created_by_name, u2.name as updated_by_name
     FROM invoices inv
     LEFT JOIN customers c ON inv.customer_id = c.id
     LEFT JOIN suppliers s ON inv.supplier_id = s.id
     LEFT JOIN users u1 ON inv.created_by = u1.id
     LEFT JOIN users u2 ON inv.updated_by = u2.id
     WHERE inv.id = ? LIMIT 1`, [id],
  );
  if (!row) throw ApiError.notFound('Invoice tidak ditemukan');
  const [items] = await pool.query(
    `SELECT ii.*, p.name as product_name, p.sku as product_sku, p.golongan as product_golongan, p.satuan as product_satuan
     FROM invoice_items ii LEFT JOIN products p ON ii.product_id = p.id
     WHERE ii.invoice_id = ? ORDER BY ii.sort_order ASC`, [id],
  );
  const salesOrderIds = parseSalesOrderIds(row.sales_order_id);
  const salesOrderRefs = await mysqlGetSalesOrderReferences(pool, salesOrderIds);
  const salesOrders = salesOrderRefs.map((so) => ({
    id: so.id,
    _id: so.id,
    soNumber: so.surat_jalan_number || so.faktur_number || so.id,
    suratJalanNumber: so.surat_jalan_number,
    fakturNumber: so.faktur_number,
  }));
  const salesOrderNumbers = salesOrders.map((so) => so.soNumber).filter(Boolean);
  return {
    id: row.id, _id: row.id,
    invoiceNumber: row.invoice_number, invoiceType: row.invoice_type, invoiceCategory: row.invoice_category, status: row.status,
    salesOrderIds,
    salesOrders,
    salesOrder: salesOrders[0] || null,
    salesOrderNumbers,
    purchaseOrderId: row.purchase_order_id, goodsReceivingId: row.goods_receiving_id,
    customerId: row.customer_id ? { _id: row.customer_id, name: row.customer_name, code: row.customer_code, type: row.customer_type, phone: row.customer_phone, address: { street: row.customer_address_street, city: row.customer_address_city, province: row.customer_address_province } } : null,
    supplierId: row.supplier_id ? { _id: row.supplier_id, name: row.supplier_name, code: row.supplier_code } : null,
    invoiceDate: row.invoice_date, dueDate: row.due_date, sentAt: row.sent_at, paidAt: row.paid_at,
    items: items.map((i) => ({
      id: i.id, _id: i.id,
      productId: { _id: i.product_id, name: i.product_name, sku: i.product_sku, golongan: i.product_golongan, satuan: i.product_satuan },
      satuan: i.satuan, quantity: i.quantity, unitPrice: Number(i.unit_price), discount: Number(i.discount), subtotal: Number(i.subtotal),
      batchNumber: i.batch_number, expiryDate: i.expiry_date,
    })),
    subtotal: Number(row.subtotal), ppnRate: Number(row.ppn_rate), ppnAmount: Number(row.ppn_amount), discount: Number(row.discount || 0),
    totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount),
    paymentTermDays: row.payment_term_days, notes: row.notes,
    createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
    updatedBy: row.updated_by ? { _id: row.updated_by, name: row.updated_by_name } : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
};

const mysqlGetInvoiceByNumber = async (invoiceNumber) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const [[row]] = await pool.query(
    `SELECT inv.*, c.name as customer_name, c.code as customer_code, c.type as customer_type, c.phone as customer_phone, c.address_street as customer_address_street, c.address_city as customer_address_city, c.address_province as customer_address_province,
     s.name as supplier_name, s.code as supplier_code,
     u1.name as created_by_name, u2.name as updated_by_name
     FROM invoices inv
     LEFT JOIN customers c ON inv.customer_id = c.id
     LEFT JOIN suppliers s ON inv.supplier_id = s.id
     LEFT JOIN users u1 ON inv.created_by = u1.id
     LEFT JOIN users u2 ON inv.updated_by = u2.id
     WHERE inv.invoice_number = ? LIMIT 1`, [invoiceNumber],
  );

  if (!row) throw ApiError.notFound('Invoice tidak ditemukan');

  const [items] = await pool.query(
    `SELECT ii.*, p.name as product_name, p.sku as product_sku, p.golongan as product_golongan, p.satuan as product_satuan
     FROM invoice_items ii LEFT JOIN products p ON ii.product_id = p.id
     WHERE ii.invoice_id = ? ORDER BY ii.sort_order ASC`, [row.id],
  );

  const salesOrderIds = parseSalesOrderIds(row.sales_order_id);
  const salesOrderRefs = await mysqlGetSalesOrderReferences(pool, salesOrderIds);
  const salesOrders = salesOrderRefs.map((so) => ({
    id: so.id,
    _id: so.id,
    soNumber: so.surat_jalan_number || so.faktur_number || so.id,
    suratJalanNumber: so.surat_jalan_number,
    fakturNumber: so.faktur_number,
  }));
  const salesOrderNumbers = salesOrders.map((so) => so.soNumber).filter(Boolean);

  return {
    id: row.id, _id: row.id,
    invoiceNumber: row.invoice_number, invoiceType: row.invoice_type, invoiceCategory: row.invoice_category, status: row.status,
    salesOrderIds,
    salesOrders,
    salesOrder: salesOrders[0] || null,
    salesOrderNumbers,
    purchaseOrderId: row.purchase_order_id, goodsReceivingId: row.goods_receiving_id,
    customerId: row.customer_id ? { _id: row.customer_id, name: row.customer_name, code: row.customer_code, type: row.customer_type, phone: row.customer_phone, address: { street: row.customer_address_street, city: row.customer_address_city, province: row.customer_address_province } } : null,
    supplierId: row.supplier_id ? { _id: row.supplier_id, name: row.supplier_name, code: row.supplier_code } : null,
    invoiceDate: row.invoice_date, dueDate: row.due_date, sentAt: row.sent_at, paidAt: row.paid_at,
    items: items.map((i) => ({
      id: i.id, _id: i.id,
      productId: { _id: i.product_id, name: i.product_name, sku: i.product_sku, golongan: i.product_golongan, satuan: i.product_satuan },
      satuan: i.satuan, quantity: i.quantity, unitPrice: Number(i.unit_price), discount: Number(i.discount), subtotal: Number(i.subtotal),
      batchNumber: i.batch_number, expiryDate: i.expiry_date,
    })),
    subtotal: Number(row.subtotal), ppnRate: Number(row.ppn_rate), ppnAmount: Number(row.ppn_amount), discount: Number(row.discount || 0),
    totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount),
    paymentTermDays: row.payment_term_days, notes: row.notes,
    createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
    updatedBy: row.updated_by ? { _id: row.updated_by, name: row.updated_by_name } : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
};

const getInvoiceById = (id) => mysqlGetInvoiceById(id);
const getInvoiceByNumber = (invoiceNumber) => mysqlGetInvoiceByNumber(invoiceNumber);

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
  // Invoice
  getInvoiceById,
  getInvoiceByNumber,
};


