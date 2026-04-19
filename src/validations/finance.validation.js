const { body, param, query } = require('express-validator');
const {
  PAYMENT_METHOD,
  ACCOUNT_CATEGORY,
  JOURNAL_STATUS,
  MATCH_STATUS,
} = require('../constants');

const paymentMethods = Object.values(PAYMENT_METHOD);
const accountCategories = Object.values(ACCOUNT_CATEGORY);
const journalStatuses = Object.values(JOURNAL_STATUS);
const matchStatuses = Object.values(MATCH_STATUS);
const reportPeriods = ['current_month', 'last_month', 'current_year', 'custom'];

// ─── Common Param Validators ───

const idParam = [
  param('id').isUUID().withMessage('Invalid ID'),
];

// ─── Receivable / Payable Validators ───

const getReceivables = [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  query('status').optional({ values: 'falsy' }).isIn(['all', 'unpaid', 'paid']),
  query('aging').optional({ values: 'falsy' }).isIn(['current', '31-60', '61-90', '90+']),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601(),
  query('dateTo').optional({ values: 'falsy' }).isISO8601(),
  query('sort').optional({ values: 'falsy' }).trim(),
];

const getPayables = [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  query('status').optional({ values: 'falsy' }).isIn(['all', 'unpaid', 'paid']),
  query('aging').optional({ values: 'falsy' }).isIn(['current', '31-60', '61-90', '90+']),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601(),
  query('dateTo').optional({ values: 'falsy' }).isISO8601(),
  query('sort').optional({ values: 'falsy' }).trim(),
];

const receivableOrPayablePaymentBody = [
  body('amount')
    .notEmpty().withMessage('Jumlah pembayaran wajib diisi')
    .isFloat({ min: 1 }).withMessage('Jumlah pembayaran harus lebih dari 0'),
  body('paymentDate')
    .notEmpty().withMessage('Tanggal pembayaran wajib diisi')
    .isISO8601().withMessage('Format tanggal tidak valid'),
  body('paymentMethod')
    .notEmpty().withMessage('Metode pembayaran wajib dipilih')
    .isIn(paymentMethods).withMessage(`Metode harus salah satu dari: ${paymentMethods.join(', ')}`),
  body('referenceNumber')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('Nomor referensi maksimal 100 karakter'),
  body('bankAccount')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('Bank account maksimal 100 karakter'),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 1000 }).withMessage('Catatan maksimal 1000 karakter'),
  body('verificationNotes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Catatan verifikasi maksimal 500 karakter'),
];

const createReceivablePayment = [
  body('invoiceId')
    .notEmpty().withMessage('invoiceId wajib diisi')
    .isUUID().withMessage('Invalid invoice ID'),
  ...receivableOrPayablePaymentBody,
];

const payReceivable = [
  param('id').isUUID().withMessage('Invalid receivable invoice ID'),
  ...receivableOrPayablePaymentBody,
];

const createPayablePayment = [
  body('invoiceId')
    .notEmpty().withMessage('invoiceId wajib diisi')
    .isUUID().withMessage('Invalid payable invoice ID'),
  ...receivableOrPayablePaymentBody,
];

const payPayable = [
  param('id').isUUID().withMessage('Invalid payable invoice ID'),
  ...receivableOrPayablePaymentBody,
];

// ─── GL Validators ───

const getAccounts = [
  query('category').optional({ values: 'falsy' }).isIn(accountCategories),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  query('includeInactive').optional({ values: 'falsy' }).isBoolean(),
];

const createAccount = [
  body('code')
    .notEmpty().withMessage('Kode akun wajib diisi')
    .trim()
    .isLength({ min: 1, max: 20 }).withMessage('Kode akun harus 1-20 karakter'),
  body('name')
    .notEmpty().withMessage('Nama akun wajib diisi')
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Nama akun harus 1-200 karakter'),
  body('category')
    .notEmpty().withMessage('Kategori akun wajib diisi')
    .isIn(accountCategories).withMessage(`Kategori harus salah satu dari: ${accountCategories.join(', ')}`),
  body('parentId')
    .optional({ values: 'falsy' })
    .isUUID().withMessage('Invalid parent account ID'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Deskripsi maksimal 500 karakter'),
  body('isActive')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('isActive harus boolean'),
];

const updateAccount = [
  param('id').isUUID().withMessage('Invalid account ID'),
  body('code')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 1, max: 20 }).withMessage('Kode akun harus 1-20 karakter'),
  body('name')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('Nama akun harus 1-200 karakter'),
  body('category')
    .optional({ values: 'falsy' })
    .isIn(accountCategories).withMessage(`Kategori harus salah satu dari: ${accountCategories.join(', ')}`),
  body('parentId')
    .optional({ values: 'falsy' })
    .isUUID().withMessage('Invalid parent account ID'),
  body('description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Deskripsi maksimal 500 karakter'),
  body('isActive')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('isActive harus boolean'),
];

