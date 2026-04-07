# API Contract — Sistem Informasi Pedagang Besar Farmasi (PBF)

**Base URL:** `http://localhost:5000/api/v1`
**Swagger UI:** `http://localhost:5000/api-docs` (development only)

---

## Daftar Isi

- [Informasi Umum](#informasi-umum)
- [Authentication](#1-authentication)
- [User Management](#2-user-management-superadmin--admin-only)
- [App Settings](#3-app-settings-superadmin--admin-only)
- [App Settings — Sections](#4-app-settings--section-updates-superadmin--admin-only)
- [App Settings — Document Number](#5-app-settings--document-number-superadmin--admin-only)

### Dokumentasi Modul (File Terpisah)

| Modul | File | Deskripsi |
|-------|------|-----------|
| Product | [product-module.md](product-module.md) | Master data obat & alkes (BPOM/CDOB) |
| Supplier | [supplier-module.md](supplier-module.md) | Data supplier / PBF |
| Customer | [customer-module.md](customer-module.md) | Data pelanggan (apotek, RS, klinik) |
| Purchase Order | [purchase-order-module.md](purchase-order-module.md) | Surat Pesanan / PO ke supplier |
| Goods Receiving | [goods-receiving-module.md](goods-receiving-module.md) | Penerimaan barang dari supplier |
| Inventory | [inventory-module.md](inventory-module.md) | Stok, mutasi, opname, expired, stock card |
| Sales Order | [sales-order-module.md](sales-order-module.md) | Order penjualan + alur pengiriman (packed, delivered, partial_delivered, returned, canceled) |
| Return | [return-module.md](return-module.md) | Retur customer & supplier |
| Finance | [finance-module.md](finance-module.md) | COA, jurnal/ledger, cash and bank, AR/AP, laporan |
| Report | [report-module.md](report-module.md) | Laporan penjualan, pembelian, stok, keuangan, expired |
| Settings | [setting-module.md](setting-module.md) | Pengaturan aplikasi (detail) |

---

## Informasi Umum

### Response Format

Semua response menggunakan format konsisten:

**Success Response:**

```json
{
  "success": true,
  "message": "Success",
  "data": { ... },
  "meta": { ... }
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error message",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email"
    }
  ]
}
```

### Pagination Response

Endpoint yang menggunakan pagination mengembalikan `meta.pagination`:

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "pagination": {
      "totalDocs": 50,
      "totalPages": 5,
      "page": 1,
      "limit": 10,
      "hasNextPage": true,
      "hasPrevPage": false,
      "nextPage": 2,
      "prevPage": null
    }
  }
}
```

### Authentication

Request yang memerlukan autentikasi harus menyertakan header:

```
Authorization: Bearer <accessToken>
```

### Password Policy

- Minimal 8 karakter
- Harus mengandung minimal 1 huruf besar, 1 huruf kecil, dan 1 angka
- Pattern: `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)`

### User Roles

| Role | Value | Deskripsi |
|------|-------|-----------|
| Superadmin | `superadmin` | Akses penuh ke seluruh sistem |
| Admin | `admin` | Manajemen operasional harian |
| Apoteker | `apoteker` | Penanggung jawab farmasi / obat |
| Keuangan | `keuangan` | Pengelolaan keuangan & pembayaran |
| Gudang | `gudang` | Manajemen stok & gudang |
| Sales | `sales` | Penjualan & order |
| User | `user` | Pelanggan / user eksternal (default) |

### Phone Number Format

Format nomor telepon Indonesia: `+62xxx`, `62xxx`, atau `08xxx` (7-11 digit setelah prefix)

### HTTP Status Codes

| Code | Deskripsi |
|------|-----------|
| `200` | OK — Request berhasil |
| `201` | Created — Resource berhasil dibuat |
| `400` | Bad Request — Request tidak valid |
| `401` | Unauthorized — Token tidak valid atau expired |
| `403` | Forbidden — Tidak memiliki akses |
| `404` | Not Found — Resource tidak ditemukan |
| `409` | Conflict — Resource sudah ada (duplikat) |
| `422` | Unprocessable Entity — Validasi gagal |
| `429` | Too Many Requests — Rate limit exceeded |
| `500` | Internal Server Error |

### Rate Limiting

Public auth endpoint (register, login, forgot-password, reset-password) memiliki rate limit lebih ketat.

---

## 1. Authentication

### 1.1 Register

Mendaftarkan user baru.

```
POST /auth/register
```

**Rate Limited:** Ya

**Request Body:**

| Field | Type | Required | Validation | Contoh |
|-------|------|----------|------------|--------|
| `name` | `string` | ✅ | 2-100 karakter | `"John Doe"` |
| `email` | `string` | ✅ | Format email valid | `"john@example.com"` |
| `password` | `string` | ✅ | Min 8 char, uppercase + lowercase + angka | `"Password123"` |

**Request:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "Password123"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "message": "User registered successfully. Please verify your email.",
  "data": {
    "user": {
      "_id": "660a1b2c3d4e5f6789abcdef",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "isActive": true,
      "isEmailVerified": false,
      "createdAt": "2026-04-01T10:00:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `409` | Email sudah terdaftar |
| `422` | Validasi gagal |

---

### 1.2 Login

Login user dan mendapatkan access + refresh token.

```
POST /auth/login
```

**Rate Limited:** Ya

**Request Body:**

| Field | Type | Required | Contoh |
|-------|------|----------|--------|
| `email` | `string` | ✅ | `"john@example.com"` |
| `password` | `string` | ✅ | `"Password123"` |

**Request:**

```json
{
  "email": "john@example.com",
  "password": "Password123"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "660a1b2c3d4e5f6789abcdef",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "user",
      "isActive": true,
      "isEmailVerified": true,
      "lastLoginAt": "2026-04-01T10:30:00.000Z"
    },
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `401` | Email atau password salah |
| `403` | Akun terkunci (5x gagal login, lock 30 menit) |
| `403` | Akun dinonaktifkan |
| `422` | Validasi gagal |

---

### 1.3 Refresh Token

Memperbaharui access token menggunakan refresh token. Menggunakan **token rotation** — refresh token lama langsung invalid.

```
POST /auth/refresh-token
```

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `refreshToken` | `string` | ✅ |

**Request:**

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...(new)",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...(new)"
    }
  }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `401` | Refresh token tidak valid, expired, atau sudah digunakan (token reuse attack detection) |

---

### 1.4 Forgot Password

Request link reset password via email. **Anti email enumeration** — selalu mengembalikan response sukses.

```
POST /auth/forgot-password
```

**Rate Limited:** Ya

**Request Body:**

| Field | Type | Required | Contoh |
|-------|------|----------|--------|
| `email` | `string` | ✅ | `"john@example.com"` |

**Request:**

```json
{
  "email": "john@example.com"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent"
}
```

---

### 1.5 Reset Password

Reset password menggunakan token dari email.

```
POST /auth/reset-password/:token
```

**Rate Limited:** Ya

**Path Parameters:**

| Param | Type | Required | Deskripsi |
|-------|------|----------|-----------|
| `token` | `string` | ✅ | Token dari email reset password |

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `password` | `string` | ✅ | Min 8 char, uppercase + lowercase + angka |
| `confirmPassword` | `string` | ✅ | Harus sama dengan `password` |

**Request:**

```json
{
  "password": "NewPassword123",
  "confirmPassword": "NewPassword123"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Token tidak valid atau expired |
| `422` | Validasi gagal / password tidak cocok |

---

### 1.6 Verify Email

Verifikasi alamat email user.

```
GET /auth/verify-email/:token
```

**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `token` | `string` | ✅ |

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Token tidak valid atau expired |

---

### 1.7 Logout

Logout user dan invalidate refresh token.

```
POST /auth/logout
```

**Auth:** Bearer Token ✅

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 1.8 Get Current User (Me)

Mendapatkan profil user yang sedang login.

```
GET /auth/me
```

**Auth:** Bearer Token ✅

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "_id": "660a1b2c3d4e5f6789abcdef",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "08123456789",
    "role": "user",
    "avatar": null,
    "isActive": true,
    "isEmailVerified": true,
    "address": {
      "street": "Jl. Sudirman No. 1",
      "city": "Jakarta",
      "province": "DKI Jakarta",
      "postalCode": "10110",
      "country": "Indonesia"
    },
    "lastLoginAt": "2026-04-01T10:30:00.000Z",
    "createdAt": "2026-03-01T08:00:00.000Z",
    "updatedAt": "2026-04-01T10:30:00.000Z"
  }
}
```

---

### 1.9 Update Profile

Update profil user yang sedang login. Hanya field yang diizinkan: `name`, `phone`, `address`.

```
PUT /auth/update-profile
```

**Auth:** Bearer Token ✅

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | `string` | ❌ | 2-100 karakter |
| `phone` | `string` | ❌ | Format nomor Indonesia |
| `address` | `object` | ❌ | Lihat sub-field |
| `address.street` | `string` | ❌ | |
| `address.city` | `string` | ❌ | |
| `address.province` | `string` | ❌ | |
| `address.postalCode` | `string` | ❌ | |
| `address.country` | `string` | ❌ | |

**Request:**

```json
{
  "name": "John Updated",
  "phone": "08123456789",
  "address": {
    "street": "Jl. Sudirman No. 1",
    "city": "Jakarta",
    "province": "DKI Jakarta",
    "postalCode": "10110",
    "country": "Indonesia"
  }
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { ... }
}
```

---

### 1.10 Change Password

Ganti password user yang sedang login. Token baru akan di-issue.

```
PUT /auth/change-password
```

**Auth:** Bearer Token ✅

**Request Body:**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `currentPassword` | `string` | ✅ | |
| `newPassword` | `string` | ✅ | Min 8 char, uppercase + lowercase + angka |
| `confirmPassword` | `string` | ✅ | Harus sama dengan `newPassword` |

**Request:**

```json
{
  "currentPassword": "Password123",
  "newPassword": "NewPassword456",
  "confirmPassword": "NewPassword456"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Password changed successfully",
  "data": {
    "tokens": {
      "accessToken": "eyJhbGciOiJIUzI1NiIs...(new)",
      "refreshToken": "eyJhbGciOiJIUzI1NiIs...(new)"
    }
  }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Current password salah |
| `422` | Validasi gagal / password tidak cocok |

---

### 1.11 Resend Email Verification

Kirim ulang link verifikasi email.

```
POST /auth/resend-verification
```

**Auth:** Bearer Token ✅

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Verification email sent"
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Email sudah terverifikasi |

---

## 2. User Management (Superadmin & Admin Only)

> Semua endpoint di section ini memerlukan **Bearer Token** + role **superadmin** atau **admin**.

### 2.1 Get All Users (Paginated)

Mendapatkan daftar semua user dengan pagination, search, filter, dan sort.

```
GET /users
```

**Query Parameters:**

| Param | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `page` | `integer` | `1` | Halaman |
| `limit` | `integer` | `10` | Jumlah per halaman (max 100) |
| `sort` | `string` | `-createdAt` | Field sorting. Prefix `-` untuk descending. Contoh: `name`, `-name`, `email`, `-email`, `createdAt`, `-createdAt` |
| `search` | `string` | | Cari di `name` dan `email` |
| `role` | `string` | | Filter: `superadmin`, `admin`, `apoteker`, `keuangan`, `gudang`, `sales`, `user` |
| `isActive` | `boolean` | | Filter: `true` atau `false` |

**Contoh Request:**

```
GET /users?page=1&limit=10&search=john&role=user&isActive=true&sort=-createdAt
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "660a1b2c3d4e5f6789abcdef",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "08123456789",
      "role": "user",
      "isActive": true,
      "isEmailVerified": true,
      "lastLoginAt": "2026-04-01T10:30:00.000Z",
      "createdAt": "2026-03-01T08:00:00.000Z"
    }
  ],
  "meta": {
    "pagination": {
      "totalDocs": 25,
      "totalPages": 3,
      "page": 1,
      "limit": 10,
      "hasNextPage": true,
      "hasPrevPage": false,
      "nextPage": 2,
      "prevPage": null
    }
  }
}
```

---

### 2.2 Get User Statistics

Mendapatkan statistik user untuk dashboard admin.

```
GET /users/stats
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "total": 150,
    "active": 130,
    "inactive": 20,
    "byRole": {
      "superadmin": 1,
      "admin": 2,
      "apoteker": 3,
      "keuangan": 2,
      "gudang": 4,
      "sales": 8,
      "user": 130
    }
  }
}
```

---

### 2.3 Get User by ID

Mendapatkan detail user berdasarkan ID.

```
GET /users/:id
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
    "_id": "660a1b2c3d4e5f6789abcdef",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "08123456789",
    "role": "user",
    "avatar": null,
    "isActive": true,
    "isEmailVerified": true,
    "address": {
      "street": "Jl. Sudirman No. 1",
      "city": "Jakarta",
      "province": "DKI Jakarta",
      "postalCode": "10110",
      "country": "Indonesia"
    },
    "lastLoginAt": "2026-04-01T10:30:00.000Z",
    "createdAt": "2026-03-01T08:00:00.000Z",
    "updatedAt": "2026-04-01T10:30:00.000Z"
  }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `404` | User tidak ditemukan |

