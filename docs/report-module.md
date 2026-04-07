# API Contract — Modul Report (Laporan)

**Modul:** Report Management
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/reports`

> Modul read-only untuk menghasilkan laporan, statistik, chart, serta ekspor Excel dan PDF. Semua endpoint bersifat GET.

---

## Daftar Isi

- [Sub-Modul](#sub-modul)
- [1. Laporan Penjualan](#1-laporan-penjualan)
- [2. Laporan Pembelian](#2-laporan-pembelian)
- [3. Laporan Stok](#3-laporan-stok)
- [4. Laporan Keuangan](#4-laporan-keuangan)
- [5. Laporan Obat Kadaluarsa](#5-laporan-obat-kadaluarsa)
- [Enum & Konstanta](#enum--konstanta)
- [Format Ekspor](#format-ekspor)

---

## Sub-Modul

| Sub-Modul | Prefix | Endpoints | Deskripsi |
|-----------|--------|-----------|-----------|
| Sales | `/reports/sales` | 5 | Laporan penjualan (SO) |
| Purchases | `/reports/purchases` | 5 | Laporan pembelian (PO) |
| Stock | `/reports/stock` | 5 | Laporan stok & inventaris |
| Finance | `/reports/finance` | 5 | Laporan laba rugi & arus kas |
| Expired | `/reports/expired` | 5 | Laporan obat kadaluarsa |

**Total: 25 endpoints** (5 per sub-modul: list, stats, chart, export xlsx, export pdf)

---

## Pola Umum

Setiap sub-modul memiliki 5 endpoint yang konsisten:

| Suffix | Deskripsi | Response |
|--------|-----------|----------|
| `/` | Daftar data (paginated) | `{ docs, pagination }` |
| `/stats` | Statistik ringkasan | `{ key: value }` |
| `/chart` | Data untuk chart/grafik | `{ trend, topX, byY }` |
| `/export` | Ekspor Excel (.xlsx) | Binary file download |
| `/pdf` | Ekspor PDF (.pdf) | Binary file download |

---

## 1. Laporan Penjualan

**Roles:** SUPERADMIN, ADMIN, SALES, KEUANGAN

### Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/reports/sales` | Daftar SO |
| GET | `/reports/sales/stats` | Statistik penjualan |
| GET | `/reports/sales/chart` | Chart penjualan |
| GET | `/reports/sales/export` | Ekspor Excel |
| GET | `/reports/sales/pdf` | Ekspor PDF |

### 1.1 Get Sales Report

```
GET /reports/sales
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page` | `integer` | Halaman |
| `limit` | `integer` | Max 100 |
| `search` | `string` | Cari soNumber (max 100) |
| `status` | `string` | Filter SO status |
| `customerId` | `string` | Filter customer |
| `period` | `string` | `daily`, `weekly`, `monthly`, `yearly`, `custom` |
| `dateFrom` | `date` | Wajib jika period = custom |
| `dateTo` | `date` | Wajib jika period = custom |
| `sort` | `string` | Default: `-createdAt` |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "docs": [
      {
        "_id": "660a...",
        "soNumber": "SO/202601/000001",
        "customer": { "_id": "...", "name": "Apotek Sehat", "code": "C001", "type": "apotek" },
        "orderDate": "2026-01-15",
        "totalAmount": 5000000,
        "status": "completed"
      }
    ],
    "pagination": { "totalDocs": 50, "totalPages": 3, "page": 1, "limit": 20 }
  }
}
```

### 1.2 Get Sales Stats

```
GET /reports/sales/stats
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `status` | `string` | Filter |
| `customerId` | `string` | Filter |
| `period` | `string` | Periode |
| `dateFrom`, `dateTo` | `date` | |

**Response:**

```json
{
  "success": true,
  "data": {
    "totalSales": 500000000,
    "totalOrders": 150,
    "avgOrderValue": 3333333,
    "completedThisMonth": 45
  }
}
```

### 1.3 Get Sales Chart

