const USER_ROLES = {
  ADMIN: 'admin',
  APOTEKER: 'apoteker',
  KEUANGAN: 'keuangan',
  GUDANG: 'gudang',
  SALES: 'sales',
};

const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
};

const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};

const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

const TOKEN_TYPES = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  RESET_PASSWORD: 'resetPassword',
  VERIFY_EMAIL: 'verifyEmail',
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER: 500,
};

const UPLOAD = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_DOC_TYPES: ['application/pdf'],
};

// ─── Product Constants ───

const PRODUCT_CATEGORY = {
  OBAT: 'obat',
  ALKES: 'alat_kesehatan',
};

const GOLONGAN_OBAT = {
  PREKURSOR: 'prekursor',
  OBAT_TERTENTU: 'obat_tertentu',
  OBAT_KERAS: 'obat_keras',
  OBAT_BEBAS_TERBATAS: 'obat_bebas_terbatas',
  OBAT_BEBAS: 'obat_bebas',
  SUPLEMEN: 'suplemen',
  OBAT_TRADISIONAL: 'obat_tradisional',
  LAINNYA: 'lainnya',
};

const GOLONGAN_ALKES = {
  ELEKTROMEDIK_NON_RADIASI: 'elektromedik_non_radiasi',
  NON_ELEKTROMEDIK_NON_STERIL: 'non_elektromedik_non_steril',
  NON_ELEKTROMEDIK_STERIL: 'non_elektromedik_steril',
  DIAGNOSTIK_INVITRO: 'diagnostik_invitro',
  BMHP: 'bmhp',
  PKRT: 'pkrt',
  LAINNYA: 'lainnya_alkes',
};

const ALL_GOLONGAN = {
  ...GOLONGAN_OBAT,
  ...GOLONGAN_ALKES,
};

const BENTUK_SEDIAAN = [
  'Tablet', 'Kaplet', 'Kapsul', 'Sirup', 'Suspensi', 'Emulsi', 'Drops',
  'Injeksi', 'Salep', 'Krim', 'Gel', 'Suppositoria', 'Ovula', 'Inhaler',
  'Patch', 'Infus', 'Serbuk', 'Granul', 'Larutan', 'Tetes Mata',
  'Tetes Telinga', 'Spray', 'Alat Kesehatan', 'Lainnya',
];

const SATUAN = [
  'Box', 'Botol', 'Tube', 'Strip', 'Blister', 'Ampul', 'Vial', 'Sachet',
  'Pcs', 'Pack', 'Rol', 'Lembar', 'Set', 'Kg', 'Gram', 'Liter', 'mL',
];



// ─── Supplier Constants ───

const SUPPLIER_TYPE = {
  PBF: 'pbf',
  DAK: 'dak',
  PBF_DAK: 'pbf_dak',
  INDUSTRI: 'industri',
  IMPORTIR: 'importir',
  DISTRIBUTOR_ALKES: 'distributor_alkes',
  LAINNYA: 'lainnya',
};

// ─── Purchase Order Constants ───

const PO_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  RECEIVED: 'received',
};

// ─── Goods Receiving Constants ───

const GR_STATUS = {
  DRAFT: 'draft',
  CHECKED: 'checked',
  VERIFIED: 'verified',
  COMPLETED: 'completed',
};

const GR_CONDITION_STATUS = {
  BAIK: 'baik',
  RUSAK: 'rusak',
  CACAT: 'cacat',
};

const GR_STORAGE_CONDITION = [
  'Suhu Kamar',
  'Sejuk',
  'Dingin',
  'Beku',
];

// ─── Inventory Constants ───

const BATCH_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  DEPLETED: 'depleted',
  DISPOSED: 'disposed',
};

const MUTATION_TYPE = {
  IN: 'in',
  OUT: 'out',
  ADJUSTMENT: 'adjustment',
  DISPOSAL: 'disposal',
  TRANSFER: 'transfer',
  RETURN: 'return',
};

const MUTATION_REFERENCE_TYPE = {
  GOODS_RECEIVING: 'goods_receiving',
  SALES_ORDER: 'sales_order',
  OPNAME: 'opname',
  MANUAL: 'manual',
  DISPOSAL: 'disposal',
  RETURN: 'return',
};

