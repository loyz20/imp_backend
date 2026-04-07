# API Contract — Modul Supplier (Data Pemasok)

**Modul:** Supplier Management
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/suppliers`

---

## Daftar Isi

- [Data Model](#data-model)
- [Enum & Konstanta](#enum--konstanta)
- [Endpoints](#endpoints)
- [Validasi & Business Rules](#validasi--business-rules)

---

## Data Model

### Supplier Schema

```javascript
{
  _id: ObjectId,
  name: String,              // Wajib. 2-200 karakter, unik (case-insensitive)
  code: String,              // Max 50, unik
  type: String,              // Enum SUPPLIER_TYPE
  contactPerson: String,     // Max 200
  phone: String,             // Format Indonesia (max 30)
  email: String,             // Format email valid
  website: String,           // Format URL

  address: {
    street: String,          // Max 500
    city: String,            // Max 100
    province: String,        // Max 100
    postalCode: String,      // Max 10
    country: String,         // Max 100, default: "Indonesia"
  },

  // ── Izin PBF ──
  pbfLicense: {
    number: String,
    issuedDate: Date,
    expiryDate: Date,
    document: String,        // Path file
  },

  // ── Sertifikat CDOB ──
  cdobCertificate: {
    number: String,
    issuedDate: Date,
    expiryDate: Date,
    document: String,
  },

  paymentTermDays: Number,   // 0-365, default: 30
  bankAccount: {
    bankName: String,
    accountNumber: String,
    accountName: String,
  },
  npwp: String,              // Max 30
  notes: String,             // Max 1000
  isActive: Boolean,         // Default: true

  createdBy: ObjectId,
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date,
}
```

---

## Enum & Konstanta

### Tipe Supplier (`SUPPLIER_TYPE`)

| Value | Label |
|-------|-------|
| `pbf` | Pedagang Besar Farmasi |
| `industri` | Industri Farmasi |
| `importir` | Importir |
| `distributor_alkes` | Distributor Alat Kesehatan |
| `lainnya` | Lainnya |

---

## Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/suppliers` | SA, Admin, Apoteker, Gudang, Keuangan, Sales | Daftar supplier (paginated) |
| GET | `/suppliers/stats` | SA, Admin, Apoteker, Gudang, Keuangan, Sales | Statistik supplier |
| GET | `/suppliers/:id` | SA, Admin, Apoteker, Gudang, Keuangan, Sales | Detail supplier |
| POST | `/suppliers` | SA, Admin, Apoteker | Buat supplier baru |
| PUT | `/suppliers/:id` | SA, Admin, Apoteker | Update supplier |
| DELETE | `/suppliers/:id` | SA, Admin | Hapus supplier |
| PATCH | `/suppliers/:id/status` | SA, Admin, Apoteker | Aktifkan/nonaktifkan |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 7.1 Get All Suppliers

```
GET /suppliers
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Jumlah per halaman (max 100) |
| `search` | `string` | | Cari di `name`, `code` (max 200) |
| `type` | `string` | | Filter tipe supplier |
| `city` | `string` | | Filter kota (max 100) |
| `isActive` | `string` | | `true` / `false` |
| `sort` | `string` | `-createdAt` | Sorting (max 50) |

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "660a...",
      "name": "PT Kimia Farma Tbk",
      "code": "SUP-001",
      "type": "pbf",
      "contactPerson": "Budi Santoso",
      "phone": "021-12345678",
      "email": "order@kimiafarma.co.id",
      "address": { "city": "Jakarta", "province": "DKI Jakarta" },
      "pbfLicense": { "number": "PBF-123", "expiryDate": "2028-12-31" },
      "paymentTermDays": 30,
      "isActive": true
    }
  ],
  "meta": { "pagination": { ... } }
}
```

---

### 7.2 Get Supplier Stats

```
GET /suppliers/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "total": 50,
    "active": 45,
    "inactive": 5,
    "byType": { "pbf": 20, "industri": 15, "importir": 5, "distributor_alkes": 8, "lainnya": 2 },
    "expiredLicenses": 2,
    "nearExpiryLicenses": 3,
    "topCities": [{ "city": "Jakarta", "count": 15 }]
  }
}
```

---

### 7.3 Get Supplier by ID

```
GET /suppliers/:id
```

**Response `200 OK`:** Full supplier object with all fields.

---

### 7.4 Create Supplier

```
POST /suppliers
```

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | `string` | ✅ | 2-200 karakter, unik |
| `code` | `string` | ❌ | Max 50, unik |
| `type` | `string` | ❌ | Enum `SUPPLIER_TYPE` |
| `contactPerson` | `string` | ❌ | Max 200 |
| `phone` | `string` | ❌ | Format Indonesia (max 30) |
| `email` | `string` | ❌ | Format email valid |
| `website` | `string` | ❌ | Format URL |
| `address` | `object` | ❌ | Sub-fields: street, city, province, postalCode, country |
| `pbfLicense` | `object` | ❌ | number, issuedDate, expiryDate, document |
| `cdobCertificate` | `object` | ❌ | number, issuedDate, expiryDate, document |
| `paymentTermDays` | `number` | ❌ | 0-365 |
| `bankAccount` | `object` | ❌ | bankName, accountNumber, accountName |
| `npwp` | `string` | ❌ | Max 30 |
| `notes` | `string` | ❌ | Max 1000 |
| `isActive` | `boolean` | ❌ | Default: true |

**Response `201 Created`**

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `409` | Nama atau code sudah ada |
| `422` | Validasi gagal |

---

### 7.5 Update Supplier

```
PUT /suppliers/:id
```

Semua field opsional. Hanya field yang dikirim yang diupdate.

---

### 7.6 Delete Supplier

```
DELETE /suppliers/:id
```

**Roles:** SA, Admin. Hard delete.

---

### 7.7 Change Supplier Status

```
PATCH /suppliers/:id/status
```

**Request Body:** `{ "isActive": false }`

---

## Validasi & Business Rules

1. **Nama unik** (case-insensitive) dan **code unik**
2. **Hard delete** — data supplier dihapus permanen
3. **PBF License tracking** — izin PBF dicek expired/near-expiry di stats
4. **Payment term** — default 30 hari, digunakan sebagai term pembayaran pada PO
5. Supplier harus **aktif** untuk digunakan di Purchase Order baru
