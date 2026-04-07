# API Contract — Modul Purchase Order (Surat Pesanan)

**Modul:** Purchase Order Management (Transaksi Pembelian / Surat Pesanan)
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/purchase-orders`

> Mengikuti standar regulasi BPOM dan CDOB. PO disebut juga **Surat Pesanan (SP)**.

---

## Daftar Isi

- [Data Model](#data-model)
- [Enum & Konstanta](#enum--konstanta)
- [Endpoints](#endpoints)
- [Status Flow](#status-flow-state-machine)
- [Validasi & Business Rules](#validasi--business-rules)

---

## Data Model

### Purchase Order Schema

```javascript
{
  _id: ObjectId,

  // ── Identitas PO ──
  poNumber: String,            // Unik. Auto-generate (format: SP/YYYYMM/XXXXXX)
  status: String,              // Enum PO_STATUS

  // ── Supplier ──
  supplierId: ObjectId,        // Wajib. Ref → Supplier
  supplier: {                  // Populated dari Supplier collection
    _id, name, code, phone, email, address, pbfLicense
  },

  // ── Tanggal ──
  orderDate: Date,             // Wajib
  expectedDeliveryDate: Date,  // Opsional
  approvedAt: Date,            // Otomatis saat approved
  sentAt: Date,                // Otomatis saat sent

  // ── Pembayaran ──
  paymentTermDays: Number,     // Default: 30 (0-365)

  // ── Item Lines ──
  items: [{
    productId: ObjectId,       // Ref → Product
    product: { name, sku },    // Populated
    satuan: String,
    quantity: Number,          // 1-999999
    unitPrice: Number,         // 0-999999999
    discount: Number,          // 0-100 (%)
    subtotal: Number,          // Dihitung: quantity × unitPrice × (1 - discount/100)
    receivedQty: Number,       // Diupdate saat Goods Receiving
    notes: String,
  }],

  // ── Kalkulasi (dihitung otomatis) ──
  subtotal: Number,            // Jumlah subtotal seluruh item
  ppnAmount: Number,           // PPN dihitung dari AppSetting (company.tax.defaultPpnRate)
  totalAmount: Number,         // subtotal + ppnAmount

  // ── Pembayaran (tracking) ──
  paidAmount: Number,          // Default: 0. Diupdate saat payment verified
  remainingAmount: Number,     // totalAmount - paidAmount

  // ── Catatan ──
  notes: String,               // Max 1000

  // ── Approval ──
  approvalHistory: [{
    user: ObjectId,
    action: String,            // 'approved' | 'rejected'
    notes: String,
    date: Date,
    level: Number,
  }],

  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

> **Catatan PPN:** Tarif PPN **tidak hardcoded 11%**. Dihitung otomatis dari `AppSetting.company.tax`:
> - Jika `isPkp = true`: menggunakan `defaultPpnRate` (misal 11%)
> - Jika `isPkp = false`: PPN = 0
> - Kalkulasi dilakukan otomatis via pre-save hook pada model PurchaseOrder

---

## Enum & Konstanta

### Status PO (`PO_STATUS`)

| Value | Label | Deskripsi |
|-------|-------|-----------|
| `draft` | Draft | PO masih dalam penyusunan |
| `pending_approval` | Menunggu Approval | PO sudah diajukan, menunggu persetujuan |
| `approved` | Disetujui | PO sudah diapprove |
| `sent` | Dikirim ke Supplier | PO sudah dikirim ke supplier |
| `partial_received` | Diterima Sebagian | Sebagian barang sudah diterima |
| `received` | Diterima Lengkap | Semua barang sudah diterima |
| `cancelled` | Dibatalkan | PO dibatalkan |

---

## Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/purchase-orders` | All 6 roles | Daftar PO (paginated) |
| GET | `/purchase-orders/stats` | All 6 roles | Statistik PO |
| GET | `/purchase-orders/:id` | All 6 roles | Detail PO |
| POST | `/purchase-orders` | SA, Admin, Apoteker | Buat PO baru |
| PUT | `/purchase-orders/:id` | SA, Admin, Apoteker | Update PO (draft only) |
| DELETE | `/purchase-orders/:id` | SA, Admin | Hapus PO (draft/cancelled) |
| PATCH | `/purchase-orders/:id/status` | SA, Admin, Apoteker | Ubah status PO |
| PATCH | `/purchase-orders/:id/approve` | SA, Admin | Approve PO |
| PATCH | `/purchase-orders/:id/reject` | SA, Admin | Reject PO |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 8.1 Get All Purchase Orders

```
GET /purchase-orders
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Max 100 |
| `search` | `string` | | Cari di `poNumber` (max 200) |
| `status` | `string` | | Filter status (comma-separated, misal: `draft,sent`) |
| `supplierId` | `string` | | Filter supplier |
| `dateFrom` | `date` | | Filter tanggal mulai (ISO format) |
| `dateTo` | `date` | | Filter tanggal akhir |
| `sort` | `string` | `-createdAt` | Sorting (max 50) |

---

### 8.2 Get PO Stats

```
GET /purchase-orders/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "total": 200,
    "byStatus": { "draft": 10, "pending_approval": 5, "approved": 8, "sent": 20, "partial_received": 15, "received": 130, "cancelled": 12 },
    "totalValue": 5000000000,
    "totalValueThisMonth": 500000000,
    "avgOrderValue": 25000000,
    "topSuppliers": [{ "supplier": { "name": "PT Kimia Farma" }, "count": 50, "totalValue": 1500000000 }]
  }
}
```

---

### 8.3 Get PO by ID

```
GET /purchase-orders/:id
```

Returns full PO with populated supplier and product details.

---

### 8.4 Create Purchase Order

```
POST /purchase-orders
```

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `supplierId` | `string` | ✅ | Valid ObjectId, supplier must be active |
| `orderDate` | `date` | ✅ | ISO format |
| `expectedDeliveryDate` | `date` | ❌ | ISO format |
| `paymentTermDays` | `number` | ❌ | 0-365, default 30 |
| `notes` | `string` | ❌ | Max 1000 |
| `items` | `array` | ✅ | Min 1 item |
| `items[].productId` | `string` | ✅ | Product must be active |
| `items[].satuan` | `string` | ❌ | |
| `items[].quantity` | `number` | ✅ | 1-999999 |
| `items[].unitPrice` | `number` | ✅ | 0-999999999 |
| `items[].discount` | `number` | ❌ | 0-100 (%) |
| `items[].notes` | `string` | ❌ | Max 500 |

**Business Logic:**
- Validates supplier is active
- Validates all products are active, no duplicate products
- Auto-calculates `subtotal`, `ppnAmount`, `totalAmount` using PPN rate from AppSetting
- If `settings.purchaseOrder.requireApproval = true`: status → `draft`
- If `settings.purchaseOrder.requireApproval = false`: status → `approved` (auto-approve)

**Response `201 Created`**

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Supplier not active / product not active / duplicate products |
| `422` | Validasi gagal |

---

### 8.5 Update Purchase Order

```
PUT /purchase-orders/:id
```

Hanya bisa diupdate saat status **`draft`**. PPN dihitung ulang otomatis.

---

### 8.6 Delete Purchase Order

```
DELETE /purchase-orders/:id
```

Hanya bisa dihapus saat status **`draft`** atau **`cancelled`**.

---

### 8.7 Change PO Status

```
PATCH /purchase-orders/:id/status
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `status` | `string` | ✅ |
| `notes` | `string` | ❌ |

