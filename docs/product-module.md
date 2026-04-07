# API Contract — Modul Produk (Master Data Obat & Alkes)

**Modul:** Product Management (Master Data Produk)
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/products`

> Mengikuti standar regulasi BPOM, CDOB (Cara Distribusi Obat yang Baik), dan standar industri PBF (Pedagang Besar Farmasi).

---

## Daftar Isi

- [Data Model](#data-model)
- [Enum & Konstanta](#enum--konstanta)
- [Endpoints](#endpoints)
  - [6.1 Get All Products](#61-get-all-products)
  - [6.2 Get Product Stats](#62-get-product-stats)
  - [6.3 Get Product by ID](#63-get-product-by-id)
  - [6.4 Create Product](#64-create-product)
  - [6.5 Update Product](#65-update-product)
  - [6.6 Delete Product](#66-delete-product)
  - [6.7 Change Product Status](#67-change-product-status)
- [Validasi & Business Rules](#validasi--business-rules)
- [Catatan Regulasi](#catatan-regulasi)

---

## Data Model

### Product Schema

```javascript
{
  _id: ObjectId,

  // ── Informasi Umum ──
  name: String,              // Wajib. Nama produk (2-200 karakter, unik case-insensitive)
  sku: String,               // Unik. Auto-generate jika kosong (format: PRD-YYYYMMDD-XXXX)
  barcode: String,           // Opsional. EAN-13 / Code-128 (unik jika diisi)
  category: String,          // Wajib. Enum kategori produk
  golongan: String,          // Wajib. Enum golongan obat (regulasi BPOM)

  // ── Regulasi & Registrasi ──
  nie: String,               // Nomor Izin Edar (format: DKL|DKT|DBL|DTL|DKI|DBI|FF|SD|TR|AKL|AKI + digit)
  noBpom: String,            // Nomor registrasi BPOM

  // ── Informasi Farmasi ──
  bentukSediaan: String,     // Enum bentuk sediaan (24 opsi)
  kekuatan: String,          // Kekuatan/dosis (contoh: "500mg", "10mg/5mL")
  zatAktif: String,          // Zat aktif / komposisi lengkap (max 500 karakter)
  golonganTerapi: String,    // Golongan terapi (contoh: "Antibiotik", "Analgesik")

  // ── Satuan & Konversi ──
  satuan: String,            // Satuan besar (Box, Botol, dll)
  satuanKecil: String,       // Satuan kecil (Tablet, Kapsul, mL)
  isiPerSatuan: Number,      // Konversi: jumlah satuan kecil per satuan besar (min: 1)

  // ── Harga ──
  hna: Number,               // Harga Netto Apotek (Rp, min: 0)
  het: Number,               // Harga Eceran Tertinggi (Rp, min: 0)
  hargaBeli: Number,         // Harga beli/perolehan (Rp, min: 0)
  hargaJual: Number,         // Harga jual ke pelanggan (Rp, min: 0)
  ppn: Boolean,              // Apakah dikenakan PPN (default: true)

  // ── Stok & Penyimpanan ──
  stokMinimum: Number,       // Alert threshold stok minimum per produk (overrides global lowStockThreshold)
  suhuPenyimpanan: String,   // Enum suhu penyimpanan (CDOB compliance)

  // ── Produsen ──
  manufacturer: String,      // Nama pabrik / industri farmasi (max 200)
  countryOfOrigin: String,   // Negara asal (default: "Indonesia", max 100)

  // ── Lainnya ──
  keterangan: String,        // Catatan tambahan (max 1000)
  isActive: Boolean,         // Status aktif (default: true)

  // ── Metadata ──
  createdBy: ObjectId,       // Ref → User yang membuat
  updatedBy: ObjectId,       // Ref → User yang terakhir update
  createdAt: Date,
  updatedAt: Date,
}
```

> **Catatan `stokMinimum`:** Jika field ini diisi (> 0) pada produk, maka threshold stok rendah akan menggunakan nilai ini alih-alih `settings.inventory.lowStockThreshold` global. Digunakan di modul Inventory untuk menentukan `stockStatus` (normal/low/out_of_stock).

---

## Enum & Konstanta

### Kategori Produk (`PRODUCT_CATEGORY`)

| Value | Label |
|-------|-------|
| `obat` | Obat |
| `alkes` | Alat Kesehatan |
| `bhp` | Bahan Habis Pakai |
| `suplemen` | Suplemen |
| `kosmetik` | Kosmetik |
| `obat_tradisional` | Obat Tradisional |
| `lainnya` | Lainnya |

### Golongan Obat (`GOLONGAN_OBAT`)

| Value | Label | Regulasi |
|-------|-------|----------|
| `narkotika` | Narkotika | SP Khusus, double-lock storage |
| `psikotropika` | Psikotropika | SP Khusus |
| `obat_keras` | Obat Keras (K) | Butuh resep dokter |
| `obat_keras_terbatas` | Obat Keras Terbatas (W) | |
| `obat_bebas_terbatas` | Obat Bebas Terbatas (P) | |
| `obat_bebas` | Obat Bebas (G) | |
| `fitofarmaka` | Fitofarmaka | |
| `oht` | Obat Herbal Terstandar | |
| `jamu` | Jamu | |
| `non_obat` | Non Obat | |

### Bentuk Sediaan (`BENTUK_SEDIAAN`)

`Tablet`, `Kaplet`, `Kapsul`, `Sirup`, `Suspensi`, `Emulsi`, `Drops`, `Injeksi`, `Salep`, `Krim`, `Gel`, `Suppositoria`, `Ovula`, `Inhaler`, `Patch`, `Infus`, `Serbuk`, `Granul`, `Larutan`, `Tetes Mata`, `Tetes Telinga`, `Spray`, `Alat Kesehatan`, `Lainnya`

### Satuan (`SATUAN`)

`Box`, `Botol`, `Tube`, `Strip`, `Blister`, `Ampul`, `Vial`, `Sachet`, `Pcs`, `Pack`, `Rol`, `Lembar`, `Set`, `Kg`, `Gram`, `Liter`, `mL`

### Suhu Penyimpanan (`SUHU_PENYIMPANAN`)

| Value | Rentang | Keterangan |
|-------|---------|------------|
| `ruangan` | 15-30°C | CRT (Controlled Room Temperature) |
| `sejuk` | 8-15°C | Cool storage |
| `dingin` | 2-8°C | Refrigerator |
| `beku` | ≤ -20°C | Freezer |

---

## Endpoints

### Ringkasan

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/products` | SA, Admin, Apoteker, Gudang | Daftar produk (paginated) |
| GET | `/products/stats` | SA, Admin, Apoteker, Gudang | Statistik produk |
| GET | `/products/:id` | SA, Admin, Apoteker, Gudang | Detail produk |
| POST | `/products` | SA, Admin, Apoteker | Buat produk baru |
| PUT | `/products/:id` | SA, Admin, Apoteker | Update produk |
| DELETE | `/products/:id` | SA, Admin | Hapus produk (soft delete) |
| PATCH | `/products/:id/status` | SA, Admin, Apoteker | Aktifkan/nonaktifkan |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 6.1 Get All Products