---

### 2.4 Create User

Admin membuat user baru secara manual.

```
POST /users
```

**Request Body:**

| Field | Type | Required | Validation | Contoh |
|-------|------|----------|------------|--------|
| `name` | `string` | ✅ | 2-100 karakter | `"Jane Doe"` |
| `email` | `string` | ✅ | Format email valid | `"jane@example.com"` |
| `password` | `string` | ✅ | Min 8 char, uppercase + lowercase + angka | `"Password123"` |
| `phone` | `string` | ❌ | Format nomor Indonesia | `"08123456789"` |
| `role` | `string` | ❌ | `superadmin`, `admin`, `apoteker`, `keuangan`, `gudang`, `sales`, `user` (default: `user`) | `"apoteker"` |
| `address` | `object` | ❌ | | |
| `address.street` | `string` | ❌ | | `"Jl. Thamrin No. 5"` |
| `address.city` | `string` | ❌ | | `"Jakarta"` |
| `address.province` | `string` | ❌ | | `"DKI Jakarta"` |
| `address.postalCode` | `string` | ❌ | | `"10310"` |
| `address.country` | `string` | ❌ | | `"Indonesia"` |

**Request:**

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "Password123",
  "phone": "08123456789",
  "role": "apoteker",
  "address": {
    "street": "Jl. Thamrin No. 5",
    "city": "Jakarta",
    "province": "DKI Jakarta",
    "postalCode": "10310",
    "country": "Indonesia"
  }
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "message": "User created successfully",
  "data": { ... }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `409` | Email sudah terdaftar |