const OPNAME_STATUS = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const OPNAME_SCOPE = {
  ALL: 'all',
  CATEGORY: 'category',
};

const STOCK_STATUS = {
  NORMAL: 'normal',
  LOW: 'low',
  OUT_OF_STOCK: 'out_of_stock',
  OVERSTOCK: 'overstock',
};

const EXPIRY_STATUS = {
  EXPIRED: 'expired',
  CRITICAL: 'critical',
  WARNING: 'warning',
  CAUTION: 'caution',
  SAFE: 'safe',
};

// ─── Settings Constants ───

const SELF_INSPECTION_SCHEDULE = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  BIANNUALLY: 'biannually',
  ANNUALLY: 'annually',
};

// ─── Sales Order Constants ───

const SO_STATUS = {
  DRAFT: 'draft',
  SHIPPED: 'shipped',
  AWAITING_PAYMENT: 'awaiting_payment',
  COMPLETED: 'completed',
  RETURNED: 'returned',
};


const CUSTOMER_TYPE = {
  APOTEK: 'apotek',
  RUMAH_SAKIT: 'rumah_sakit',
  KLINIK: 'klinik',
  PUSKESMAS: 'puskesmas',
  TOKO_OBAT: 'toko_obat',
  PBF_LAIN: 'pbf_lain',
  PEMERINTAH: 'pemerintah',
};

// ─── Return Constants ───

const RETURN_STATUS = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  PICKING: 'picking',
  IN_TRANSIT: 'in_transit',
  RECEIVED: 'received',
  INSPECTED: 'inspected',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

const RETURN_TYPE = {
  CUSTOMER_RETURN: 'customer_return',
  SUPPLIER_RETURN: 'supplier_return',
};

const RETURN_REASONS = [
  'Produk rusak',
  'Produk kadaluarsa',
  'Salah kirim produk',
  'Salah kirim jumlah',
  'Produk tidak sesuai pesanan',
  'Kualitas tidak memenuhi standar',
  'Recall produk',
  'Lainnya',
];

const ITEM_CONDITION = {
  DAMAGED: 'damaged',
  EXPIRED: 'expired',
  WRONG_ITEM: 'wrong_item',
  WRONG_QTY: 'wrong_qty',
  QUALITY_ISSUE: 'quality_issue',
  GOOD: 'good',
};

const DISPOSITION = {
  RESTOCK: 'restock',
  DESTROY: 'destroy',
  RETURN_TO_SUPPLIER: 'return_to_supplier',
  QUARANTINE: 'quarantine',
};

// ─── Finance Constants ───

const INVOICE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
};

const FINANCE_PAYMENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  CANCELLED: 'cancelled',
};

const PAYMENT_TYPE = {
  INCOMING: 'incoming',
  OUTGOING: 'outgoing',
};

const PAYMENT_SOURCE_TYPE = {
  SALES_INVOICE: 'sales_invoice',
  PURCHASE_INVOICE: 'purchase_invoice',
  PURCHASE_ORDER: 'purchase_order',
  OPERATING_EXPENSE: 'operating_expense',
  OTHER_INCOMING: 'other_incoming',
  OTHER_OUTGOING: 'other_outgoing',
};

const PAYMENT_METHOD = {
  TRANSFER_BANK: 'transfer_bank',
  TUNAI: 'tunai',
  GIRO: 'giro',
  LAINNYA: 'lainnya',
};

const MEMO_TYPE = {
  CREDIT_MEMO: 'credit_memo',
  DEBIT_MEMO: 'debit_memo',
};

const MEMO_STATUS = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  POSTED: 'posted',
  CANCELLED: 'cancelled',
};

const ACCOUNT_CATEGORY = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  REVENUE: 'revenue',
  EXPENSE: 'expense',
};

const JOURNAL_SOURCE = {
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  MEMO: 'memo',
  GOODS_RECEIVING: 'goods_receiving',
  DELIVERY: 'delivery',
  RETURN: 'return',
  MANUAL: 'manual',
};

