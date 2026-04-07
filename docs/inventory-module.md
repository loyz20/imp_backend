# API Contract — Modul Inventory (Manajemen Stok & Gudang)

**Modul:** Inventory Management
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/inventory`

> Mengelola stok dengan sistem FEFO (First Expired First Out), batch tracking, stock opname, dan monitoring kadaluarsa sesuai CDOB.

---

## Daftar Isi

- [Sub-Modul](#sub-modul)
- [Enum & Konstanta](#enum--konstanta)
- [1. Stok](#1-stok)
- [2. Mutasi](#2-mutasi)
- [3. Stock Opname](#3-stock-opname)
- [4. Stock Card (Kartu Stok)](#4-stock-card-kartu-stok)
- [5. Monitoring Kadaluarsa](#5-monitoring-kadaluarsa)
- [Data Model](#data-model)
- [Integrasi](#integrasi)
- [Business Rules](#business-rules)

---

## Sub-Modul

| Sub-Modul | Prefix | Deskripsi |
|-----------|--------|-----------|
| Stok | `/inventory/stock` | Summary stok & batch per produk |
| Mutasi | `/inventory/mutations` | Riwayat mutasi stok (in/out/adjustment) |
| Opname | `/inventory/opname` | Stock opname / stock take |
| Stock Card | `/inventory/stock-card` | Kartu stok per produk |
| Expired | `/inventory/expired` | Monitoring barang kadaluarsa |

---

## Enum & Konstanta

### Status Batch (`BATCH_STATUS`)

| Value | Deskripsi |
|-------|-----------|
| `active` | Batch aktif, stok tersedia |
| `expired` | Batch sudah kadaluarsa (auto-marked) |
| `depleted` | Stok habis |
| `disposed` | Sudah dimusnahkan |

### Tipe Mutasi (`MUTATION_TYPE`)

| Value | Deskripsi |
|-------|-----------|
| `in` | Masuk (dari GR) |
| `out` | Keluar (dari delivery) |
| `adjustment` | Penyesuaian (opname/manual) |
| `disposal` | Pemusnahan |
| `transfer` | Transfer antar gudang |
| `return` | Retur |

### Referensi Mutasi (`MUTATION_REFERENCE_TYPE`)

`goods_receiving`, `sales_order`, `opname`, `manual`, `disposal`, `return`

### Status Opname (`OPNAME_STATUS`)

| Value | Deskripsi |
|-------|-----------|
| `draft` | Opname baru dibuat |
| `in_progress` | Sedang berjalan |
| `completed` | Selesai |
| `cancelled` | Dibatalkan |

### Status Stok (`STOCK_STATUS`)

| Value | Deskripsi |
|-------|-----------|
| `normal` | Stok di atas threshold |
| `low` | Stok di bawah threshold |
| `out_of_stock` | Stok habis (0) |
| `overstock` | Stok berlebihan |

### Status Kadaluarsa (`EXPIRY_STATUS`)

| Value | Jangka Waktu |
|-------|-------------|
| `expired` | Sudah kadaluarsa (≤ 0 hari) |
| `critical` | ≤ 30 hari |
| `warning` | ≤ 90 hari |
| `caution` | ≤ 180 hari |
| `safe` | > 180 hari |

---

## 1. Stok

### Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/inventory/stock` | All roles | Summary stok semua produk |
| GET | `/inventory/stock/stats` | All roles | Statistik stok keseluruhan |
| GET | `/inventory/stock/:productId/batches` | All roles | Detail batch per produk |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 1.1 Get Stock Summary

