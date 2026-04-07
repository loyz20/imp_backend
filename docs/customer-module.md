# API Contract — Modul Customer (Data Pelanggan)

**Modul:** Customer Management
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/customers`

---

## Daftar Isi

- [Data Model](#data-model)
- [Enum & Konstanta](#enum--konstanta)
- [Endpoints](#endpoints)
- [Validasi & Business Rules](#validasi--business-rules)

---

## Data Model

### Customer Schema

```javascript
{
  _id: ObjectId,
  name: String,              // Wajib. 2-200 karakter, unik (case-insensitive)
  code: String,              // Max 50, unik
  type: String,              // Enum CUSTOMER_TYPE
  contactPerson: String,     // Max 200
  phone: String,             // Format Indonesia (max 30)
  email: String,             // Format email valid
  website: String,           // Format URL

  address: {
    street: String,          // Max 500
    city: String,            // Max 100
    province: String,        // Max 100
    postalCode: String,      // Max 10
    country: String,         // Max 100
  },

  // ── Izin SIA ──
  siaLicense: {
    number: String,
    issuedDate: Date,
    expiryDate: Date,
    document: String,
  },

  // ── Apoteker Penanggung Jawab ──
  pharmacist: {
    name: String,
    sipaNumber: String,
    phone: String,
  },

  paymentTermDays: Number,   // 0-365
  creditLimit: Number,       // 0-999999999999
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

### Tipe Customer (`CUSTOMER_TYPE`)

| Value | Label |
|-------|-------|
| `apotek` | Apotek |
| `rumah_sakit` | Rumah Sakit |
| `klinik` | Klinik |
| `puskesmas` | Puskesmas |
| `toko_obat` | Toko Obat |
| `pbf_lain` | PBF Lain |
| `pemerintah` | Pemerintah |

---

## Endpoints

| Method | Path | Roles | Deskripsi |
|--------|------|-------|-----------|
| GET | `/customers` | SA, Admin, Apoteker, Gudang, Keuangan, Sales | Daftar customer (paginated) |
| GET | `/customers/stats` | SA, Admin, Apoteker, Gudang, Keuangan, Sales | Statistik customer |
| GET | `/customers/:id` | SA, Admin, Apoteker, Gudang, Keuangan, Sales | Detail customer |
| POST | `/customers` | SA, Admin, Sales | Buat customer baru |
| PUT | `/customers/:id` | SA, Admin, Sales | Update customer |
| DELETE | `/customers/:id` | SA, Admin | Hapus customer |
| PATCH | `/customers/:id/status` | SA, Admin, Sales | Aktifkan/nonaktifkan |

> **Auth:** Semua endpoint memerlukan Bearer Token.

---

### 10.1 Get All Customers

```
GET /customers
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Max 100 |
| `search` | `string` | | Cari di `name`, `code` (max 200) |
| `type` | `string` | | Filter tipe customer |
| `city` | `string` | | Filter kota (max 100) |
| `isActive` | `string` | | `true` / `false` |
| `sort` | `string` | `-createdAt` | Sorting (max 50) |

---

### 10.2 Get Customer Stats

```
GET /customers/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "total": 100,
    "active": 90,
    "inactive": 10,
    "byType": { "apotek": 40, "rumah_sakit": 20, "klinik": 15, "puskesmas": 10, "toko_obat": 10, "pbf_lain": 5 },
    "expiredSIA": 3,
    "nearExpirySIA": 5,
    "topCities": [{ "city": "Jakarta", "count": 30 }]
  }
}
```

---

### 10.3 Get Customer by ID

```
GET /customers/:id
```

---

### 10.4 Create Customer

```
POST /customers
```

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | `string` | ✅ | 2-200, unik |
| `code` | `string` | ❌ | Max 50, unik |
| `type` | `string` | ❌ | Enum `CUSTOMER_TYPE` — validated against `settings.customer.customerTypes` |
| `contactPerson` | `string` | ❌ | Max 200 |
| `phone` | `string` | ❌ | Format Indonesia |
| `email` | `string` | ❌ | Format email |
| `address` | `object` | ❌ | street, city, province, postalCode, country |
| `siaLicense` | `object` | ❌ | number, issuedDate, expiryDate, document |
| `pharmacist` | `object` | ❌ | name, sipaNumber, phone |
| `paymentTermDays` | `number` | ❌ | 0-365 |
| `creditLimit` | `number` | ❌ | 0-999999999999. Default dari `settings.customer.defaultCreditLimit` |
| `bankAccount` | `object` | ❌ | bankName, accountNumber, accountName |
| `npwp` | `string` | ❌ | Max 30 |
| `notes` | `string` | ❌ | Max 1000 |

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `409` | Nama atau code duplikat |
| `422` | Validasi gagal / tipe customer tidak diizinkan di settings |

---

### 10.5–10.7 Update, Delete, Change Status

- **Update** (`PUT /customers/:id`): Semua field opsional
- **Delete** (`DELETE /customers/:id`): Hard delete. SA/Admin only
- **Status** (`PATCH /customers/:id/status`): `{ "isActive": true/false }`

---

## Validasi & Business Rules

1. **Nama unik** (case-insensitive) dan **code unik**
2. **Tipe customer** divalidasi terhadap `settings.customer.customerTypes`
3. **SIA wajib** jika `settings.customer.requireSIA` = true (untuk apotek, RS, klinik)
4. **Credit limit default** dari `settings.customer.defaultCreditLimit` jika tidak diisi
5. Customer harus **aktif** dan SIA **tidak expired** untuk digunakan di Sales Order baru
6. **Hard delete** — data dihapus permanen
