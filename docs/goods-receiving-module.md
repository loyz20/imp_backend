# API Contract — Modul Goods Receiving (Penerimaan Barang)

**Modul:** Goods Receiving Management (Penerimaan Barang dari Supplier)
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/goods-receivings`

> Verifikasi penerimaan barang sesuai standar CDOB dengan pengecekan batch, expiry date, dan kondisi barang. Input nomor invoice manual terintegrasi dengan modul keuangan.

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

### Goods Receiving Schema

```javascript
{
  _id: ObjectId,

  // ── Identitas ──
  invoiceNumber: String,      // Wajib. Manual input dari invoice supplier
  status: String,              // Enum GR_STATUS

  // ── Referensi ──
  purchaseOrderId: ObjectId,   // Ref → PurchaseOrder (opsional)
  supplierId: ObjectId,        // Ref → Supplier

  // ── Tanggal ──
  receivingDate: Date,         // Wajib
  deliveryNote: String,        // Nomor surat jalan supplier (max 100)
  // ── Tanggal ──

  // ── Item ──
  items: [{
    productId: ObjectId,       // Ref → Product
    product: { name, sku },
    satuan: String,
    orderedQty: Number,        // Qty yang dipesan di PO
    receivedQty: Number,       // Qty yang diterima (1-999999)
    batchNumber: String,       // Wajib (1-50 char). Nomor batch pabrik
    expiryDate: Date,          // Wajib. Tanggal kadaluarsa
    manufacturingDate: Date,   // Opsional
    storageCondition: String,  // Enum GR_STORAGE_CONDITION
    conditionStatus: String,   // Enum GR_CONDITION_STATUS
    notes: String,             // Max 500
  }],

  notes: String,               // Max 1000

  // ── Verifikasi ──
  verifiedBy: ObjectId,        // Ref → User (apoteker)
  verifiedAt: Date,

  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

---

## Enum & Konstanta

### Status GR (`GR_STATUS`)

| Value | Deskripsi |
|-------|-----------|
| `draft` | Penerimaan baru dibuat |
| `checked` | Sudah dicek fisik |
| `verified` | Diverifikasi apoteker |
| `completed` | Selesai, stok sudah masuk |

### Kondisi Barang (`GR_CONDITION_STATUS`)

| Value | Deskripsi |
|-------|-----------|
| `baik` | Kondisi baik |
| `rusak` | Rusak |
| `cacat` | Cacat |

### Kondisi Penyimpanan (`GR_STORAGE_CONDITION`)

`Suhu Kamar`, `Sejuk`, `Dingin`, `Beku`

---

## Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/goods-receivings` | All 6 roles | Daftar GR (paginated) |
| GET | `/goods-receivings/stats` | All 6 roles | Statistik GR |
| GET | `/goods-receivings/available-pos` | SA, Admin, Apoteker, Gudang | PO yang available untuk GR |
| GET | `/goods-receivings/:id` | All 6 roles | Detail GR |
| POST | `/goods-receivings` | SA, Admin, Gudang | Buat GR baru |
| PUT | `/goods-receivings/:id` | SA, Admin, Gudang | Update GR (draft only) |
| DELETE | `/goods-receivings/:id` | SA, Admin, Gudang | Hapus GR (draft only) |
| PATCH | `/goods-receivings/:id/verify` | SA, Admin, Apoteker | Verifikasi GR |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 9.1 Get All Goods Receivings

```
GET /goods-receivings
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Max 100 |
| `search` | `string` | | Cari di `grNumber` (max 200) |
| `status` | `string` | | Filter status (comma-separated) |
| `supplierId` | `string` | | Filter supplier |
| `dateFrom` | `date` | | Filter tanggal mulai |
| `dateTo` | `date` | | Filter tanggal akhir |
| `sort` | `string` | `-createdAt` | Sorting (max 50) |

---

### 9.2 Get GR Stats

```
GET /goods-receivings/stats
```

---

### 9.3 Get Available POs

PO yang bisa digunakan untuk membuat GR baru (status `sent` atau `partial_received`). Menampilkan `remainingQty` per item.

```
GET /goods-receivings/available-pos
```

**Query Parameters:**

| Param | Type | Deskripsi |
|-------|------|-----------|
| `search` | `string` | Cari di PO number (max 200) |
| `supplierId` | `string` | Filter supplier |
| `page` | `integer` | Halaman |
| `limit` | `integer` | Max 100 |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "660a...",
      "poNumber": "SP/202604/000001",
      "supplier": { "name": "PT Kimia Farma" },
      "orderDate": "2026-04-01",
      "items": [
        {
          "productId": "660b...",
          "product": { "name": "Amoxicillin 500mg" },
          "quantity": 100,
          "receivedQty": 30,
          "remainingQty": 70
        }
      ]
    }
  ]
}
```

---

### 9.4 Get GR by ID

```
GET /goods-receivings/:id
```

---

### 9.5 Create Goods Receiving

```
POST /goods-receivings
```

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `purchaseOrderId` | `string` | ❌ | Valid ObjectId. PO harus status sent/partial_received |
| `supplierId` | `string` | ✅ | Required. Valid ObjectId |
| `receivingDate` | `date` | ✅ | ISO format |
| `deliveryNote` | `string` | ❌ | Max 100 |
| `invoiceNumber` | `string` | ✅ | Required. Max 100. Unique |
| `notes` | `string` | ❌ | Max 1000 |
| `items` | `array` | ✅ | Min 1 item |
| `items[].productId` | `string` | ✅ | |
| `items[].satuan` | `string` | ❌ | |
| `items[].orderedQty` | `number` | ❌ | Min 0 |
| `items[].receivedQty` | `number` | ✅ | 1-999999 |
| `items[].batchNumber` | `string` | ✅ | 1-50 karakter |
| `items[].expiryDate` | `date` | ✅ | Harus di masa depan |
| `items[].manufacturingDate` | `date` | ❌ | Harus sebelum expiryDate |
| `items[].storageCondition` | `string` | ❌ | Enum |
| `items[].conditionStatus` | `string` | ❌ | Enum |
| `items[].notes` | `string` | ❌ | Max 500 |

**Perbedaan dengan Rencana PO (PO-linked):**

> Item penerimaan boleh berbeda dari item yang direncanakan di PO (termasuk produk tambahan atau qty berbeda).
> `orderedQty` diperlakukan sebagai data referensi; untuk item yang cocok ke PO dan `orderedQty` kosong, sistem akan auto-isi dari qty di PO.

**Response `201 Created`**

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | PO tidak dalam status sent/partial_received |
| `400` | Expiry date sudah lewat / manufacturing date setelah expiry date |
| `422` | Validasi gagal |

---

### 9.6 Update Goods Receiving

```
PUT /goods-receivings/:id
```

Hanya bisa diupdate saat status **`draft`**.

---

### 9.7 Delete Goods Receiving

```
DELETE /goods-receivings/:id
```

Hanya bisa dihapus saat status **`draft`**.

---

### 9.8 Verify Goods Receiving

Verifikasi oleh Apoteker. Melakukan serangkaian aksi otomatis.

```
PATCH /goods-receivings/:id/verify
```

**Roles:** SA, Admin, Apoteker

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `notes` | `string` | ❌ |

**Side Effects (otomatis saat verify):**

1. **Validasi CDOB** — semua item harus punya `batchNumber` dan `expiryDate`, tidak boleh expired
2. **Update PO** — update `receivedQty` per item, auto-set PO status ke `partial_received` atau `received`
3. **Create Stock Batches** — batch baru dibuat atau quantity di-add ke batch existing (deduplifikasi by `productId + batchNumber`)
4. **Create Stock Mutations** — mutasi masuk (type: `in`, reference: `goods_receiving`)
5. **Auto Journal Entry** — DR Persediaan (1300) + DR PPN Masukan (2110), CR Hutang Usaha (2100)

**Batch Deduplication Logic:**
> Jika batch dengan `productId + batchNumber` yang sama sudah ada di database (dari GR sebelumnya), sistem akan **menambah quantity** ke batch existing alih-alih membuat batch baru. Batch yang statusnya `depleted` akan otomatis diaktifkan kembali.

---

## Status Flow

```
draft → checked → verified → completed
```

> Catatan: Saat ini, transisi utama adalah `draft → verified` (via endpoint verify). Status `checked` dan `completed` dikelola internal.

---

## Integrasi

| Modul | Arah | Aksi |
|-------|------|------|
| Purchase Order | ← PO ke GR | GR mereferensi PO, validasi qty |
| Purchase Order | GR → PO | Verify GR update PO receivedQty & status |
| Inventory | GR → Stock | Verify GR create batches & mutations |
| Finance | GR → GL | Verify GR auto-create journal entry |

---

## Validasi & Business Rules

1. **GR boleh berbeda dari PO** — item/qty penerimaan boleh berbeda dari perencanaan PO
2. **Batch deduplication** — batch dengan productId + batchNumber yang sama akan di-merge (quantity ditambahkan), bukan duplikasi
3. **CDOB compliance** — semua item wajib memiliki batchNumber dan expiryDate saat verifikasi
4. **Expiry validation** — expiry date harus di masa depan, manufacturing date harus sebelum expiry
5. **Only draft editable** — update/delete hanya untuk status draft
6. **Apoteker verification** — verifikasi membutuhkan role Apoteker (atau SA/Admin)
7. **Auto journal** — jurnal pembelian otomatis dibuat saat verify, sesuai standar akuntansi