```
GET /inventory/stock
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Max 100 |
| `search` | `string` | | Cari di nama produk / SKU (max 200) |
| `kategori` | `string` | | Filter kategori produk |
| `golongan` | `string` | | Filter golongan obat |
| `stockStatus` | `string` | | `normal`, `low`, `out_of_stock`, `overstock` |
| `suhuPenyimpanan` | `string` | | Filter suhu |
| `sort` | `string` | `-createdAt` | Sorting (max 50) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "productId": "660a...",
      "name": "Amoxicillin 500mg",
      "sku": "PRD-001",
      "category": "obat",
      "golongan": "obat_keras",
      "satuan": "Box",
      "totalStock": 150,
      "stockValue": 3750000,
      "stokMinimum": 50,
      "stockStatus": "normal",
      "nearestExpiry": "2027-06-30",
      "batchCount": 3
    }
  ],
  "meta": { "pagination": { ... } }
}
```

> **Logika `stockStatus`:** Menggunakan **per-product `stokMinimum`** jika > 0, fallback ke global `settings.inventory.lowStockThreshold`:
> - `out_of_stock`: totalStock = 0
> - `low`: totalStock ≤ threshold
> - `normal`: totalStock > threshold

---

### 1.2 Get Stock Stats

```
GET /inventory/stock/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "totalSKU": 150,
    "totalStock": 15000,
    "totalStockValue": 450000000,
    "lowStock": 12,
    "outOfStock": 3,
    "nearExpiry": 8,
    "expired": 2,
    "byCategory": { "obat": 80, "alkes": 30, "bhp": 20 },
    "bySuhuPenyimpanan": { "ruangan": 100, "dingin": 25 }
  }
}
```

> Stats juga menggunakan per-product `stokMinimum` untuk menentukan `lowStock` count.

---

### 1.3 Get Product Batches

```
GET /inventory/stock/:productId/batches
```

Menampilkan semua batch produk tertentu, urut **FEFO** (First Expired First Out).

**Query Parameters:**

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page` | `integer` | Halaman |
| `limit` | `integer` | Max 100 |
| `status` | `string` | Filter status batch (comma-separated) |
| `sort` | `string` | Sorting (max 50) |

---

## 2. Mutasi

### Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/inventory/mutations` | All roles | Riwayat mutasi stok |
| GET | `/inventory/mutations/stats` | All roles | Statistik mutasi |
| POST | `/inventory/mutations` | SA, Admin, Gudang | Buat mutasi manual |

---

### 2.1 Get Mutations

```
GET /inventory/mutations
```

**Query Parameters:**

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page` | `integer` | Halaman |
| `limit` | `integer` | Max 100 |
| `search` | `string` | Cari (max 200) |
| `type` | `string` | Filter tipe mutasi (comma-separated) |
| `productId` | `string` | Filter produk |
| `dateFrom` | `date` | Tanggal mulai |
| `dateTo` | `date` | Tanggal akhir |
| `sort` | `string` | Sorting (max 50) |

---

### 2.2 Create Manual Mutation

```
POST /inventory/mutations
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `type` | `string` | ✅ | `adjustment`, `disposal`, `transfer` |
| `productId` | `string` | ✅ | Valid product |
| `batchId` | `string` | ✅ | Batch harus milik produk |
| `quantity` | `number` | ✅ | |
| `reason` | `string` | ✅ | Alasan wajib |
| `notes` | `string` | ❌ | Max 1000 |

**Validasi:**
- Batch harus milik product yang sama
- Jika disposal/transfer: cek stok cukup pada batch

---

## 3. Stock Opname

### Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/inventory/opname` | All roles | Daftar sesi opname |
| GET | `/inventory/opname/stats` | All roles | Statistik opname |
| POST | `/inventory/opname` | SA, Admin, Gudang | Buat sesi opname baru |
| GET | `/inventory/opname/:id` | All roles | Detail opname |
| PUT | `/inventory/opname/:id` | SA, Admin, Gudang | Input hasil counting |
| PATCH | `/inventory/opname/:id/finalize` | SA, Admin | Finalisasi opname |

---

### 3.1 Create Opname