| `422` | Validasi gagal |

---

### 2.5 Update User

Admin mengupdate data user.

```
PUT /users/:id
```

**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `id` | `string` | ✅ |

**Request Body:**

| Field | Type | Required |
|-------|------|----------|
| `name` | `string` | ❌ |
| `email` | `string` | ❌ |
| `phone` | `string` | ❌ |
| `role` | `string` | ❌ |
| `isActive` | `boolean` | ❌ |
| `address` | `object` | ❌ |

**Request:**

```json
{
  "name": "Jane Updated",
  "email": "jane.new@example.com",
  "role": "keuangan"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "User updated successfully",
  "data": { ... }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `404` | User tidak ditemukan |
| `409` | Email sudah digunakan user lain |
| `422` | Validasi gagal |

---

### 2.6 Delete User (Soft Delete)

Menonaktifkan user (soft delete) dan invalidate refresh token. **Admin tidak bisa menghapus diri sendiri.**

```
DELETE /users/:id
```

**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `id` | `string` | ✅ |

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Tidak bisa menghapus akun sendiri |
| `404` | User tidak ditemukan |

---

### 2.7 Change User Role

Mengubah role user. **Tidak bisa mengubah role sendiri.**

```
PATCH /users/:id/role
```

**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `id` | `string` | ✅ |

**Request Body:**

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `role` | `string` | ✅ | `superadmin`, `admin`, `apoteker`, `keuangan`, `gudang`, `sales`, `user` |

**Request:**

```json
{
  "role": "apoteker"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "User role updated successfully",
  "data": { ... }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Tidak bisa mengubah role sendiri |
| `404` | User tidak ditemukan |

---

### 2.8 Change User Status

Mengaktifkan atau menonaktifkan user. **Admin tidak bisa mengubah status sendiri.**

```
PATCH /users/:id/status
```

**Path Parameters:**

| Param | Type | Required |
|-------|------|----------|
| `id` | `string` | ✅ |

**Request Body:**

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `isActive` | `boolean` | ✅ | `true`, `false` |

**Request:**

```json
{
  "isActive": false
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "User status updated successfully",
  "data": { ... }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `400` | Tidak bisa mengubah status sendiri |
| `404` | User tidak ditemukan |

---

## 3. App Settings (Superadmin & Admin Only)

> Semua endpoint di section ini memerlukan **Bearer Token** + role **superadmin** atau **admin**.
> Settings menggunakan **singleton pattern** — hanya ada 1 dokumen settings di database.

### 3.1 Get All Settings

Mendapatkan semua pengaturan aplikasi.

```
GET /settings
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "company": { ... },
    "invoice": { ... },
    "purchaseOrder": { ... },
    "deliveryOrder": { ... },
    "returnOrder": { ... },
    "inventory": { ... },
    "cdob": { ... },
    "medication": { ... },
    "customer": { ... },
    "payment": { ... },
    "notification": { ... },
    "reporting": { ... },
    "general": { ... }
  }
}
```

---

### 3.2 Get Settings Section

Mendapatkan pengaturan section tertentu saja.

```
GET /settings/:section
```

**Path Parameters:**

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `section` | `string` | ✅ | `company`, `invoice`, `purchaseOrder`, `deliveryOrder`, `returnOrder`, `inventory`, `cdob`, `medication`, `customer`, `payment`, `notification`, `reporting`, `general` |

**Contoh:**

```
GET /settings/company
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "name": "PT Farmasi Nusantara",
    "logo": "/uploads/logo.png",
    "officeAddress": { ... },
    "warehouseAddress": { ... },
    "phone": "021-12345678",
    "email": "info@farmasinusantara.co.id",
    "website": "https://farmasinusantara.co.id",
    "licenses": { ... },
    "responsiblePharmacist": { ... },
    "tax": { ... }
  }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `404` | Section tidak ditemukan |