```
GET /products
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Jumlah per halaman (max 100) |
| `search` | `string` | | Cari di `name`, `sku`, `nie`, `barcode`, `zatAktif` (max 200 char) |
| `category` | `string` | | Filter kategori produk |
| `golongan` | `string` | | Filter golongan obat |
| `isActive` | `boolean` | | Filter status aktif |
| `manufacturer` | `string` | | Filter pabrik |
| `suhuPenyimpanan` | `string` | | Filter suhu penyimpanan |
| `sort` | `string` | `-createdAt` | Sorting field |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "660a...",
      "name": "Amoxicillin 500mg",
      "sku": "PRD-20260401-0001",
      "barcode": "8991234567890",
      "category": "obat",
      "golongan": "obat_keras",
      "nie": "DKL1234567890A1",
      "bentukSediaan": "Kapsul",
      "satuan": "Box",
      "satuanKecil": "Kapsul",
      "isiPerSatuan": 100,
      "hargaBeli": 25000,
      "hargaJual": 35000,
      "ppn": true,
      "stokMinimum": 50,
      "suhuPenyimpanan": "ruangan",
      "manufacturer": "PT Kimia Farma",
      "isActive": true,
      "createdAt": "2026-04-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "totalDocs": 150,
      "totalPages": 15,
      "page": 1,
      "limit": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### 6.2 Get Product Stats

```
GET /products/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "total": 150,
    "active": 130,
    "inactive": 20,
    "byCategory": {
      "obat": 80,
      "alkes": 30,
      "bhp": 20,
      "suplemen": 10,
      "lainnya": 10
    },
    "byGolongan": {
      "obat_keras": 50,
      "obat_bebas": 30,
      "narkotika": 5,
      "psikotropika": 10,
      "non_obat": 55
    },
    "bySuhuPenyimpanan": {
      "ruangan": 100,
      "sejuk": 20,
      "dingin": 25,
      "beku": 5
    }
  }
}
```

---

### 6.3 Get Product by ID

```
GET /products/:id
```

**Path Parameters:**

| Param | Type | Required | Validation |
|-------|------|----------|------------|
| `id` | `string` | ✅ | Valid MongoDB ObjectId |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "_id": "660a...",
    "name": "Amoxicillin 500mg",
    "sku": "PRD-20260401-0001",
    "barcode": "8991234567890",
    "category": "obat",
    "golongan": "obat_keras",
    "nie": "DKL1234567890A1",
    "noBpom": "DKL1234567890A1",
    "bentukSediaan": "Kapsul",
    "kekuatan": "500mg",
    "zatAktif": "Amoxicillin trihydrate",
    "golonganTerapi": "Antibiotik",
    "satuan": "Box",
    "satuanKecil": "Kapsul",
    "isiPerSatuan": 100,
    "hna": 30000,
    "het": 40000,
    "hargaBeli": 25000,
    "hargaJual": 35000,
    "ppn": true,
    "stokMinimum": 50,
    "suhuPenyimpanan": "ruangan",
    "manufacturer": "PT Kimia Farma",
    "countryOfOrigin": "Indonesia",
    "keterangan": "",
    "isActive": true,
    "createdBy": "660a...",
    "updatedBy": "660a...",
    "createdAt": "2026-04-01T10:00:00.000Z",
    "updatedAt": "2026-04-01T10:00:00.000Z"
  }
}
```