```
POST /inventory/opname
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `opnameDate` | `date` | ❌ | Default: today |
| `scope` | `string` | ❌ | `all` atau `category` |
| `scopeFilter` | `string` | ❌ | Kategori jika scope = category |
| `assignedTo` | `string` | ❌ | User yang ditugaskan |
| `notes` | `string` | ❌ | Max 1000 |

**Logic:** Auto-populates items dari semua batch aktif (sesuai scope). Status: `draft`.

---

### 3.2 Update Opname (Input Counting)

```
PUT /inventory/opname/:id
```

| Field | Type | Validation |
|-------|------|------------|
| `status` | `string` | Hanya `in_progress` |
| `items` | `array` | Array hasil counting |
| `items[].actualQty` | `number` | Min 0 |
| `items[].notes` | `string` | Max 500 |
| `notes` | `string` | Max 1000 |

**Logic:** Menghitung `matched` dan `discrepancy` count berdasarkan perbandingan `expectedQty` vs `actualQty`.

---

### 3.3 Finalize Opname

```
PATCH /inventory/opname/:id/finalize
```

**Roles:** SA, Admin

**Side Effects:**
1. Membuat mutasi `adjustment` untuk setiap item yang ada selisih (discrepancy)
2. Menyesuaikan quantity batch
3. Status: `in_progress → completed`

---

## 4. Stock Card (Kartu Stok)

### Endpoint

```
GET /inventory/stock-card/:productId
```

| Param | Type | Required | Deskripsi |
|-------|------|----------|-----------|
| `productId` | `string` | ✅ | Valid product ObjectId |

**Query Parameters:**

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page` | `integer` | Halaman |
| `limit` | `integer` | Max 100 |
| `dateFrom` | `date` | Tanggal mulai |
| `dateTo` | `date` | Tanggal akhir |
| `type` | `string` | Filter tipe mutasi (comma-separated) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "product": { "_id": "660a...", "name": "Amoxicillin 500mg", "sku": "PRD-001" },
    "openingBalance": 100,
    "closingBalance": 150,
    "summary": {
      "totalIn": 80,
      "totalOut": 30
    },
    "mutations": [
      {
        "mutationDate": "2026-04-01T10:00:00.000Z",
        "type": "in",
        "quantity": 50,
        "referenceType": "goods_receiving",
        "referenceNumber": "GR/202604/000001",
        "batchNumber": "BATCH-001",
        "notes": "Penerimaan dari PT Kimia Farma"
      }
    ]
  },
  "meta": { "pagination": { ... } }
}
```

> **Opening Balance Logic:**
> - **Dengan `dateFrom`**: Opening balance = sum seluruh mutasi sebelum `dateFrom` (positif untuk IN, negatif untuk OUT)
> - **Tanpa `dateFrom`**: Closing balance = stok saat ini, opening balance dihitung mundur dari closing - (totalIn - totalOut)

---

## 5. Monitoring Kadaluarsa

### Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/inventory/expired` | All roles | Daftar batch mendekati/sudah kadaluarsa |
| GET | `/inventory/expired/stats` | All roles | Statistik kadaluarsa |

---

### 5.1 Get Expired Items

```
GET /inventory/expired
```