---

### 3.3 Initialize Settings

Membuat dokumen settings dengan nilai default. Hanya berjalan jika belum ada settings (first-time setup).

```
POST /settings/initialize
```

**Response `201 Created`:**

```json
{
  "success": true,
  "message": "Settings initialized successfully",
  "data": { ... }
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `409` | Settings sudah ada |

---

### 3.4 Bulk Update Settings

Update banyak section sekaligus. Hanya field yang dikirim yang akan di-update.

```
PUT /settings
```

**Request Body:** Object berisi kombinasi section yang ingin diupdate.

**Request:**

```json
{
  "company": {
    "name": "PT Farmasi Nusantara"
  },
  "general": {
    "timezone": "Asia/Jakarta",
    "language": "id"
  }
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Settings updated successfully",
  "data": { ... }
}
```

---

### 3.5 Get License Warnings

Mendapatkan daftar izin yang sudah atau akan expired dalam 30 hari.

```
GET /settings/license-warnings
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "license": "PBF",
      "number": "PBF-123456",
      "expiryDate": "2026-04-15T00:00:00.000Z",
      "status": "expiring_soon",
      "daysUntilExpiry": 14
    },
    {
      "license": "CDOB",
      "number": "CDOB-789012",
      "expiryDate": "2026-03-20T00:00:00.000Z",
      "status": "expired",
      "daysUntilExpiry": -12
    },
    {
      "license": "SIPA",
      "number": "SIPA-345678",
      "expiryDate": "2026-04-28T00:00:00.000Z",
      "status": "expiring_soon",
      "daysUntilExpiry": 27
    }
  ]
}
```

---

### 3.6 Test SMTP Connection

Mengirim email percobaan untuk memastikan konfigurasi SMTP benar.

```
POST /settings/test-smtp
```

**Request Body:**

| Field | Type | Required | Deskripsi |
|-------|------|----------|-----------|
| `testEmail` | `string` | ❌ | Email tujuan test (default: SMTP fromEmail) |

**Request:**

```json
{
  "testEmail": "admin@example.com"
}
```

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Test email sent successfully"
}
```

