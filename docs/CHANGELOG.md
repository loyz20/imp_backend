# Changelog

Dokumentasi perubahan yang dilakukan pada backend PBF IKO Farma.

---

## [Unreleased] — 2026-04-04

### Ringkasan

Tiga sesi perbaikan besar dilakukan pada modul **Finance**, **Inventory**, dan **Transaction** (SO, Delivery, Return, GR, PO). Fokus utama: memperbaiki validasi bisnis, menambah otomasi jurnal keuangan, dan meningkatkan akurasi data stok.

---

### 🔧 Modul Finance

#### Cancel Invoice dari Status Overdue
- **File:** `src/services/finance.service.js` (L295-310)
- **Perubahan:** Invoice dengan status `overdue` sekarang bisa dibatalkan, selama `paidAmount = 0` (belum ada pembayaran).
- **Sebelumnya:** Hanya bisa cancel dari `draft` dan `sent`.
- **Status flow baru:** `draft` / `sent` / `overdue` → `cancelled`

#### Auto-Deteksi Invoice Overdue
- **File:** `src/services/finance.service.js` (L28-37)
- **Perubahan:** Fungsi `updateOverdueInvoices()` secara otomatis mengubah invoice berstatus `sent` atau `partially_paid` yang sudah melewati `dueDate` menjadi `overdue`.
- **Mekanisme:** Bulk update via `updateMany()` untuk efisiensi.

#### Validasi Amount Pembayaran terhadap PO
- **File:** `src/services/finance.service.js` (L687-779)
- **Perubahan:** `createPayment()` dan `updatePayment()` sekarang memvalidasi jumlah pembayaran terhadap `PO.remainingAmount` (atau `PO.totalAmount` jika belum ada pembayaran) untuk pembayaran outgoing.
- **Sebelumnya:** Hanya validasi terhadap invoice untuk incoming, tidak ada validasi amount terhadap PO.
- **Error message:** `"Jumlah pembayaran (Rp X) melebihi sisa hutang PO (Rp Y)"`

#### Trial Balance Menampilkan Semua COA Aktif
- **File:** `src/services/finance.service.js` (L1018-1094)
- **Perubahan:** `getTrialBalance()` sekarang menampilkan **semua akun COA aktif** termasuk yang belum memiliki transaksi (debit/credit = 0).
- **Sebelumnya:** Hanya menampilkan akun yang memiliki journal entry di periode tersebut.
- **Mekanisme:** Ambil semua COA aktif → ambil journal totals → merge (zero-fill akun tanpa transaksi).

#### Konsistensi Field Request Finance
- **File:** `src/controllers/finance.controller.js`
- **Perubahan:** Penyesuaian field request agar sinkron dengan validator:
  - `cancelInvoice`: pakai `reason` (fallback `cancelReason` untuk backward compatibility)
  - `verifyPayment`: pakai `notes` (fallback `verificationNotes`)
  - `approveMemo`: pakai `notes` (fallback `approvalNotes`)
- **Dampak:** catatan pembatalan/verifikasi/approval tidak lagi berisiko hilang karena mismatch nama field.

#### Filter Kategori Jurnal Sebelum Pagination
- **File:** `src/services/finance.service.js`
- **Perubahan:** `getJournalEntries()` kini menerapkan filter `accountCategory` di level query (`entries.accountId`) sebelum pagination.
- **Sebelumnya:** filtering dilakukan setelah paginate, sehingga metadata pagination dapat menyesatkan.
- **Dampak:** `totalDocs`, `totalPages`, dan data halaman konsisten dengan filter kategori akun.

#### Payment Source Type (Klasifikasi Sumber Pembayaran)
- **File:** `src/constants/index.js`, `src/models/Payment.js`, `src/validations/finance.validation.js`, `src/services/finance.service.js`
- **Perubahan:** ditambah enum `PAYMENT_SOURCE_TYPE`:
  - `sales_invoice`, `purchase_order`, `operating_expense`, `other_incoming`, `other_outgoing`