```
GET /reports/sales/chart
```

**Response:**

```json
{
  "success": true,
  "data": {
    "trend": [{ "label": "Jan 2026", "total": 50000000 }],
    "topProducts": [{ "name": "Paracetamol 500mg", "qty": 500 }],
    "byCustomerType": [{ "name": "apotek", "value": 300000000 }],
    "topCustomers": [{ "name": "Apotek Sehat", "total": 100000000 }]
  }
}
```

---

## 2. Laporan Pembelian

**Roles:** SUPERADMIN, ADMIN, GUDANG, KEUANGAN

### Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/reports/purchases` | Daftar PO |
| GET | `/reports/purchases/stats` | Statistik pembelian |
| GET | `/reports/purchases/chart` | Chart pembelian |
| GET | `/reports/purchases/export` | Ekspor Excel |
| GET | `/reports/purchases/pdf` | Ekspor PDF |

### 2.1 Get Purchases Report

```
GET /reports/purchases
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page`, `limit` | | Pagination |
| `search` | `string` | Cari poNumber (max 100) |
| `status` | `string` | Filter PO status |
| `supplierId` | `string` | Filter supplier |
| `period` | `string` | `daily`, `weekly`, `monthly`, `yearly`, `custom` |
| `dateFrom`, `dateTo` | `date` | |
| `sort` | `string` | Default: `-createdAt` |

### 2.2 Get Purchases Stats

```
GET /reports/purchases/stats
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalPurchases": 300000000,
    "totalOrders": 80,
    "avgOrderValue": 3750000,
    "receivedThisMonth": 20
  }
}
```

### 2.3 Get Purchases Chart

```
GET /reports/purchases/chart
```

**Response:**

```json
{
  "success": true,
  "data": {
    "trend": [{ "label": "Jan 2026", "total": 30000000 }],
    "topSuppliers": [{ "name": "PT Kimia Farma", "total": 80000000 }],
    "byCategory": [{ "name": "Obat Keras", "value": 150000000 }],
    "topProducts": [{ "name": "Amoxicillin 500mg", "qty": 1000 }]
  }
}
```

---

## 3. Laporan Stok

**Roles:** SUPERADMIN, ADMIN, GUDANG, APOTEKER

### Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/reports/stock` | Daftar stok per product |
| GET | `/reports/stock/stats` | Statistik stok |
| GET | `/reports/stock/chart` | Chart stok |
| GET | `/reports/stock/export` | Ekspor Excel |
| GET | `/reports/stock/pdf` | Ekspor PDF |

### 3.1 Get Stock Report

```
GET /reports/stock
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page`, `limit` | | Pagination |
| `search` | `string` | Cari name/sku/code (max 100) |
| `kategori` | `string` | Filter kategori product |
| `golongan` | `string` | Filter golongan obat |
| `stockStatus` | `string` | `in_stock`, `low_stock`, `out_of_stock` |
| `sort` | `string` | Default: `-totalStock` |

**Logika `stockStatus`:**

```
totalStock = 0         → out_of_stock
totalStock ≤ stokMinimum → low_stock
totalStock > stokMinimum → in_stock
```