**Error Responses:**

| Code | Kondisi |
|------|---------|
| `500` | Koneksi SMTP gagal |

---

## 4. App Settings — Section Updates (Superadmin & Admin Only)

> Semua endpoint section update menggunakan method `PUT` dan memerlukan **Bearer Token** + role **superadmin** atau **admin**.
> Hanya field yang dikirim yang akan di-update, field lain tidak ter-overwrite.

### 4.1 Update Company Information

```
PUT /settings/company
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `name` | `string` | Nama perusahaan |
| `logo` | `string` | Path logo |
| `officeAddress` | `object` | Alamat kantor (`street`, `city`, `province`, `postalCode`, `country`) |
| `warehouseAddress` | `object` | Alamat gudang |
| `phone` | `string` | Telepon |
| `email` | `string` | Email perusahaan |
| `website` | `string` | Website |

**Request:**

```json
{
  "name": "PT Farmasi Nusantara",
  "phone": "021-12345678",
  "email": "info@farmasinusantara.co.id",
  "officeAddress": {
    "street": "Jl. Industri No. 10",
    "city": "Jakarta",
    "province": "DKI Jakarta",
    "postalCode": "12345",
    "country": "Indonesia"
  }
}
```

---

### 4.2 Update Licenses

```
PUT /settings/licenses
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `pbf` | `License` | Izin PBF |
| `siup` | `License` | SIUP |
| `tdp` | `License` | TDP |
| `nib` | `object` | NIB (`number`) |
| `cdob` | `License` | Sertifikat CDOB |