**Validasi:**
- Requires items untuk transisi `draft → pending_approval`
- Transisi `sent → cancelled`: cek tidak ada Goods Receiving terkait

---

### 8.8 Approve Purchase Order

```
PATCH /purchase-orders/:id/approve
```

**Roles:** SA, Admin

**Business Logic:**
- **Separation of duties** — creator tidak bisa meng-approve PO yang dia buat
- Adds entry to `approvalHistory`
- Status: `pending_approval → approved`

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `notes` | `string` | ❌ |

---

### 8.9 Reject Purchase Order

```
PATCH /purchase-orders/:id/reject
```

**Roles:** SA, Admin

Status kembali ke **`draft`** dengan catatan rejection di `approvalHistory`.

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `notes` | `string` | ✅ | 5-1000 karakter (alasan rejection wajib) |

---

## Status Flow (State Machine)

### Dengan Approval (`requireApproval = true`)

```
draft → pending_approval → approved → sent → partial_received → received
                                            └→ cancelled (dari sent jika belum ada GR)
         └→ cancelled (dari draft/pending_approval)
```

### Tanpa Approval (`requireApproval = false`)

```
draft → approved (auto) → sent → partial_received → received
                               └→ cancelled (dari sent jika belum ada GR)
```

### Transisi Status Lengkap

| Dari | Ke | Kondisi |
|------|----|---------|
| `draft` | `pending_approval` | Harus ada minimal 1 item |
| `draft` | `cancelled` | — |
| `pending_approval` | `approved` | Hanya melalui endpoint approve |
| `pending_approval` | `draft` | Hanya melalui endpoint reject |
| `pending_approval` | `cancelled` | — |
| `approved` | `sent` | — |
| `approved` | `cancelled` | — |
| `sent` | `partial_received` | Auto saat GR verify (sebagian qty) |
| `sent` | `received` | Auto saat GR verify (semua qty) |
| `sent` | `cancelled` | Tidak boleh ada GR terkait |

---

## Validasi & Business Rules

1. **PPN dari AppSetting** — tarif PPN diambil dari `settings.company.tax.defaultPpnRate` (bukan hardcoded). Jika bukan PKP (`isPkp = false`), PPN = 0
2. **paidAmount / remainingAmount** — tracking pembayaran PO. Diupdate saat payment verified di modul Finance
3. **Auto-calculate** — `subtotal`, `ppnAmount`, `totalAmount`, `remainingAmount` dihitung otomatis via pre-save hook
4. **Separation of duties** — pembuat PO tidak bisa meng-approve sendiri
5. **Supplier aktif** — PO hanya bisa dibuat ke supplier yang statusnya aktif
6. **No duplicate products** — satu PO tidak boleh memiliki item dengan productId yang sama
7. **Cancel constraint** — PO dengan status `sent` hanya bisa dicancel jika belum ada Goods Receiving terkait