- **Model Payment:** field baru `sourceType` + auto-derive default saat create.
- **Validasi & Service:** enforce konsistensi `sourceType` dengan `type` dan referensi dokumen.
  - `sales_invoice` hanya untuk `incoming` dan wajib `invoiceId`
  - `purchase_order` hanya untuk `outgoing` dan wajib `purchaseOrderId`
- **Dampak:** modul payments lebih siap untuk skenario lintas arus kas, tidak terbatas invoice penjualan saja.

#### Filter Source Type pada List Payments
- **File:** `src/validations/finance.validation.js`, `src/services/finance.service.js`
- **Perubahan:** endpoint `GET /finance/payments` mendukung query `sourceType`.
- **Dampak:** laporan kas dapat dipilah per sumber pembayaran (AR/AP/other).

#### Manual Journal dengan Approval Guard
- **File:** `src/models/JournalEntry.js`, `src/validations/finance.validation.js`, `src/controllers/finance.controller.js`, `src/services/finance.service.js`, `src/routes/finance.routes.js`
- **Perubahan:** ditambahkan endpoint:
  - `POST /finance/gl/journals/manual` (create pending approval)
  - `PATCH /finance/gl/journals/:id/approve` (approve & posting)
- **Guard:** pembuat jurnal tidak boleh meng-approve jurnalnya sendiri.
- **Dampak:** manual posting lebih aman dengan separation of duties.

#### Ledger Detail per Akun
- **File:** `src/validations/finance.validation.js`, `src/controllers/finance.controller.js`, `src/services/finance.service.js`, `src/routes/finance.routes.js`
- **Perubahan:** endpoint baru `GET /finance/gl/ledger` dan mirror `GET /finance/reports/ledger`.
- **Fitur:** opening balance, mutasi debit/credit, closing balance, pagination transaksi per akun.

#### Financial Reports API
- **File:** `src/validations/finance.validation.js`, `src/controllers/finance.controller.js`, `src/services/finance.service.js`, `src/routes/finance.routes.js`
- **Perubahan:** endpoint baru:
  - `GET /finance/reports/balance-sheet`
  - `GET /finance/reports/profit-loss`
  - `GET /finance/reports/cash-flow`
- **Dampak:** backend sudah menyediakan API laporan utama untuk konsumsi frontend finance.

#### AP/AR Dedicated Create/Pay Endpoints
- **File:** `src/validations/finance.validation.js`, `src/controllers/finance.controller.js`, `src/services/finance.service.js`, `src/routes/finance.routes.js`
- **Perubahan:** endpoint baru:
  - `POST /finance/receivables` (create draft incoming payment dari invoice sales)
  - `POST /finance/receivables/:id/pay` (direct post incoming payment)
  - `POST /finance/payables` (create draft outgoing payment dari purchase order)
  - `POST /finance/payables/:id/pay` (direct post outgoing payment)
- **Guard bisnis:**
  - Receivable hanya untuk `invoiceType = sales` yang masih outstanding.
  - Payable hanya untuk PO status `partial_received/received` yang masih outstanding.

#### Jurnal Pembalikan HPP untuk Return (COGS Reversal)
- **File:** `src/services/finance.service.js` (L1373-1432)
- **Perubahan:** Fungsi baru `createReturnCOGSReversal()` membuat jurnal pembalikan HPP saat return completed dengan item yang di-restock.
- **Jurnal:** DR Persediaan (1300), CR HPP (5100)
- **Logika cost:** Prioritas dari batch `unitPrice`, fallback ke rata-rata harga batch aktif.
- **Filter:** Hanya item dengan `disposition = RESTOCK` yang diproses.

#### Journal Source RETURN
- **File:** `src/constants/index.js` (L428-436)
- **Perubahan:** Enum `JOURNAL_SOURCE` ditambah value `return` untuk tracking jurnal yang berasal dari return.

---

### 📦 Modul Inventory