**License Object:**

```json
{
  "number": "PBF-123456789",
  "issuedDate": "2024-01-15",
  "expiryDate": "2029-01-15",
  "document": "/uploads/licenses/pbf.pdf"
}
```

**Request:**

```json
{
  "pbf": {
    "number": "PBF-123456789",
    "issuedDate": "2024-01-15",
    "expiryDate": "2029-01-15",
    "document": "/uploads/licenses/pbf.pdf"
  },
  "cdob": {
    "number": "CDOB-987654321",
    "issuedDate": "2025-06-01",
    "expiryDate": "2030-06-01"
  }
}
```

---

### 4.3 Update Responsible Pharmacist

```
PUT /settings/pharmacist
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `name` | `string` | Nama apoteker |
| `sipaNumber` | `string` | Nomor SIPA |
| `straNumber` | `string` | Nomor STRA |
| `sipaExpiry` | `date` | Tanggal expired SIPA |
| `straExpiry` | `date` | Tanggal expired STRA |
| `phone` | `string` | Telepon |
| `email` | `string` | Email |

**Request:**

```json
{
  "name": "Dr. Apt. Budi Santoso, S.Farm",
  "sipaNumber": "SIPA-1234567890",
  "straNumber": "STRA-0987654321",
  "sipaExpiry": "2028-12-31",
  "straExpiry": "2027-06-30",
  "phone": "08129876543",
  "email": "apt.budi@farmasinusantara.co.id"
}
```

---

### 4.4 Update Tax Settings

```
PUT /settings/tax
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `npwp` | `string` | Nomor NPWP |
| `isPkp` | `boolean` | Status Pengusaha Kena Pajak |
| `defaultPpnRate` | `number` | Tarif PPN default (%) |

**Request:**

```json
{
  "npwp": "01.234.567.8-901.234",
  "isPkp": true,
  "defaultPpnRate": 11
}
```

---

### 4.5 Update Invoice Settings

```
PUT /settings/invoice
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `prefix` | `string` | Prefix nomor invoice |
| `autoNumber` | `boolean` | Auto-generate nomor |
| `defaultPaymentTermDays` | `integer` | Jatuh tempo default (hari) |

**Request:**

```json
{
  "prefix": "INV",
  "autoNumber": true,
  "defaultPaymentTermDays": 30
}
```

---

### 4.6 Update Purchase Order Settings

```
PUT /settings/purchase-order
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `prefix` | `string` | Prefix nomor SP |
| `autoNumber` | `boolean` | Auto-generate nomor |
| `requireApproval` | `boolean` | Butuh approval |
| `approvalLevels` | `integer` | Jumlah level approval |

**Request:**

```json
{
  "prefix": "SP",
  "autoNumber": true,
  "requireApproval": true,
  "approvalLevels": 2
}
```

---

### 4.7 Update Delivery Order Settings

```
PUT /settings/delivery-order
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `prefix` | `string` | Prefix nomor surat jalan |
| `autoNumber` | `boolean` | Auto-generate nomor |

**Request:**

```json
{
  "prefix": "SJ",
  "autoNumber": true
}
```

---

### 4.8 Update Return Order Settings

```
PUT /settings/return-order
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `prefix` | `string` | Prefix nomor retur |
| `autoNumber` | `boolean` | Auto-generate nomor |
| `maxReturnDays` | `integer` | Batas hari untuk retur |

**Request:**

```json
{
  "prefix": "RET",
  "autoNumber": true,
  "maxReturnDays": 14
}
```

---

### 4.9 Update Inventory Settings

