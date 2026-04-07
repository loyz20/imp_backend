# API Contract — Modul Return (Retur Barang)

**Modul:** Return Management (Retur Customer & Supplier)
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/returns`

> Mengelola proses retur dari customer dan ke supplier, termasuk disposisi barang, credit memo otomatis, dan pembalikan HPP.

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

### Return Schema

```javascript
{
  _id: ObjectId,

  // ── Identitas ──
  returnNumber: String,        // Unik. Auto-generate atau manual (max 50)
  returnType: String,          // customer_return / supplier_return
  status: String,              // Enum RETURN_STATUS

  // ── Referensi ──
  deliveryId: ObjectId,        // Ref → Delivery (customer_return)
  customerId: ObjectId,        // Ref → Customer (customer_return)
  supplierId: ObjectId,        // Ref → Supplier (supplier_return)

  // ── Detail ──
  returnDate: Date,
  reason: String,              // Max 500
  notes: String,               // Max 1000

  // ── Item ──
  items: [{
    productId: ObjectId,
    product: { name, sku },
    satuan: String,
    quantityReturned: Number,  // Min 1
    batchNumber: String,       // Max 50. Auto-fill dari delivery
    expiryDate: Date,          // Auto-fill dari delivery
    condition: String,         // Enum ITEM_CONDITION
    returnReason: String,      // Max 500
    disposition: String,       // Enum DISPOSITION (diisi sebelum completion)
    notes: String,
  }],

  // ── Financials ──
  creditMemoId: ObjectId,      // Ref → Memo (auto-created)
  totalReturnValue: Number,    // Dihitung otomatis

  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

---

## Enum & Konstanta

### Return Type (`RETURN_TYPE`)

| Value | Deskripsi |
|-------|-----------|
| `customer_return` | Retur dari customer |
| `supplier_return` | Retur ke supplier |

### Status Return (`RETURN_STATUS`)

| Value | Deskripsi |
|-------|-----------|
| `draft` | Retur baru dibuat |
| `pending_review` | Menunggu review |
| `approved` | Disetujui |
| `picking` | Pengambilan barang |
| `in_transit` | Dalam pengiriman |
| `received` | Barang diterima |
| `inspected` | Sudah diinspeksi |
| `completed` | Selesai (disposisi dieksekusi) |
| `rejected` | Ditolak |
| `cancelled` | Dibatalkan |

### Kondisi Item (`ITEM_CONDITION`)

| Value | Deskripsi |
|-------|-----------|
| `damaged` | Rusak |
| `expired` | Kadaluarsa |
| `wrong_item` | Barang salah |
| `wrong_qty` | Jumlah salah |
| `quality_issue` | Masalah kualitas |
| `good` | Kondisi baik |

### Disposisi (`DISPOSITION`)

| Value | Deskripsi | Aksi |
|-------|-----------|------|
| `restock` | Masukkan kembali ke stok | Add qty ke batch, mutasi RETURN |
| `destroy` | Musnahkan | Reduce qty, mutasi DISPOSAL |
| `return_to_supplier` | Kembalikan ke supplier | — |
| `quarantine` | Karantina | — |

---

## Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/returns` | All 6 roles | Daftar retur (paginated) |
| GET | `/returns/stats` | All 6 roles | Statistik retur |
| GET | `/returns/available-deliveries` | SA, Admin, Gudang, Sales | Delivery yang bisa di-retur |
| GET | `/returns/:id` | All 6 roles | Detail retur |
| POST | `/returns` | SA, Admin, Gudang, Sales | Buat retur baru |
| PUT | `/returns/:id` | SA, Admin, Gudang, Sales | Update retur (draft only) |
| DELETE | `/returns/:id` | SA, Admin | Hapus retur (draft/cancelled) |
| PATCH | `/returns/:id/status` | SA, Admin, Apoteker, Gudang, Sales | Ubah status |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 13.1 Get All Returns

```
GET /returns
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Max 100 |
| `search` | `string` | | Cari di return number (max 100) |
| `status` | `string` | | Filter status |
| `returnType` | `string` | | `customer_return` / `supplier_return` |
| `customerId` | `string` | | Filter customer |
| `supplierId` | `string` | | Filter supplier |
| `dateFrom` | `date` | | Tanggal mulai |
| `dateTo` | `date` | | Tanggal akhir |
| `sort` | `string` | `-createdAt` | Sorting |

---

### 13.2 Get Available Deliveries

Delivery yang tersedia untuk retur customer (status `delivered`/`partial_delivered`, ada item yang belum di-retur sepenuhnya).

```
GET /returns/available-deliveries
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `search` | `string` | Cari delivery number (max 100) |
| `limit` | `integer` | 1-100 |

---

### 13.3 Create Return

```
POST /returns
```

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `returnNumber` | `string` | ❌ | Max 50 |
| `returnType` | `string` | ✅ | `customer_return` / `supplier_return` |
| `deliveryId` | `string` | ❌ | Wajib untuk customer_return |
| `customerId` | `string` | ❌ | Untuk customer_return |
| `supplierId` | `string` | ❌ | Wajib untuk supplier_return |
| `returnDate` | `date` | ❌ | |
| `reason` | `string` | ❌ | Max 500 |
| `notes` | `string` | ❌ | Max 1000 |
| `items` | `array` | ✅ | Min 1 |
| `items[].productId` | `string` | ✅ | |
| `items[].satuan` | `string` | ❌ | |
| `items[].quantityReturned` | `number` | ✅ | Min 1 |
| `items[].batchNumber` | `string` | ❌ | Max 50 |
| `items[].expiryDate` | `date` | ❌ | |
| `items[].condition` | `string` | ❌ | Enum ITEM_CONDITION |
| `items[].returnReason` | `string` | ❌ | Max 500 |
| `items[].notes` | `string` | ❌ | Max 500 |

**Customer Return Logic:**
- Validates delivery status (`delivered`/`partial_delivered`)
- `quantityReturned ≤ returnable` (shipped - already returned)
- Auto-fill `batchNumber`, `expiryDate` dari delivery items

**Supplier Return Logic:**
- Validates supplier exists

---

### 13.4 Update Return

```
PUT /returns/:id
```

Hanya status **`draft`**. Includes disposition fields for items.

---

### 13.5 Change Return Status

```
PATCH /returns/:id/status
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `status` | `string` | ✅ |
| `notes` | `string` | ❌ |

---

## Status Flow

```
draft → pending_review → approved → picking → in_transit → received → inspected → completed
                      └→ rejected
       └→ cancelled (dari draft)
```

### Transisi Status

| Dari | Ke | Kondisi |
|------|----|---------|
| `draft` | `pending_review` | — |
| `draft` | `cancelled` | — |
| `pending_review` | `approved` | — |
| `pending_review` | `rejected` | — |
| `approved` | `picking` | — |
| `picking` | `in_transit` | — |
| `in_transit` | `received` | — |
| `received` | `inspected` | — |
| `inspected` | `completed` | ✅ **Semua item harus punya disposisi** |

---

## Integrasi

### Side Effects saat `COMPLETED`

#### 1. Validasi Disposisi

> **Semua item HARUS memiliki disposition** sebelum retur bisa diselesaikan. Jika ada item tanpa disposition, error:
> `"Semua item harus memiliki disposisi sebelum retur diselesaikan. X item belum memiliki disposisi."`

#### 2. Eksekusi Disposisi

| Disposition | Aksi Inventory | Aksi Mutasi |
|-------------|---------------|-------------|
| `restock` | Add qty ke batch existing (atau buat batch baru jika belum ada) | Mutasi type `return` |
| `destroy` | Reduce qty dari batch, status → `disposed` jika habis | Mutasi type `disposal` |
| `return_to_supplier` | — | — |
| `quarantine` | — | — |

#### 3. Auto Credit Memo (Customer Return Only)

- Otomatis membuat **credit memo** untuk customer return
- Nilai per item = `quantityReturned × effectiveUnitPrice`
- **effectiveUnitPrice** dihitung dari invoice: `subtotal / quantity` (bukan `unitPrice - discount`, karena discount sudah termasuk di subtotal)
- Memo otomatis di-approve dan di-post ke GL

#### 4. Auto COGS Reversal (Customer Return Only, Restocked Items Only)

- Otomatis membuat jurnal pembalikan HPP untuk item yang di-restock
- **DR Persediaan (1300)**, **CR HPP (5100)**
- Nilai berdasarkan `batch.unitPrice` (harga beli dari PO)
- Jika batch tidak ditemukan, gunakan rata-rata harga batch aktif
- Source: `JOURNAL_SOURCE.RETURN`

---

## Validasi & Business Rules

1. **Disposition wajib sebelum completion** — semua item harus memiliki disposition (`restock`/`destroy`/`return_to_supplier`/`quarantine`)
2. **Returnable quantity** — untuk customer return, `quantityReturned ≤ (shipped - already returned)`
3. **Credit memo effective unit price** — menggunakan `subtotal / quantity` dari invoice (sudah termasuk discount), bukan `unitPrice - discount`
4. **COGS reversal hanya untuk restock** — hanya item dengan disposition `restock` yang mendapat pembalikan HPP
5. **Batch auto-create** — jika batch untuk restock tidak ditemukan, buat batch baru
6. **Draft only edit** — update/delete hanya untuk status draft/cancelled
7. **Auto-fill from delivery** — batch number dan expiry date otomatis diisi dari delivery items
