# API Contract - Modul Sales Order (Surat Jalan / Penjualan)

**Modul:** Sales Order Management
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/sales-orders`

> Sales Order mengelola alur penjualan dari pembuatan order (surat jalan) hingga pengiriman, pembuatan invoice, dan penyelesaian. Terintegrasi dengan modul inventory (mutasi stok) dan finance (invoice & jurnal HPP).
>
> **Catatan:** Nomor surat jalan menggunakan format `NNNN/F/SJ/ROMAN_MONTH/IMP/YEAR` (obat) atau `NNNN/A/SJ/ROMAN_MONTH/IMP/YEAR` (alkes). Jika SO memiliki item campuran obat & alkes, otomatis **dipisah menjadi 2 SO**. Satu invoice dapat mencakup **beberapa surat jalan** sekaligus melalui endpoint `generate-invoice`.

---

## Daftar Isi

- [Data Model](#data-model)
- [Enum & Konstanta](#enum--konstanta)
- [Endpoints](#endpoints)
- [Status Flow](#status-flow)
- [Integrasi](#integrasi)
- [Validasi & Business Rules](#validasi--business-rules)

---

## Data Model

### Sales Order Schema

```javascript
{
  _id: ObjectId,

  // ── Identitas ──
  suratJalanNumber: String,    // Auto-generated (NNNN/F|A/SJ/ROMAN/IMP/YEAR). Unique. Max 100
  fakturNumber: String,        // Opsional. Nomor faktur pajak
  soCategory: String,          // 'obat' atau 'alkes'. Auto-set berdasarkan golongan produk
  status: String,              // Enum SO_STATUS

  // ── Pelanggan ──
  customerId: ObjectId,        // Ref → Customer

  // ── Tanggal ──
  orderDate: Date,             // Wajib
  deliveryDate: Date,          // Opsional (estimasi pengiriman)
  shippedAt: Date,             // Diisi otomatis saat status → shipped
  invoicedAt: Date,            // Diisi otomatis saat status → invoiced
  completedAt: Date,           // Diisi otomatis saat status → completed
  returnedAt: Date,            // Diisi otomatis saat status → returned

  // ── Pengiriman & Pembayaran ──
  shippingAddress: String,     // Max 500. Auto-fill dari alamat customer
  paymentTermDays: Number,     // 0-365 hari, default 30

  // ── Items ──
  items: [{
    productId: ObjectId,       // Ref → Product
    satuan: String,            // Enum SATUAN
    quantity: Number,          // 1-999999
    unitPrice: Number,         // 0-999999999
    discount: Number,          // 0-100 (persen)
    subtotal: Number,          // Kalkulasi otomatis
    batchNumber: String,       // Opsional (max 50)
    expiryDate: Date,          // Opsional
    notes: String,             // Max 500
  }],

  // ── Kalkulasi ──
  subtotal: Number,            // Sum of item subtotals
  ppnRate: Number,             // PPN rate (%)
  ppnAmount: Number,           // Berdasarkan PPN rate di settings
  totalAmount: Number,         // subtotal + ppnAmount
  paidAmount: Number,          // Jumlah yang sudah dibayar
  remainingAmount: Number,     // Sisa tagihan

  notes: String,               // Max 1000

  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

### Invoice Schema (terkait SO)

```javascript
{
  _id: ObjectId,
  invoiceNumber: String,       // Auto-generated (INV-YYYYMMDD-NNNN)
  invoiceType: 'sales',
  salesOrderIds: [ObjectId],   // Array Ref → SalesOrder (1 invoice bisa multi surat jalan)
  customerId: ObjectId,
  status: String,              // INVOICE_STATUS
  items: [...],                // Gabungan items dari semua SO terkait
  subtotal, ppnRate, ppnAmount, totalAmount, paidAmount, remainingAmount,
  paymentTermDays: Number,
  // ...timestamps
}
```

Catatan:
- PPN dihitung dari App Setting: `company.tax.isPkp` dan `company.tax.defaultPpnRate`.
- Sales Order berperan sebagai surat jalan (delivery note). Invoice dibuat terpisah via endpoint `generate-invoice`.
- Satu invoice dapat mencakup beberapa surat jalan dari customer yang sama.

---

## Enum & Konstanta

### Status SO (`SO_STATUS`)

| Value | Keterangan |
|-------|------------|
| `draft` | Status awal setelah SO dibuat |
| `shipped` | Barang dikirim, mutasi stok OUT dibuat |
| `awaiting_payment` | Invoice telah di-generate, menunggu pembayaran |
| `completed` | Selesai |
| `returned` | Order diretur, stok direvert |

### Legacy Status Mapping

Status lama otomatis dinormalisasi ke status baru:

| Legacy | Normalized |
|--------|------------|
| `confirmed` | `shipped` |
| `processing` | `shipped` |
| `ready_to_ship` | `shipped` |
| `packed` | `shipped` |
| `partial_shipped` | `shipped` |
| `shipped` | `shipped` |
| `delivered` | `awaiting_payment` |
| `partial_delivered` | `awaiting_payment` |
| `invoiced` | `awaiting_payment` |
| `awaiting_payment` | `awaiting_payment` |
| `completed` | `completed` |
| `cancelled` / `canceled` | `returned` |
| `returned` | `returned` |

---

## Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/sales-orders` | All 6 roles | Daftar SO (paginated) |
| GET | `/sales-orders/stats` | All 6 roles | Statistik SO |
| POST | `/sales-orders` | SA, Admin, Sales | Buat SO baru |
| POST | `/sales-orders/generate-invoice` | SA, Admin, Keuangan, Sales | Generate invoice dari beberapa surat jalan (status → awaiting_payment) |
| GET | `/sales-orders/:id` | All 6 roles | Detail SO |
| PUT | `/sales-orders/:id` | SA, Admin, Sales | Update SO (draft only) |
| DELETE | `/sales-orders/:id` | SA, Admin | Hapus SO (draft only) |
| PATCH | `/sales-orders/:id/status` | SA, Admin, Sales | Ubah status SO |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 11.1 Get All Sales Orders

```
GET /sales-orders
```

**Query Parameters:**

| Param | Type | Default | Keterangan |
|-------|------|---------|------------|
| `page` | `integer` | `1` | Halaman (min 1) |
| `limit` | `integer` | `10` | Max 100 |
| `search` | `string` | | Cari di `suratJalanNumber` dan `fakturNumber` (max 200) |
| `status` | `string` | | Filter status (comma-separated) |
| `customerId` | `string` | | Filter customer (MongoDB ID) |
| `dateFrom` | `date` | | Filter tanggal mulai (ISO-8601) |
| `dateTo` | `date` | | Filter tanggal akhir (ISO-8601) |
| `sort` | `string` | `-createdAt` | Sorting (max 50) |

---

### 11.2 Get SO Stats

```
GET /sales-orders/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "total": 120,
    "shipped": 25,
    "awaitingPayment": 60,
    "returned": 5,
    "completed": 30,
    "totalValue": 950000000,
    "totalValueThisMonth": 210000000,
    "averageOrderValue": 12179487,
    "topCustomers": []
  }
}
```

---

### 11.3 Get SO by ID

```
GET /sales-orders/:id
```

---

### 11.4 Create Sales Order

```
POST /sales-orders
```

**Request Body:**

| Field | Type | Required | Validasi |
|-------|------|----------|----------|
| `suratJalanNumber` | `string` | ❌ | Max 100. Unique. Auto-generated `NNNN/F\|A/SJ/ROMAN/IMP/YEAR` |
| `fakturNumber` | `string` | ❌ | Max 100. Nomor faktur pajak |
| `customerId` | `string` | ✅ | Valid MongoDB ID. Customer harus aktif |
| `orderDate` | `date` | ✅ | ISO-8601 |
| `deliveryDate` | `date` | ❌ | ISO-8601 (estimasi pengiriman) |
| `paymentTermDays` | `number` | ❌ | 0-365. Default dari settings |
| `shippingAddress` | `string` | ❌ | Max 500. Auto-fill dari alamat customer |
| `notes` | `string` | ❌ | Max 1000 |
| `items` | `array` | ✅ | Min 1 item |
| `items[].productId` | `string` | ✅ | Produk valid dan aktif |
| `items[].satuan` | `string` | ✅ | Harus enum SATUAN |
| `items[].quantity` | `number` | ✅ | Integer, 1-999999 |
| `items[].unitPrice` | `number` | ✅ | 0-999999999 |
| `items[].discount` | `number` | ❌ | 0-100 |
| `items[].batchNumber` | `string` | ❌ | Max 50 |
| `items[].expiryDate` | `date` | ❌ | ISO-8601 |
| `items[].notes` | `string` | ❌ | Max 500 |

> Kompatibilitas: Field `noFaktur` diterima sebagai alias untuk `fakturNumber`.

**Efek saat create:**

- Status awal otomatis `draft`.
- Items otomatis diklasifikasi berdasarkan `golongan` produk:
  - **Obat** (semua golongan selain alkes) → `soCategory: 'obat'`, nomor `NNNN/F/SJ/ROMAN/IMP/YEAR`
  - **Alkes** (golongan alkes) → `soCategory: 'alkes'`, nomor `NNNN/A/SJ/ROMAN/IMP/YEAR`
- Jika items campuran obat & alkes, **otomatis dipisah menjadi 2 SO terpisah** (response berupa array).
- `suratJalanNumber` auto-generated. Penomoran sequential per kategori per bulan.
- `subtotal`, `ppnAmount`, `totalAmount` dihitung otomatis berdasarkan items dan PPN rate dari settings.
- `shippingAddress` auto-fill dari alamat customer jika tidak diisi.
- `paymentTermDays` auto-fill dari `settings.invoice.defaultPaymentTermDays` jika tidak diisi (default: 30).

**Response `201 Created`:**

```json
{
  "success": true,
  "message": "2 Sales orders created successfully (obat & alkes dipisah)",
  "data": [
    {
      "_id": "...",
      "suratJalanNumber": "0001/F/SJ/IV/IMP/2026",
      "soCategory": "obat",
      "items": [...]
    },
    {
      "_id": "...",
      "suratJalanNumber": "0001/A/SJ/IV/IMP/2026",
      "soCategory": "alkes",
      "items": [...]
    }
  ]
}
```

> Jika semua items satu kategori, response tetap berupa array dengan 1 elemen.

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Customer tidak aktif / SIA expired |
| `400` | Produk tidak ditemukan atau tidak aktif |
| `409` | Nomor surat jalan sudah digunakan |
| `422` | Validasi gagal |

---

### 11.5 Update Sales Order

```
PUT /sales-orders/:id
```

**Aturan:**
- Hanya boleh saat status `draft`.
- Semua field dari create bisa diupdate (semua opsional).
- Validasi ulang customer dan produk jika diubah.
- Cek duplikasi `suratJalanNumber` terhadap SO lain.
- Kalkulasi total dihitung ulang dengan PPN rate terkini.

---

### 11.6 Delete Sales Order

```
DELETE /sales-orders/:id
```

**Aturan:**
- Hanya boleh saat status `draft`.

---

### 11.7 Change SO Status

```
PATCH /sales-orders/:id/status
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `status` | `string` | ✅ |
| `notes` | `string` | ❌ |

**Side Effects per transisi:**

| Transisi | Efek |
|----------|------|
| → `shipped` | Mutasi stok OUT dibuat via inventory service. `shippedAt` diisi |
| → `awaiting_payment` | (status tracking saja — biasanya via `generate-invoice`) |
| → `completed` | `completedAt` diisi |
| → `returned` | Mutasi stok direvert. `returnedAt` diisi |

---

### 11.8 Generate Invoice (Multi Surat Jalan)

```
POST /sales-orders/generate-invoice
```

**Request Body:**

| Field | Type | Required | Validasi |
|-------|------|----------|----------|
| `salesOrderIds` | `array` | ✅ | Min 1. Array of valid MongoDB IDs |

**Aturan:**
- Semua SO yang dipilih harus berstatus `shipped`.
- Semua SO harus milik **customer yang sama**.
- Items dari semua SO digabungkan menjadi satu invoice.
- Payment term diambil dari nilai tertinggi di antara SO yang dipilih.

**Efek:**
- 1 invoice penjualan dibuat dengan `salesOrderIds` berisi semua SO yang dipilih.
- Invoice number auto-generated (`INV-YYYYMMDD-NNNN`), status `sent`.
- Semua SO terpilih diubah ke status `awaiting_payment`.
- Jurnal HPP (COGS) dibuat untuk setiap SO (non-blocking).

**Response `201 Created`:**

```json
{
  "success": true,
  "message": "Invoice berhasil dibuat dari surat jalan",
  "data": {
    "_id": "...",
    "invoiceNumber": "INV-20260412-0001",
    "salesOrderIds": ["id1", "id2"],
    "customerId": "...",
    "items": [...],
    "totalAmount": 5000000
  }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Salah satu SO belum berstatus `shipped` |
| `400` | SO milik customer yang berbeda |
| `400` | SO tidak ditemukan |
| `422` | Validasi gagal |

---

## Status Flow

```text
draft → shipped → awaiting_payment → completed
                    |                   |
                    → returned          → returned
```

> **Generate Invoice:** Saat `POST /generate-invoice` dipanggil, SO yang berstatus `shipped` langsung berubah ke `awaiting_payment` bersamaan dengan pembuatan invoice.

**Transisi yang diizinkan:**

| Dari | Ke |
|------|----|
| `draft` | `shipped` |
| `shipped` | `awaiting_payment`, `returned` |
| `awaiting_payment` | `completed`, `returned` |

**Timestamp per status:**

| Status | Timestamp |
|--------|-----------|
| `shipped` | `shippedAt` |
| `completed` | `completedAt` |
| `returned` | `returnedAt` |

---

## Integrasi

| Modul | Arah | Aksi |
|-------|------|------|
| Inventory | SO → Stock | Transisi ke `shipped` membuat mutasi stok OUT |
| Inventory | SO → Stock | Transisi ke `returned` merevert mutasi stok |
| Finance | SO → Invoice | `POST /generate-invoice` membuat 1 invoice dari 1+ surat jalan, status → `awaiting_payment` |
| Finance | SO → GL | `POST /generate-invoice` auto-create jurnal HPP per SO |

---

## Validasi & Business Rules

1. **Customer harus aktif** — jika setting `requireSIA` aktif, SIA customer tidak boleh expired.
2. **Produk harus valid dan aktif** — semua item harus merujuk produk yang ada dan aktif.
3. **`shippingAddress` auto-fill** — dari alamat customer (`street, city, province`) jika tidak diisi.
4. **`paymentTermDays` auto-fill** — dari `settings.invoice.defaultPaymentTermDays` jika tidak diisi.
5. **Update hanya saat `draft`** — SO yang sudah shipped tidak bisa diedit.
6. **Delete hanya saat `draft`** — SO aktif tidak bisa dihapus.
7. **Generate invoice dari shipped** — hanya SO berstatus `shipped` yang bisa di-generate invoice.
8. **Multi surat jalan per invoice** — 1 invoice bisa mencakup beberapa surat jalan, asalkan customer sama.
9. **Jurnal HPP saat generate invoice** — jurnal COGS dibuat per SO (non-blocking).
10. **Revert stok saat `returned`** — mutasi stok OUT dikembalikan.
11. **`suratJalanNumber` harus unik** — validasi duplikasi saat create dan update.
12. **Auto-number format** — `NNNN/F/SJ/ROMAN/IMP/YEAR` (obat) atau `NNNN/A/SJ/ROMAN/IMP/YEAR` (alkes). Sequential per kategori per bulan.
13. **Auto-split obat/alkes** — jika items campuran, otomatis dipisah menjadi 2 SO berdasarkan golongan produk.

---

## Dual-Provider (MySQL / MongoDB)

Service layer mendukung dua database provider melalui `config.dbProvider`:

| Provider | Konfigurasi |
|----------|-------------|
| `mongo` (default) | Menggunakan Mongoose models |
| `mysql` | Menggunakan `mysql2/promise` connection pool |

### MySQL Table Structure

**`sales_orders`:**
- `surat_jalan_number` VARCHAR(100) — nomor surat jalan (`NNNN/F|A/SJ/ROMAN/IMP/YEAR`)
- `faktur_number` VARCHAR(100) — nomor faktur pajak
- `so_category` VARCHAR(10) — kategori SO (`obat` / `alkes`)
- `status`, `customer_id`, `order_date`, `delivery_date`, `payment_term_days`
- `subtotal`, `ppn_rate`, `ppn_amount`, `total_amount`, `paid_amount`, `remaining_amount`
- `shipped_at`, `completed_at`, `returned_at`

**`invoices` (terkait SO):**
- `sales_order_id` TEXT — JSON array of SO IDs (e.g. `["id1","id2"]`)
- `invoice_type` = `'sales'`

- Setiap fungsi service memiliki varian `mongo*` dan `mysql*`.
- Fungsi ekspor (e.g. `getSalesOrders`, `changeStatus`, `generateInvoice`) secara otomatis memilih implementasi berdasarkan `config.dbProvider`.
- Side effects (mutasi stok, invoice, jurnal HPP) berlaku di kedua provider.
- Legacy status normalisasi berlaku di kedua provider.