#### Auto-Mark Expired Batches
- **File:** `src/services/inventory.service.js` (L10-18)
- **Perubahan:** Fungsi `updateExpiredBatches()` secara otomatis mengubah status batch aktif yang sudah melewati `expiryDate` menjadi `expired`.
- **Mekanisme:** Bulk update via `updateMany()`.

#### Stok Minimum Per-Produk
- **File:** `src/services/inventory.service.js` (L102-112, L211-216)
- **File model:** `src/models/Product.js` (L102-106)
- **Perubahan:** `getStockSummary()` dan `getStockStats()` sekarang menggunakan `Product.stokMinimum` per-produk sebagai threshold status stok.
- **Sebelumnya:** Menggunakan `AppSetting.inventory.lowStockThreshold` secara global untuk semua produk.
- **Fallback:** Jika `stokMinimum = 0` atau belum diset, gunakan global `lowStockThreshold` dari AppSetting.

#### Batch Deduplication pada Goods Receiving
- **File:** `src/services/inventory.service.js` (L408-445)
- **Perubahan:** `createGRMutations()` sekarang melakukan lookup `findOne({ productId, batchNumber })` sebelum membuat batch baru.
- **Sebelumnya:** Selalu membuat batch baru, menyebabkan duplikasi jika batch number sama sudah ada dari GR sebelumnya.
- **Jika batch sudah ada:** Tambah quantity + reactivate jika status `depleted`.

#### Stock Card Opening Balance dengan dateFrom
- **File:** `src/services/inventory.service.js` (L850-892)
- **Perubahan:** `getStockCard()` sekarang menghitung opening balance yang benar saat ada filter `dateFrom`.
- **Mekanisme:** Aggregate semua mutasi sebelum `dateFrom` untuk mendapatkan saldo awal.
- **Sebelumnya:** Opening balance selalu dihitung dari closing balance dikurangi mutasi, menghasilkan angka yang salah saat ada date filter.

---

### 🛒 Modul Purchase Order

#### PPN Rate dari AppSetting
- **File:** `src/models/PurchaseOrder.js`
- **Perubahan:** Method `calculateTotals(ppnRate)` sekarang menerima parameter `ppnRate` yang diambil dari `AppSetting.company.tax.defaultPpnRate`.
- **Sebelumnya:** PPN rate hardcoded 11%.
- **Fallback:** Jika `ppnRate` tidak disediakan, gunakan default 11%.

#### Field paidAmount & remainingAmount
- **File:** `src/models/PurchaseOrder.js` (L110-115)
- **Perubahan:** Skema PO ditambah field `paidAmount` (default 0) dan `remainingAmount` (default 0).
- **Kalkulasi:** `remainingAmount = totalAmount - paidAmount` (dihitung di `calculateTotals()`).
- **Digunakan oleh:** Finance service untuk validasi pembayaran outgoing dan tracking hutang (AP).

---

### 📥 Modul Goods Receiving

#### Pencegahan Over-Receiving
- **File:** `src/services/goodsReceiving.service.js` (L90-104)
- **Perubahan:** Validasi bahwa `receivedQty ≤ PO remaining quantity` per item saat membuat GR.
- **Sebelumnya:** Tidak ada validasi, memungkinkan penerimaan melebihi jumlah PO.
- **Error message:** `"Jumlah terima (X) melebihi sisa PO (Y) untuk produk Z"`

---

### 📋 Modul Sales Order

#### Ekspansi Status Transitions
- **File:** `src/services/salesOrder.service.js` (L8-17)
- **Perubahan:** STATUS_TRANSITIONS diperluas:
  - `PROCESSING` → `CANCELLED` (bisa cancel dari processing)
  - `READY_TO_SHIP` → `CANCELLED` (bisa cancel dari ready to ship)
  - `PARTIAL_SHIPPED` → `CANCELLED` (bisa cancel dari partial shipped)
  - `PARTIAL_SHIPPED` → `READY_TO_SHIP` (bisa rollback ke ready to ship)