---

### 6.4 Create Product

```
POST /products
```

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | `string` | ✅ | 2-200 karakter, unik (case-insensitive) |
| `sku` | `string` | ❌ | Max 50, unik. Auto-generate jika kosong |
| `barcode` | `string` | ❌ | Max 50, unik jika diisi |
| `category` | `string` | ✅ | Enum `PRODUCT_CATEGORY` |
| `golongan` | `string` | ✅ | Enum `GOLONGAN_OBAT` |
| `nie` | `string` | ❌ | Max 50 |
| `noBpom` | `string` | ❌ | Max 50 |
| `bentukSediaan` | `string` | ❌ | Enum `BENTUK_SEDIAAN` |
| `kekuatan` | `string` | ❌ | Max 100 |
| `zatAktif` | `string` | ❌ | Max 500 |
| `golonganTerapi` | `string` | ❌ | Max 200 |
| `satuan` | `string` | ❌ | Enum `SATUAN` |
| `satuanKecil` | `string` | ❌ | Max 50 |
| `isiPerSatuan` | `number` | ❌ | Min 1 |
| `hna` | `number` | ❌ | Min 0 |
| `het` | `number` | ❌ | Min 0 |
| `hargaBeli` | `number` | ❌ | Min 0 |
| `hargaJual` | `number` | ❌ | Min 0 |
| `ppn` | `boolean` | ❌ | Default: true |
| `stokMinimum` | `number` | ❌ | Min 0. Override global threshold |
| `suhuPenyimpanan` | `string` | ❌ | Enum `SUHU_PENYIMPANAN` |
| `manufacturer` | `string` | ❌ | Max 200 |
| `countryOfOrigin` | `string` | ❌ | Max 100, default: "Indonesia" |
| `keterangan` | `string` | ❌ | Max 1000 |
| `isActive` | `boolean` | ❌ | Default: true |

**Response `201 Created`:**

```json
{
  "success": true,
  "message": "Produk berhasil dibuat",
  "data": { ... }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `409` | Nama produk, SKU, atau barcode sudah ada |
| `422` | Validasi gagal |

---

### 6.5 Update Product

```
PUT /products/:id
```

Semua field opsional. Hanya field yang dikirim yang akan diupdate. Validasi NIE regex: prefix `DKL|DKT|DBL|DTL|DKI|DBI|FF|SD|TR|AKL|AKI`.

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Produk berhasil diupdate",
  "data": { ... }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `404` | Produk tidak ditemukan |
| `409` | Nama/SKU/barcode duplikat dengan produk lain |
| `422` | Validasi gagal |

---

### 6.6 Delete Product

Soft delete — mengubah `isActive` menjadi `false`.

```
DELETE /products/:id
```

**Roles:** Superadmin, Admin

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Produk berhasil dihapus"
}
```

---

### 6.7 Change Product Status

```
PATCH /products/:id/status
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `isActive` | `boolean` | ✅ |

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Status produk berhasil diubah",
  "data": { ... }
}
```

---

## Validasi & Business Rules

1. **Nama unik** (case-insensitive) — tidak boleh duplikat
2. **SKU unik** — auto-generate format `PRD-YYYYMMDD-XXXX` jika kosong
3. **Barcode unik** jika diisi
4. **Soft delete** — `DELETE` hanya mengubah `isActive = false`, data tetap ada
5. **`stokMinimum` per-produk** — jika > 0, digunakan sebagai threshold stok rendah di modul Inventory menggantikan global `lowStockThreshold` dari Settings
6. **Search** mencakup field: `name`, `sku`, `nie`, `barcode`, `zatAktif`

---

## Catatan Regulasi

- **NIE (Nomor Izin Edar):** Wajib untuk produk obat yang terdaftar. Format prefix sesuai BPOM: DKL (Obat Keras Lokal), DKT (Obat Keras Tertentu), DBL (Obat Bebas Lokal), DTL (Obat Tradisional Lokal), dll.
- **Golongan Narkotika & Psikotropika:** Memerlukan Surat Pesanan Khusus dan penyimpanan double-lock.
- **Suhu Penyimpanan:** Wajib sesuai CDOB untuk memastikan kualitas obat selama penyimpanan dan distribusi.
- **FEFO (First Expired First Out):** Pengambilan stok diurutkan berdasarkan tanggal kadaluarsa terdekat (diimplementasi di modul Inventory & Delivery).