```
PUT /settings/inventory
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `enableBatchTracking` | `boolean` | Aktifkan tracking batch |
| `enableExpiryDate` | `boolean` | Aktifkan tracking expired |
| `useFEFO` | `boolean` | First Expired First Out |
| `lowStockThreshold` | `integer` | Threshold stok rendah |
| `temperatureZones` | `array` | Zona suhu penyimpanan |

**Temperature Zone Object:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `name` | `string` | Nama zona (Ruang Sejuk, CRT, dll) |
| `minTemp` | `number` | Suhu minimum (°C) |
| `maxTemp` | `number` | Suhu maksimum (°C) |

**Request:**

```json
{
  "enableBatchTracking": true,
  "enableExpiryDate": true,
  "useFEFO": true,
  "lowStockThreshold": 10,
  "temperatureZones": [
    { "name": "CRT (Controlled Room Temperature)", "minTemp": 15, "maxTemp": 25 },
    { "name": "Ruang Sejuk", "minTemp": 8, "maxTemp": 15 },
    { "name": "Lemari Es", "minTemp": 2, "maxTemp": 8 }
  ]
}
```

---

### 4.10 Update CDOB Settings

```
PUT /settings/cdob
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `enableTemperatureLog` | `boolean` | Aktifkan log suhu |
| `enableRecallManagement` | `boolean` | Aktifkan manajemen recall |
| `enableComplaintTracking` | `boolean` | Aktifkan tracking keluhan |
| `selfInspectionSchedule` | `string` | Jadwal inspeksi diri: `monthly`, `quarterly`, `biannually`, `annually` |
| `documentRetentionYears` | `integer` | Lama penyimpanan dokumen (tahun) |

**Request:**

```json
{
  "enableTemperatureLog": true,
  "enableRecallManagement": true,
  "enableComplaintTracking": true,
  "selfInspectionSchedule": "quarterly",
  "documentRetentionYears": 5
}
```

---

### 4.11 Update Medication Settings

```
PUT /settings/medication
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `trackNarcotic` | `boolean` | Tracking Narkotika |
| `trackPsychotropic` | `boolean` | Tracking Psikotropika |
| `trackPrecursor` | `boolean` | Tracking Prekursor |
| `trackOtc` | `boolean` | Tracking OKT |
| `requireSpecialSP` | `boolean` | Wajib SP Khusus untuk NK/PS |

**Request:**

```json
{
  "trackNarcotic": true,
  "trackPsychotropic": true,
  "trackPrecursor": true,
  "trackOtc": false,
  "requireSpecialSP": true
}
```

---

### 4.12 Update Customer Settings

```
PUT /settings/customer
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `requireSIA` | `boolean` | Wajib validasi SIA |
| `customerTypes` | `array` | Tipe customer yang diizinkan |
| `defaultCreditLimit` | `number` | Credit limit default |

**Allowed Customer Types:** `apotek`, `rumah_sakit`, `klinik`, `puskesmas`, `toko_obat`, `pbf_lain`

**Request:**

```json
{
  "requireSIA": true,
  "customerTypes": ["apotek", "rumah_sakit", "klinik", "puskesmas"],
  "defaultCreditLimit": 50000000
}
```

---

### 4.13 Update Payment Settings

```
PUT /settings/payment
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `bankAccounts` | `array` | Daftar rekening bank |
| `allowPartialPayment` | `boolean` | Izinkan pembayaran parsial |
| `allowCreditPayment` | `boolean` | Izinkan pembayaran kredit |
| `latePenaltyRate` | `number` | Denda keterlambatan (%/bulan) |

**Bank Account Object:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `bankName` | `string` | Nama bank |
| `accountNumber` | `string` | Nomor rekening |
| `accountName` | `string` | Nama pemilik rekening |

**Request:**

```json
{
  "bankAccounts": [
    {
      "bankName": "BCA",
      "accountNumber": "1234567890",
      "accountName": "PT Farmasi Nusantara"
    },
    {
      "bankName": "Mandiri",
      "accountNumber": "0987654321",
      "accountName": "PT Farmasi Nusantara"
    }
  ],
  "allowPartialPayment": true,
  "allowCreditPayment": true,
  "latePenaltyRate": 2
}
```

---

### 4.14 Update Notification Settings

```
PUT /settings/notification
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `enableEmail` | `boolean` | Aktifkan notifikasi email |
| `enableSMS` | `boolean` | Aktifkan notifikasi SMS |
| `enableWhatsApp` | `boolean` | Aktifkan notifikasi WhatsApp |
| `alerts` | `object` | Alert config |
| `alerts.lowStock` | `boolean` | Alert stok rendah |
| `alerts.nearExpiry` | `boolean` | Alert mendekati expired |
| `alerts.overduePayment` | `boolean` | Alert pembayaran overdue |
| `alerts.recall` | `boolean` | Alert recall obat |
| `alerts.temperatureAlert` | `boolean` | Alert suhu |
| `smtp` | `object` | Konfigurasi SMTP |
| `smtp.host` | `string` | SMTP host |
| `smtp.port` | `integer` | SMTP port |
| `smtp.user` | `string` | SMTP user |
| `smtp.password` | `string` | SMTP password |
| `smtp.fromName` | `string` | Nama pengirim |
| `smtp.fromEmail` | `string` | Email pengirim |