> `stokMinimum` diambil dari field per-product (`Product.stokMinimum`). Default fallback: 10.

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "docs": [
      {
        "_id": "660a...",
        "code": "PRD001",
        "sku": "SKU-AMX-500",
        "name": "Amoxicillin 500mg",
        "kategori": "Obat Keras",
        "golongan": "Antibiotik",
        "totalStock": 500,
        "stockValue": 25000000,
        "stockStatus": "in_stock",
        "unit": "Tablet"
      }
    ]
  }
}
```

### 3.2 Get Stock Stats

```
GET /reports/stock/stats
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalSku": 250,
    "totalQty": 50000,
    "nearExpiry": 15,
    "outOfStock": 8
  }
}
```

> `nearExpiry` = batch aktif dengan sisa stok > 0 yang expire dalam 90 hari.

### 3.3 Get Stock Chart

```
GET /reports/stock/chart
```

**Response:**

```json
{
  "success": true,
  "data": {
    "byCategory": [{ "name": "Obat Keras", "qty": 20000 }],
    "topProducts": [{ "name": "Paracetamol 500mg", "qty": 3000 }],
    "byGolongan": [{ "name": "Antibiotik", "value": 8000 }],
    "byStatus": [
      { "name": "Tersedia", "value": 200 },
      { "name": "Stok Rendah", "value": 30 },
      { "name": "Habis", "value": 8 }
    ]
  }
}
```

---

## 4. Laporan Keuangan

**Roles:** SUPERADMIN, ADMIN, KEUANGAN

### Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/reports/finance` | Laba rugi & arus kas |
| GET | `/reports/finance/stats` | Statistik ringkasan |
| GET | `/reports/finance/chart` | Chart keuangan |
| GET | `/reports/finance/export` | Ekspor Excel |
| GET | `/reports/finance/pdf` | Ekspor PDF |

### 4.1 Get Finance Report

```
GET /reports/finance
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `period` | `string` | `daily`, `weekly`, `monthly`, `yearly`, `custom` |
| `dateFrom`, `dateTo` | `date` | |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "profitLoss": {
      "salesRevenue": 500000000,
      "discountReturn": 25000000,
      "netRevenue": 475000000,
      "cogs": 300000000,
      "grossProfit": 175000000,
      "operatingExpense": 50000000,
      "otherExpense": 0,
      "netProfit": 125000000
    },
    "cashFlow": {
      "operatingIn": 400000000,
      "operatingOut": 280000000,
      "operatingNet": 120000000,
      "investingIn": 0,
      "investingOut": 0,
      "investingNet": 0,
      "financingIn": 0,
      "financingOut": 0,
      "financingNet": 0,
      "totalNet": 120000000
    }
  }
}
```

**Catatan perhitungan:**
- `cogs` dihitung dari total debit journal entry dengan akun HPP (5100), termasuk pembalikan dari return
- `operatingExpense` menghitung akun expense **kecuali** akun HPP (5100) untuk menghindari double-counting
- `discountReturn` = diskon invoice + total credit memo yang sudah posted
- `operatingIn` / `operatingOut` dihitung dari `Payment` yang status `verified`

### 4.2 Get Finance Stats

```
GET /reports/finance/stats
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalRevenue": 500000000,
    "totalExpense": 350000000,
    "netProfit": 125000000,
    "margin": 25.0
  }
}
```

### 4.3 Get Finance Chart

```
GET /reports/finance/chart
```

**Response:**

```json
{
  "success": true,
  "data": {
    "trend": [
      { "label": "Jan 2026", "revenue": 50000000, "expense": 35000000 }
    ],
    "profitTrend": [
      { "label": "Jan 2026", "profit": 15000000 }
    ]
  }
}
```

---

## 5. Laporan Obat Kadaluarsa

**Roles:** SUPERADMIN, ADMIN, GUDANG, APOTEKER

### Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/reports/expired` | Daftar batch kadaluarsa |
| GET | `/reports/expired/stats` | Statistik per urgency |
| GET | `/reports/expired/chart` | Chart kadaluarsa |
| GET | `/reports/expired/export` | Ekspor Excel |
| GET | `/reports/expired/pdf` | Ekspor PDF |

### 5.1 Get Expired Report

```
GET /reports/expired
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `page`, `limit` | | Pagination |
| `search` | `string` | Cari product name / batch number (max 100) |
| `kategori` | `string` | Filter kategori |
| `golongan` | `string` | Filter golongan |
| `expiryStatus` | `string` | `expired`, `critical`, `warning`, `caution` |
| `dateFrom`, `dateTo` | `date` | Filter expiry date range |
| `sort` | `string` | Default: `expiryDate` (ascending) |

> **Default filter:** Jika tidak ada expiryStatus/dateFrom/dateTo, menampilkan batch yang expire dalam 180 hari atau sudah expired.

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "docs": [
      {
        "productName": "Amoxicillin 500mg",
        "batchNumber": "BATCH-001",
        "expiryDate": "2026-03-15",
        "daysRemaining": -10,
        "qty": 100,
        "value": 5000000,
        "kategori": "Obat Keras",
        "golongan": "Antibiotik",
        "expiryStatus": "expired"
      }
    ]
  }
}
```