const JOURNAL_STATUS = {
  PENDING_APPROVAL: 'pending_approval',
  POSTED: 'posted',
};

const MATCH_STATUS = {
  UNMATCHED: 'unmatched',
  MATCHED: 'matched',
  RECONCILED: 'reconciled',
};

const CUSTOMER_TYPES = [
  'apotek',
  'rumah_sakit',
  'klinik',
  'puskesmas',
  'toko_obat',
  'pbf_lain',
  'pemerintah',
];

const TIMEZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
];

const DATE_FORMATS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
];

const LANGUAGES = ['id', 'en'];

const DOCUMENT_TYPES = ['invoice', 'purchaseOrder', 'deliveryOrder', 'returnOrder', 'salesOrder', 'return', 'payment', 'memo', 'journal'];

const VALID_SECTIONS = [
  'company', 'invoice', 'purchaseOrder', 'deliveryOrder', 'returnOrder',
  'salesOrder', 'return', 'payment', 'memo', 'gl',
  'inventory', 'cdob', 'medication', 'customer',
  'notification', 'reporting', 'general',
];

// ─── Regulation Constants ───

const SP_TYPE = {
  NARKOTIKA: 'narkotika',
  PSIKOTROPIKA: 'psikotropika',
  PREKURSOR: 'prekursor',
};

const SP_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

const SP_STATUS_TRANSITIONS = {
  [SP_STATUS.DRAFT]: [SP_STATUS.SUBMITTED],
  [SP_STATUS.SUBMITTED]: [SP_STATUS.APPROVED, SP_STATUS.REJECTED],
};

const EREPORT_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  RECEIVED: 'received',
  REJECTED: 'rejected',
};

const REG_DOC_CATEGORY = {
  COMPANY: 'company',
  SUPPLIER: 'supplier',
  CUSTOMER: 'customer',
};

const REG_DOC_TYPE = {
  PBF: 'PBF',
  SIUP: 'SIUP',
  CDOB: 'CDOB',
  TDP: 'TDP',
  NIB: 'NIB',
  SIPA: 'SIPA',
  STRA: 'STRA',
};

const REG_DOC_STATUS = {
  ACTIVE: 'active',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRED: 'expired',
};

module.exports = {
  USER_ROLES,
  PAGINATION,
  ORDER_STATUS,
  PAYMENT_STATUS,
  TOKEN_TYPES,
  HTTP_STATUS,
  UPLOAD,
  PRODUCT_CATEGORY,
  GOLONGAN_OBAT,
  GOLONGAN_ALKES,
  ALL_GOLONGAN,
  BENTUK_SEDIAAN,
  SATUAN,
  SUPPLIER_TYPE,
  PO_STATUS,
  GR_STATUS,
  GR_CONDITION_STATUS,
  GR_STORAGE_CONDITION,
  BATCH_STATUS,
  MUTATION_TYPE,
  MUTATION_REFERENCE_TYPE,
  OPNAME_STATUS,
  OPNAME_SCOPE,
  STOCK_STATUS,
  EXPIRY_STATUS,
  SELF_INSPECTION_SCHEDULE,
  SO_STATUS,
  CUSTOMER_TYPE,
  CUSTOMER_TYPES,
  RETURN_STATUS,
  RETURN_TYPE,
  RETURN_REASONS,
  ITEM_CONDITION,
  DISPOSITION,
  INVOICE_STATUS,
  FINANCE_PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_SOURCE_TYPE,
  PAYMENT_METHOD,
  MEMO_TYPE,
  MEMO_STATUS,
  ACCOUNT_CATEGORY,
  JOURNAL_SOURCE,
  JOURNAL_STATUS,
  MATCH_STATUS,
  TIMEZONES,
  DATE_FORMATS,
  LANGUAGES,
  DOCUMENT_TYPES,
  VALID_SECTIONS,
  SP_TYPE,
  SP_STATUS,
  SP_STATUS_TRANSITIONS,
  EREPORT_STATUS,
  REG_DOC_CATEGORY,
  REG_DOC_TYPE,
  REG_DOC_STATUS,
};