**Request:**

```json
{
  "enableEmail": true,
  "enableSMS": false,
  "enableWhatsApp": true,
  "alerts": {
    "lowStock": true,
    "nearExpiry": true,
    "overduePayment": true,
    "recall": true,
    "temperatureAlert": true
  },
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "user": "noreply@farmasinusantara.co.id",
    "password": "app-password-here",
    "fromName": "PT Farmasi Nusantara",
    "fromEmail": "noreply@farmasinusantara.co.id"
  }
}
```

---

### 4.15 Update Reporting Settings

```
PUT /settings/reporting
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `bpom` | `object` | Konfigurasi e-Report BPOM |
| `bpom.enableEReport` | `boolean` | Aktifkan e-Report |
| `bpom.apiKey` | `string` | API key BPOM |
| `fiscalYearStart` | `integer` | Bulan awal tahun fiskal (1-12) |
| `currency` | `string` | Mata uang |

**Request:**

```json
{
  "bpom": {
    "enableEReport": true,
    "apiKey": "bpom-api-key-here"
  },
  "fiscalYearStart": 1,
  "currency": "IDR"
}
```

---

### 4.16 Update General Settings

```
PUT /settings/general
```

**Request Body:**

| Field | Type | Deskripsi |
|-------|------|-----------|
| `timezone` | `string` | Timezone |
| `dateFormat` | `string` | Format tanggal |
| `language` | `string` | Bahasa: `id` atau `en` |
| `maintenanceMode` | `boolean` | Mode maintenance |
| `sessionTimeoutMinutes` | `integer` | Session timeout (menit) |

**Request:**

```json
{
  "timezone": "Asia/Jakarta",
  "dateFormat": "DD/MM/YYYY",
  "language": "id",
  "maintenanceMode": false,
  "sessionTimeoutMinutes": 60
}
```

---

## 5. App Settings — Document Number (Superadmin & Admin Only)

### 5.1 Generate Document Number

Generate nomor dokumen auto-increment. Format: `{PREFIX}/{YYYYMM}/{XXXXXX}`

```
POST /settings/doc-number/:type
```

**Path Parameters:**

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `type` | `string` | ✅ | `invoice`, `purchaseOrder`, `deliveryOrder`, `returnOrder`, `salesOrder`, `return`, `payment`, `memo`, `journal` |

**Contoh:**

```
POST /settings/doc-number/invoice
```

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "documentNumber": "INV/202604/000001",
    "type": "invoice",
    "counter": 1
  }
}
```

**Contoh nomor yang digenerate:**

| Type | Contoh |
|------|--------|
| `invoice` | `INV/202604/000001` |
| `purchaseOrder` | `SP/202604/000001` |
| `deliveryOrder` | `SJ/202604/000001` |
| `returnOrder` | `RET/202604/000001` |
| `salesOrder` | `SO/202604/000001` |
| `return` | `RTN/202604/000001` |
| `payment` | `PAY/202604/000001` |
| `memo` | `MEM/202604/000001` |
| `journal` | `JRN/202604/000001` |

---

### 5.2 Reset Document Number Counter

Reset counter nomor dokumen kembali ke 0. **Perhatian: aksi ini tidak bisa di-undo.**

```
PUT /settings/doc-number/:type/reset
```

**Path Parameters:**

| Param | Type | Required | Values |
|-------|------|----------|--------|
| `type` | `string` | ✅ | `invoice`, `purchaseOrder`, `deliveryOrder`, `returnOrder`, `salesOrder`, `return`, `payment`, `memo`, `journal` |

**Response `200 OK`:**

```json
{
  "success": true,
  "message": "Document number counter reset successfully"
}
```