- **Sebelumnya:** Cancel hanya bisa dari `DRAFT` dan `CONFIRMED`.

---


### 🔄 Modul Return

#### Validasi Disposisi sebelum Completion
- **File:** `src/services/return.service.js` (L635-642)
- **Perubahan:** Semua item return harus memiliki `disposition` sebelum status bisa diubah ke `completed`.
- **Error message:** `"Semua item harus memiliki disposisi sebelum retur diselesaikan. X item belum memiliki disposisi."`

#### Perhitungan Effective Unit Price pada Credit Memo
- **File:** `src/services/return.service.js` (L603-617)
- **Perubahan:** Credit memo sekarang menggunakan `effectiveUnitPrice = subtotal / quantity` dari item invoice, bukan `unitPrice - discount`.
- **Sebelumnya:** Menggunakan `unitPrice` langsung yang tidak memperhitungkan diskon dengan benar, karena discount adalah amount absolut.
- **Formula:** `effectiveUnitPrice = invItem.subtotal / invItem.quantity`

#### Auto COGS Reversal untuk Item Restock
- **File:** `src/services/return.service.js` (L644-651)
- **Perubahan:** Saat return customer completed, otomatis panggil `financeService.createReturnCOGSReversal()` untuk item yang di-restock.
- **Jurnal:** DR Persediaan (1300), CR HPP (5100)
- **Filter:** Hanya untuk `returnType = CUSTOMER_RETURN` dan item dengan `disposition = RESTOCK`.

---

### 📝 Dokumentasi

#### Update Seluruh API Contract
- **File:** `docs/*.md` (13 file)
- **Perubahan:** Seluruh dokumentasi API contract ditulis ulang agar sesuai dengan state kode terkini.
- **File yang diperbarui:**
  - `api-contract.md` — Ditambah tabel cross-reference modul, diperluas tipe nomor dokumen
  - `product-module.md` — Dokumentasi `stokMinimum` per-produk
  - `supplier-module.md` — Rewrite lengkap
  - `customer-module.md` — Rewrite dengan integrasi settings
  - `purchase-order-module.md` — Dokumentasi PPN dari AppSetting, paidAmount/remainingAmount
  - `goods-receiving-module.md` — Dokumentasi pencegahan over-receiving, batch deduplication
  - `inventory-module.md` — Dokumentasi 5 sub-modul, per-product stokMinimum, auto-mark expired
  - `sales-order-module.md` — Dokumentasi expanded status transitions
  - `delivery-module.md` — Dokumentasi PACKED→CANCELLED, auto-invoice, auto-COGS
  - `return-module.md` — Dokumentasi validasi disposisi, credit memo effective unit price, COGS reversal
  - `finance-module.md` — Dokumentasi 8 sub-modul, cancel dari overdue, payment PO validation, trial balance all COA
  - `report-module.md` — Dokumentasi 5 report types, ekspor Excel/PDF
  - `setting-module.md` — Dokumentasi 24 endpoints, semua section, document number generator

---

### Daftar File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `src/constants/index.js` | Tambah `JOURNAL_SOURCE.RETURN` |
| `src/models/Product.js` | Tambah field `stokMinimum` |
| `src/models/PurchaseOrder.js` | Tambah field `paidAmount`, `remainingAmount`; update `calculateTotals(ppnRate)` |
| `src/services/finance.service.js` | Cancel invoice overdue, auto-overdue, payment PO validation, trial balance all COA, COGS reversal |
| `src/services/inventory.service.js` | Auto-mark expired, per-product stokMinimum, batch dedup, stock card opening balance |
| `src/services/goodsReceiving.service.js` | Over-receiving prevention |
| `src/services/salesOrder.service.js` | Expanded STATUS_TRANSITIONS |
| `src/services/delivery.service.js` | PACKED→CANCELLED, auto-invoice, auto-COGS journal |
| `src/services/return.service.js` | Disposition validation, effective unit price, COGS reversal |
| `docs/*.md` | 13 file dokumentasi ditulis ulang |
