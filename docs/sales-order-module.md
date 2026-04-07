# API Contract - Modul Sales Order (Penjualan)

**Modul:** Sales Order Management
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/sales-orders`

> Sales Order mengelola alur penjualan dari pembuatan order hingga pengiriman dan penyelesaian. Terintegrasi dengan modul inventory (mutasi stok) dan finance (invoice & jurnal HPP).

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
  invoiceNumber: String,       // Wajib. Unique. Nomor SO/faktur (max 100)
  status: String,              // Enum SO_STATUS

  // ── Pelanggan ──
  customerId: ObjectId,        // Ref → Customer

  // ── Tanggal ──
  orderDate: Date,             // Wajib
  expectedDeliveryDate: Date,  // Opsional
  packedAt: Date,
  deliveredAt: Date,
  returnedAt: Date,
  completedAt: Date,

  // Legacy compatibility fields
  confirmedAt: Date,
  processedAt: Date,
  shippedAt: Date,

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
  ppnAmount: Number,           // Berdasarkan PPN rate di settings
  totalAmount: Number,         // subtotal + ppnAmount

  notes: String,               // Max 1000

  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

Catatan:
- PPN dihitung dari App Setting: `company.tax.isPkp` dan `company.tax.defaultPpnRate`.
- Sales Order berperan sebagai alur pengiriman utama (tanpa endpoint Delivery terpisah).

---

## Enum & Konstanta

### Status SO (`SO_STATUS`)

| Value | Keterangan |
|-------|------------|
| `draft` | Status awal setelah SO dibuat |
| `packed` | Barang sudah dipacking, mutasi stok OUT dibuat |
| `delivered` | Terkirim penuh, invoice & jurnal HPP otomatis dibuat |
| `partial_delivered` | Pengiriman sebagian |
| `returned` | Order diretur, stok direvert |
| `completed` | Selesai |
| `canceled` | Dibatalkan, stok direvert |

### Legacy Status Mapping

Status lama otomatis dinormalisasi ke status baru:

| Legacy | Normalized |
|--------|------------|
| `confirmed` | `packed` |
| `processing` | `packed` |
| `ready_to_ship` | `packed` |
| `partial_shipped` | `partial_delivered` |
| `shipped` | `delivered` |
| `completed` | `completed` |
| `cancelled` | `canceled` |

---

## Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/sales-orders` | All 6 roles | Daftar SO (paginated) |
| GET | `/sales-orders/stats` | All 6 roles | Statistik SO |
| GET | `/sales-orders/:id` | All 6 roles | Detail SO |
| POST | `/sales-orders` | SA, Admin, Sales | Buat SO baru |
| PUT | `/sales-orders/:id` | SA, Admin, Sales | Update SO (draft only) |
| DELETE | `/sales-orders/:id` | SA, Admin | Hapus SO (draft/canceled only) |
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
| `search` | `string` | | Cari di `invoiceNumber` (max 200) |
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
    "draft": 10,
    "packed": 20,
    "delivered": 60,
    "partialDelivered": 8,
    "returned": 5,
    "completed": 15,
    "canceled": 2,
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
| `invoiceNumber` | `string` | ✅ | Max 100. Unique |
| `customerId` | `string` | ✅ | Valid MongoDB ID. Customer harus aktif |
| `orderDate` | `date` | ✅ | ISO-8601 |
| `expectedDeliveryDate` | `date` | ❌ | ISO-8601 |
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

> Kompatibilitas: Field `noFaktur` diterima sebagai alias untuk `invoiceNumber`.

**Efek saat create:**

- Status awal otomatis `draft`.
- `subtotal`, `ppnAmount`, `totalAmount` dihitung otomatis berdasarkan items dan PPN rate dari settings.
- `shippingAddress` auto-fill dari alamat customer jika tidak diisi.
- `paymentTermDays` auto-fill dari `settings.invoice.defaultPaymentTermDays` jika tidak diisi (default: 30).

**Response `201 Created`**

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Customer tidak aktif / SIA expired |
| `400` | Produk tidak ditemukan atau tidak aktif |
| `409` | Invoice number sudah digunakan |
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
- Cek duplikasi `invoiceNumber` terhadap SO lain.
- Kalkulasi total dihitung ulang dengan PPN rate terkini.

---

### 11.6 Delete Sales Order

```
DELETE /sales-orders/:id
```

**Aturan:**
- Hanya boleh saat status `draft` atau `canceled`.

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
| → `packed` | Mutasi stok OUT dibuat via inventory service. `packedAt` diisi |
| → `partial_delivered` | `shippedAt` diisi (jika belum) |
| → `delivered` | `shippedAt` diisi (jika belum), `deliveredAt` diisi. Invoice penjualan otomatis dibuat (non-blocking). Jurnal HPP otomatis dibuat (non-blocking) |
| → `completed` | `completedAt` diisi |
| → `returned` | Mutasi stok direvert. `returnedAt` diisi |
| → `canceled` | Mutasi stok direvert |

> **Non-blocking:** Pembuatan invoice dan jurnal HPP saat transisi ke `delivered` bersifat non-blocking. Jika gagal, perubahan status tetap tersimpan.

---

## Status Flow

```text
draft → packed → delivered → completed
  |                |    \
  |                |     → partial_delivered → delivered
  |                |            |     \
  |                |            |      → returned
  |                |            |      → completed
  |                |            |
  |                → returned
  |
  → canceled
```

**Transisi yang diizinkan:**

| Dari | Ke |
|------|----|
| `draft` | `packed`, `canceled` |
| `packed` | `delivered` |
| `delivered` | `partial_delivered`, `returned`, `completed` |
| `partial_delivered` | `delivered`, `returned`, `completed` |

**Timestamp per status:**

| Status | Timestamp |
|--------|-----------|
| `packed` | `packedAt` |
| `partial_delivered` / `delivered` | `shippedAt` (jika belum terisi) |
| `delivered` | `deliveredAt` |
| `completed` | `completedAt` |
| `returned` | `returnedAt` |

---

## Integrasi

| Modul | Arah | Aksi |
|-------|------|------|
| Inventory | SO → Stock | Transisi ke `packed` membuat mutasi stok OUT |
| Inventory | SO → Stock | Transisi ke `returned`/`canceled` merevert mutasi stok |
| Finance | SO → Invoice | Transisi ke `delivered` auto-create invoice penjualan |
| Finance | SO → GL | Transisi ke `delivered` auto-create jurnal HPP |

---

## Validasi & Business Rules

1. **Customer harus aktif** — jika setting `requireSIA` aktif, SIA customer tidak boleh expired.
2. **Produk harus valid dan aktif** — semua item harus merujuk produk yang ada dan aktif.
3. **`shippingAddress` auto-fill** — dari alamat customer (`street, city, province`) jika tidak diisi.
4. **`paymentTermDays` auto-fill** — dari `settings.invoice.defaultPaymentTermDays` jika tidak diisi.
5. **Update hanya saat `draft`** — SO yang sudah di-pack tidak bisa diedit.
6. **Delete hanya saat `draft` atau `canceled`** — SO aktif tidak bisa dihapus.
7. **Invoice otomatis saat `delivered`** — invoice penjualan dibuat non-blocking, status `sent`.
8. **Jurnal HPP otomatis saat `delivered`** — jurnal COGS dibuat non-blocking.
9. **Revert stok saat `returned`/`canceled`** — mutasi stok OUT dikembalikan.
10. **`invoiceNumber` harus unik** — validasi duplikasi saat create dan update.