### 5.2 Get Expired Stats

```
GET /reports/expired/stats
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `kategori` | `string` | Filter kategori |
| `golongan` | `string` | Filter golongan |

**Response:**

```json
{
  "success": true,
  "data": {
    "totalExpired": 5,
    "critical": 3,
    "warning": 8,
    "caution": 12
  }
}
```

### 5.3 Get Expired Chart

```
GET /reports/expired/chart
```

**Response:**

```json
{
  "success": true,
  "data": {
    "byUrgency": [
      { "key": "expired", "name": "Kadaluarsa", "count": 5 },
      { "key": "critical", "name": "Kritis", "count": 3 },
      { "key": "warning", "name": "Warning", "count": 8 },
      { "key": "caution", "name": "Perhatian", "count": 12 }
    ],
    "byGolongan": [
      { "name": "Antibiotik", "value": 10 },
      { "name": "Analgesik", "value": 5 }
    ]
  }
}
```

---

## Enum & Konstanta

### Expiry Status

| Value | Sisa Hari | Label |
|-------|-----------|-------|
| `expired` | ≤ 0 | Kadaluarsa |
| `critical` | 1 – 30 | Kritis |
| `warning` | 31 – 90 | Warning |
| `caution` | 91 – 180 | Perhatian |
| `safe` | > 180 | Aman |

### Stock Status

| Value | Kondisi | Label |
|-------|---------|-------|
| `in_stock` | totalStock > stokMinimum | Tersedia |
| `low_stock` | 0 < totalStock ≤ stokMinimum | Stok Rendah |
| `out_of_stock` | totalStock = 0 | Habis |

### Period Options

| Value | Rentang |
|-------|---------|
| `daily` | Hari ini |
| `weekly` | 7 hari terakhir |
| `monthly` | 1 bulan terakhir (default) |
| `yearly` | 1 tahun terakhir |
| `custom` | dateFrom s/d dateTo |

---

## Format Ekspor

### Excel (.xlsx)

- Library: **ExcelJS**
- Header row: bold, background `#E0E0E0`
- Auto-filter aktif pada header
- Format angka: `#,##0` untuk currency dan quantity
- Limit: max 50.000 rows per export
- Creator: "IKO System"

### PDF (.pdf)

- Library: **PDFKit**
- Layout: `landscape` (A4) kecuali finance report (portrait)
- Header: Nama perusahaan (dari AppSetting), judul laporan, periode, tanggal cetak
- Table: Zebra striping (baris ganjil `#F5F5F5`)
- Font: Helvetica (header bold 8pt, data 7pt)
- Halaman: auto page break + page numbers "Halaman X dari Y"
- Nama perusahaan diambil dari `AppSetting.company.name` (default: "PT IKO Farma")

---

## Business Rules

1. **Semua endpoint read-only** — tidak ada POST/PUT/DELETE
2. **Default period = monthly** — jika tidak disediakan parameter period
3. **Ekspor tanpa pagination** — mengambil semua data (max 50.000 rows)
4. **Stock status per-product** — menggunakan `Product.stokMinimum` sebagai threshold (default fallback 10)
5. **Finance COGS separated** — HPP (akun 5100) dihitung terpisah dari operating expense untuk menghindari double-counting
6. **Expired default scope** — tanpa filter, hanya batch yang expire ≤ 180 hari ditampilkan
7. **Only active products** — laporan stok dan expired hanya menghitung produk dengan `isActive = true`
8. **Only active batches** — hanya batch status `active` dengan `quantity > 0`