const getJournals = [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  query('accountCategory').optional({ values: 'falsy' }).isIn(accountCategories),
  query('status').optional({ values: 'falsy' }).isIn(journalStatuses),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601(),
  query('dateTo').optional({ values: 'falsy' }).isISO8601(),
  query('sort').optional({ values: 'falsy' }).trim(),
];

const createManualJournal = [
  body('date')
    .notEmpty().withMessage('Tanggal jurnal wajib diisi')
    .isISO8601().withMessage('Format tanggal tidak valid'),
  body('description')
    .notEmpty().withMessage('Deskripsi jurnal wajib diisi')
    .trim()
    .isLength({ min: 3, max: 500 }).withMessage('Deskripsi jurnal harus 3-500 karakter'),
  body('reference')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('Reference maksimal 100 karakter'),
  body('entries')
    .isArray({ min: 2 }).withMessage('Minimal 2 baris jurnal wajib diisi'),
  body('entries.*.accountId')
    .notEmpty().withMessage('Account ID wajib diisi')
    .isUUID().withMessage('Account ID tidak valid'),
  body('entries.*.debit')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('Nilai debit tidak valid'),
  body('entries.*.credit')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 }).withMessage('Nilai credit tidak valid'),
  body('entries.*.description')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Deskripsi baris jurnal maksimal 500 karakter'),
  body().custom((payload) => {
    const entries = payload.entries || [];
    const totals = entries.reduce((acc, entry) => {
      const debit = Number(entry.debit || 0);
      const credit = Number(entry.credit || 0);

      if (debit > 0 && credit > 0) {
        throw new Error('Setiap baris jurnal hanya boleh berisi debit atau credit');
      }

      if (debit <= 0 && credit <= 0) {
        throw new Error('Setiap baris jurnal wajib memiliki nilai debit atau credit');
      }

      acc.debit += debit;
      acc.credit += credit;
      return acc;
    }, { debit: 0, credit: 0 });

    if (totals.debit <= 0 || totals.credit <= 0) {
      throw new Error('Total debit dan credit wajib lebih dari 0');
    }

    if (Math.abs(totals.debit - totals.credit) > 0.0001) {
      throw new Error('Total debit dan credit harus seimbang');
    }

    return true;
  }),
];

const approveManualJournal = [
  param('id').isUUID().withMessage('Invalid journal ID'),
  body('notes')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Catatan approval maksimal 500 karakter'),
];

const getLedger = [
  query('accountId')
    .notEmpty().withMessage('accountId wajib diisi')
    .isUUID().withMessage('Invalid account ID'),
  query('period').optional({ values: 'falsy' }).isIn(reportPeriods),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601(),
  query('dateTo').optional({ values: 'falsy' }).isISO8601(),
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 200 }),
  query('sort').optional({ values: 'falsy' }).trim(),
  query().custom((q) => {
    if (q.period === 'custom' && (!q.dateFrom || !q.dateTo)) {
      throw new Error('dateFrom dan dateTo wajib diisi saat period=custom');
    }
    return true;
  }),
];

const getFinanceReport = [
  query('period').optional({ values: 'falsy' }).isIn(reportPeriods),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601(),
  query('dateTo').optional({ values: 'falsy' }).isISO8601(),
  query().custom((q) => {
    if (q.period === 'custom' && (!q.dateFrom || !q.dateTo)) {
      throw new Error('dateFrom dan dateTo wajib diisi saat period=custom');
    }
    return true;
  }),
];

// ─── Bank Transaction Validators ───

const getBankTransactions = [
  query('page').optional({ values: 'falsy' }).isInt({ min: 1 }),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 100 }),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 100 }),
  query('matchStatus').optional({ values: 'falsy' }).isIn(matchStatuses),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601(),
  query('dateTo').optional({ values: 'falsy' }).isISO8601(),
  query('sort').optional({ values: 'falsy' }).trim(),
];

const createBankTransaction = [
  body('date')
    .notEmpty().withMessage('Tanggal transaksi wajib diisi')
    .isISO8601().withMessage('Format tanggal tidak valid'),
  body('type')
    .notEmpty().withMessage('Tipe transaksi wajib dipilih')
    .isIn(['debit', 'credit']).withMessage('Tipe harus debit atau credit'),
  body('amount')
    .notEmpty().withMessage('Jumlah wajib diisi')
    .isFloat({ min: 1 }).withMessage('Jumlah harus lebih dari 0'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }),
  body('bankAccount')
    .optional()
    .trim()
    .isLength({ max: 100 }),
  body('reference')
    .optional()
    .trim()
    .isLength({ max: 100 }),
];

module.exports = {
  idParam,
  getReceivables,
  getPayables,
  createReceivablePayment,
  payReceivable,
  createPayablePayment,
  payPayable,
  getAccounts,
  createAccount,
  updateAccount,
  getJournals,
  createManualJournal,
  approveManualJournal,
  getLedger,
  getFinanceReport,
  getBankTransactions,
  createBankTransaction,
};