**Query Parameters:**

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page` | `integer` | Halaman |
| `limit` | `integer` | Max 100 |
| `search` | `string` | Cari produk (max 200) |
| `expiryStatus` | `string` | `expired`, `critical`, `warning`, `caution` |
| `kategori` | `string` | Filter kategori |
| `storageCondition` | `string` | Filter kondisi penyimpanan |
| `sort` | `string` | Sorting (max 50) |

---

### 5.2 Get Expired Stats

```
GET /inventory/expired/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "expired": { "count": 5, "value": 2500000 },
    "critical": { "count": 8, "value": 4000000 },
    "warning": { "count": 15, "value": 7500000 },
    "caution": { "count": 20, "value": 10000000 },
    "safe": { "count": 200, "value": 100000000 }
  }
}
```

---

## Data Model

### StockBatch Schema

```javascript
{
  _id: ObjectId,
  productId: ObjectId,       // Ref → Product
  batchNumber: String,       // Nomor batch pabrik (unik per produk)
  quantity: Number,          // Stok saat ini
  initialQuantity: Number,   // Stok awal saat diterima
  expiryDate: Date,
  manufacturingDate: Date,
  receivedDate: Date,
  storageCondition: String,  // Suhu Kamar / Sejuk / Dingin / Beku
  status: String,            // Enum BATCH_STATUS
  goodsReceivingId: ObjectId,
  supplierId: ObjectId,
  unitPrice: Number,         // Harga per unit dari PO
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

### StockMutation Schema

```javascript
{
  _id: ObjectId,
  productId: ObjectId,
  batchId: ObjectId,         // Ref → StockBatch
  type: String,              // Enum MUTATION_TYPE
  quantity: Number,          // Positif untuk IN, negatif untuk OUT
  referenceType: String,     // Enum MUTATION_REFERENCE_TYPE
  referenceId: ObjectId,
  referenceNumber: String,   // Nomor dokumen referensi
  mutationDate: Date,
  notes: String,
  createdBy: ObjectId,
  createdAt: Date,
}
```

### StockOpname Schema

```javascript
{
  _id: ObjectId,
  opnameNumber: String,      // Auto-generate
  opnameDate: Date,
  scope: String,             // all / category
  scopeFilter: String,
  status: String,            // Enum OPNAME_STATUS
  assignedTo: ObjectId,
  items: [{
    productId: ObjectId,
    batchId: ObjectId,
    batchNumber: String,
    expectedQty: Number,     // Stok di sistem
    actualQty: Number,       // Hasil hitung fisik
    difference: Number,      // actualQty - expectedQty
    notes: String,
  }],
  summary: {
    totalItems: Number,
    matched: Number,
    discrepancy: Number,
  },
  notes: String,
  completedAt: Date,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

---

## Integrasi

| Modul | Arah | Aksi |
|-------|------|------|
| Goods Receiving | GR → Inventory | `createGRMutations()` — buat/update batch + mutasi IN |
| Delivery | Delivery → Inventory | `createDeliveryMutations()` — FEFO stock deduction + mutasi OUT |
| Delivery (cancel) | Delivery → Inventory | `revertDeliveryMutations()` — restore batch qty + mutasi RETURN |
| Return | Return → Inventory | Restock: add batch qty + mutasi RETURN. Destroy: reduce qty + mutasi DISPOSAL |
| Product | Product → Inventory | `stokMinimum` per-produk untuk threshold stok rendah |
| Settings | Settings → Inventory | `lowStockThreshold` global sebagai fallback |

---

## Business Rules

1. **Per-product `stokMinimum`** — setiap produk bisa memiliki threshold stok minimum sendiri. Jika > 0, digunakan alih-alih global `lowStockThreshold` dari Settings
2. **Auto-mark expired batches** — fungsi `updateExpiredBatches()` otomatis mengubah status batch aktif yang sudah melewati `expiryDate` menjadi `expired`
3. **Batch deduplication** — saat GR, batch di-lookup berdasarkan `productId + batchNumber`. Jika sudah ada, quantity ditambahkan (bukan batch baru)
4. **FEFO** — pengambilan stok untuk delivery diurutkan berdasarkan expiry date terdekat
5. **Stock card opening balance** — jika `dateFrom` diberikan, opening balance dihitung dari sum mutasi sebelum tanggal tersebut
6. **Disposal validation** — mutasi disposal/transfer memvalidasi stok batch mencukupi
7. **Opname auto-populate** — item opname otomatis diisi dari batch aktif sesuai scope
8. **Opname finalize** — membuat mutasi adjustment untuk setiap selisih dan menyesuaikan quantity batch
