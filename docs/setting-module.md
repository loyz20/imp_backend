# API Contract — Modul Setting (Pengaturan Aplikasi)

**Modul:** Application Settings
**Base URL:** `http://localhost:5000/api/v1`
**Prefix:** `/settings`

> Modul pengaturan global aplikasi. Menggunakan **singleton pattern** — hanya 1 dokumen setting untuk seluruh sistem. Harus di-initialize terlebih dahulu sebelum digunakan.

---

## Daftar Isi

- [Endpoints](#endpoints)
- [1. Read](#1-read)
- [2. Initialize](#2-initialize)
- [3. Bulk Update](#3-bulk-update)
- [4. Section Updates](#4-section-updates)
- [5. Document Number Generator](#5-document-number-generator)
- [6. Utility](#6-utility)
- [Schema Sections](#schema-sections)
- [Business Rules](#business-rules)

---

## Endpoints

**Semua endpoint memerlukan:** `auth` + `authorize(SUPERADMIN, ADMIN)`
**Exception:** Reset doc number hanya `SUPERADMIN`

| Method | Path | Deskripsi |
|--------|------|-----------|
| GET | `/settings` | Ambil seluruh settings |
| GET | `/settings/license-warnings` | Cek lisensi mendekati expired |
| GET | `/settings/:section` | Ambil 1 section |
| POST | `/settings/initialize` | Initialize settings (sekali) |
| PUT | `/settings` | Update seluruh settings |
| PUT | `/settings/company` | Update data perusahaan |
| PUT | `/settings/licenses` | Update lisensi |
| PUT | `/settings/pharmacist` | Update apoteker penanggung jawab (legacy) |
| PUT | `/settings/pharmacist-obat` | Update apoteker PJ obat |
| PUT | `/settings/pharmacist-alkes` | Update apoteker PJ alkes |
| PUT | `/settings/tax` | Update pajak |
| PUT | `/settings/invoice` | Update konfigurasi invoice |
| PUT | `/settings/purchase-order` | Update konfigurasi PO |
| PUT | `/settings/delivery-order` | Update konfigurasi surat jalan |
| PUT | `/settings/return-order` | Update konfigurasi return |
| PUT | `/settings/inventory` | Update konfigurasi inventaris |
| PUT | `/settings/cdob` | Update konfigurasi CDOB |
| PUT | `/settings/medication` | Update konfigurasi obat |
| PUT | `/settings/customer` | Update konfigurasi customer |
| PUT | `/settings/payment` | Update konfigurasi pembayaran |
| PUT | `/settings/notification` | Update konfigurasi notifikasi |
| PUT | `/settings/reporting` | Update konfigurasi pelaporan |
| PUT | `/settings/general` | Update konfigurasi umum |
| POST | `/settings/doc-number/:type` | Generate nomor dokumen |
| PUT | `/settings/doc-number/:type/reset` | Reset counter (SA only) |
| POST | `/settings/test-smtp` | Test koneksi SMTP |

**Total: 26 endpoints**

---

## 1. Read

### 1.1 Get All Settings

```
GET /settings
```

Mengembalikan seluruh konfigurasi (tanpa `documentCounters`).

---

### 1.2 Get License Warnings

```
GET /settings/license-warnings
```

Mengembalikan daftar lisensi yang akan atau sudah expired (threshold: 30 hari).

**Response `200 OK`:**

```json
{
  "success": true,
  "data": [
    {
      "license": "PBF",
      "number": "PBF-1234",
      "expiryDate": "2026-02-15",
      "status": "expiring_soon",
      "daysUntilExpiry": 12
    },
    {
      "license": "CDOB Certificate",
      "number": "CDOB-5678",
      "expiryDate": "2025-12-01",
      "status": "expired",
      "daysUntilExpiry": -44
    }
  ]
}
```

**License yang dicek:** PBF, SIUP, TDP, CDOB, SIPA (Apoteker), STRA (Apoteker), SIPA (Obat), STRA (Obat), SIPA (Alkes), STRA (Alkes)

---

### 1.3 Get Section

```
GET /settings/:section
```

| Param | Type | Deskripsi |
|-------|------|-----------|
| `section` | `string` | Nama section (lihat [Valid Sections](#valid-sections)) |

---

## 2. Initialize

```
POST /settings/initialize
```

Membuat dokumen settings dengan default values. **Hanya bisa dipanggil sekali.**

**Response `201 Created`** / **`409 Conflict`** (jika sudah ada)

---

## 3. Bulk Update

```
PUT /settings
```

Update seluruh settings sekaligus. Body berisi object dengan section keys.

> **Mekanisme:** Nested object di-flatten menjadi `$set` operations agar field yang tidak disediakan tidak ter-overwrite.

---

## 4. Section Updates

Setiap section memiliki endpoint PUT terpisah. Body berisi field-field untuk section tersebut.

### 4.1 Update Company

```
PUT /settings/company
```

| Field | Type | Deskripsi |
|-------|------|-----------|
| `name` | `string` | Nama perusahaan |
| `logo` | `string` | Path logo |
| `phone` | `string` | Nomor telepon |
| `email` | `string` | Email |
| `website` | `string` | Website |
| `officeAddress` | `object` | `{ street, city, province, postalCode, country }` |
| `warehouseAddress` | `object` | `{ street, city, province, postalCode, country }` |

---

### 4.2 Update Licenses

```
PUT /settings/licenses
```

| Field | Type | Deskripsi |
|-------|------|-----------|
| `pbf` | `object` | `{ number, issuedDate, expiryDate, document }` |
| `siup` | `object` | |
| `tdp` | `object` | |
| `nib` | `object` | `{ number }` |
| `cdob` | `object` | |

---

### 4.3 Update Pharmacist (Legacy)

```
PUT /settings/pharmacist
```

> Field `responsiblePharmacist` lama. Tetap tersedia untuk backward compatibility.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `name` | `string` | Nama apoteker PJ |
| `sipaNumber` | `string` | Nomor SIPA |
| `straNumber` | `string` | Nomor STRA |
| `sipaExpiry` | `date` | Masa berlaku SIPA |
| `straExpiry` | `date` | Masa berlaku STRA |
| `phone` | `string` | |
| `email` | `string` | |

---

### 4.3a Update Pharmacist Obat

```
PUT /settings/pharmacist-obat
```

Apoteker penanggung jawab khusus **obat**.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `name` | `string` | Nama apoteker PJ obat |
| `sipaNumber` | `string` | Nomor SIPA |
| `straNumber` | `string` | Nomor STRA |
| `sipaExpiry` | `date` | Masa berlaku SIPA |
| `straExpiry` | `date` | Masa berlaku STRA |
| `phone` | `string` | |
| `email` | `string` | |

---

### 4.3b Update Pharmacist Alkes

```
PUT /settings/pharmacist-alkes
```

Apoteker penanggung jawab khusus **alat kesehatan**.

| Field | Type | Deskripsi |
|-------|------|-----------|
| `name` | `string` | Nama apoteker PJ alkes |
| `sipaNumber` | `string` | Nomor SIPA |
| `straNumber` | `string` | Nomor STRA |
| `sipaExpiry` | `date` | Masa berlaku SIPA |
| `straExpiry` | `date` | Masa berlaku STRA |
| `phone` | `string` | |
| `email` | `string` | |

---

### 4.4 Update Tax

```
PUT /settings/tax
```

| Field | Type | Validation | Deskripsi |
|-------|------|------------|-----------|
| `npwp` | `string` | | Nomor NPWP |
| `isPkp` | `boolean` | | Pengusaha Kena Pajak |
| `defaultPpnRate` | `number` | 0-100 | Tarif PPN default (%) |

> `defaultPpnRate` digunakan oleh modul PO saat menghitung `calculateTotals(ppnRate)`.

---

### 4.5 Update Invoice

```
PUT /settings/invoice
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `prefix` | `string` | `INV` | Prefix nomor invoice |
| `autoNumber` | `boolean` | `true` | Auto-generate nomor |
| `defaultPaymentTermDays` | `number` | 30 | Jatuh tempo (0-365 hari) |

---

### 4.6 Update Purchase Order

```
PUT /settings/purchase-order
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `prefix` | `string` | `SP` | Prefix nomor PO |
| `autoNumber` | `boolean` | `true` | Auto-generate nomor |
| `requireApproval` | `boolean` | `true` | Wajib approval |
| `approvalLevels` | `number` | 2 | Level approval (1-5) |

---

### 4.7 Update Delivery Order

```
PUT /settings/delivery-order
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `prefix` | `string` | `SJ` | Prefix nomor surat jalan |
| `autoNumber` | `boolean` | `true` | |

---

### 4.8 Update Return Order

```
PUT /settings/return-order
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `prefix` | `string` | `RTN` | Prefix nomor return |
| `autoNumber` | `boolean` | `true` | |
| `maxReturnDays` | `number` | 14 | Maksimal hari return (1-365) |
| `requireApproval` | `boolean` | `true` | |
| `autoRestockGood` | `boolean` | `false` | Auto-restock item kondisi baik |

---

### 4.9 Update Inventory

```
PUT /settings/inventory
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `enableBatchTracking` | `boolean` | `true` | Tracking per batch |
| `enableExpiryDate` | `boolean` | `true` | Tracking tanggal kadaluarsa |
| `useFEFO` | `boolean` | `true` | First Expired First Out |
| `lowStockThreshold` | `number` | 10 | Default threshold stok minimum |
| `temperatureZones` | `array` | 3 zones | `[{ name, minTemp, maxTemp }]` |

> `lowStockThreshold` digunakan sebagai fallback jika `Product.stokMinimum` belum diset.

Default temperature zones:
- CRT (Controlled Room Temperature): 15-25°C
- Ruang Sejuk: 8-15°C
- Lemari Es: 2-8°C

---

### 4.10 Update CDOB

```
PUT /settings/cdob
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `enableTemperatureLog` | `boolean` | `true` | Log suhu |
| `enableRecallManagement` | `boolean` | `true` | Manajemen recall |
| `enableComplaintTracking` | `boolean` | `true` | Tracking komplain |
| `selfInspectionSchedule` | `string` | `quarterly` | `monthly`, `quarterly`, `biannually`, `annually` |
| `documentRetentionYears` | `number` | 5 | Retensi dokumen (1-30 tahun) |

---

### 4.11 Update Medication

```
PUT /settings/medication
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `trackNarcotic` | `boolean` | `true` | Tracking narkotika |
| `trackPsychotropic` | `boolean` | `true` | Tracking psikotropika |
| `trackPrecursor` | `boolean` | `true` | Tracking prekursor |
| `trackOtc` | `boolean` | `false` | Tracking OTC |
| `requireSpecialSP` | `boolean` | `true` | SP khusus untuk obat tertentu |

---

### 4.12 Update Customer

```
PUT /settings/customer
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `requireSIA` | `boolean` | `true` | Wajib SIA |
| `customerTypes` | `array` | 4 types | Tipe customer yang diizinkan |
| `defaultCreditLimit` | `number` | 50.000.000 | Limit kredit default |

Customer types: `apotek`, `rumah_sakit`, `klinik`, `puskesmas`, `toko_obat`, `pbf_lain`, `pemerintah`

---

### 4.13 Update Payment

```
PUT /settings/payment
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `prefix` | `string` | `PAY` | Prefix nomor pembayaran |
| `autoNumber` | `boolean` | `true` | |
| `bankAccounts` | `array` | `[]` | `[{ bankName, accountNumber, accountName }]` |
| `allowPartialPayment` | `boolean` | `true` | |
| `allowCreditPayment` | `boolean` | `true` | |
| `latePenaltyRate` | `number` | 2 | Denda keterlambatan (%) |

---

### 4.14 Update Notification

```
PUT /settings/notification
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `enableEmail` | `boolean` | `true` | |
| `enableSMS` | `boolean` | `false` | |
| `enableWhatsApp` | `boolean` | `false` | |
| `alerts.lowStock` | `boolean` | `true` | Alert stok rendah |
| `alerts.nearExpiry` | `boolean` | `true` | Alert mendekati expired |
| `alerts.overduePayment` | `boolean` | `true` | Alert pembayaran overdue |
| `alerts.recall` | `boolean` | `true` | Alert recall |
| `alerts.temperatureAlert` | `boolean` | `true` | Alert suhu |
| `smtp.host` | `string` | | SMTP server |
| `smtp.port` | `number` | 587 | SMTP port |
| `smtp.user` | `string` | | SMTP user |
| `smtp.password` | `string` | | SMTP password (**encrypted**) |
| `smtp.fromName` | `string` | | Nama pengirim |
| `smtp.fromEmail` | `string` | | Email pengirim |

---

### 4.15 Update Reporting

```
PUT /settings/reporting
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `bpom.enableEReport` | `boolean` | `false` | Integrasi e-report BPOM |
| `bpom.apiKey` | `string` | | API key BPOM (**encrypted**) |
| `fiscalYearStart` | `number` | 1 | Bulan awal tahun fiskal (1-12) |
| `currency` | `string` | `IDR` | Mata uang |

---

### 4.16 Update General

```
PUT /settings/general
```

| Field | Type | Default | Deskripsi |
|-------|------|---------|-----------|
| `timezone` | `string` | `Asia/Jakarta` | `Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura` |
| `dateFormat` | `string` | `DD/MM/YYYY` | `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` |
| `language` | `string` | `id` | `id`, `en` |
| `maintenanceMode` | `boolean` | `false` | Mode maintenance |
| `sessionTimeoutMinutes` | `number` | 60 | Timeout session (5-1440 menit) |

---

## 5. Document Number Generator

### 5.1 Generate Document Number

```
POST /settings/doc-number/:type
```

| Param | Type | Valid Values |
|-------|------|-------------|
| `type` | `string` | `invoice`, `purchaseOrder`, `deliveryOrder`, `returnOrder`, `salesOrder`, `delivery`, `payment`, `memo`, `journal` |

**Format:** `{prefix}/{YYYYMM}/{000001}`

**Contoh:** `INV/202601/000001`, `SP/202601/000002`

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "documentNumber": "INV/202601/000042",
    "type": "invoice",
    "counter": 42
  }
}
```

**Error:** `400 Bad Request` jika `autoNumber` tidak aktif untuk tipe tersebut.

---

### 5.2 Reset Document Counter

```
PUT /settings/doc-number/:type/reset
```

**Roles:** Hanya **SUPERADMIN**

Mereset counter ke 0 untuk tipe dokumen yang ditentukan.

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "message": "Counter invoice berhasil di-reset"
  }
}
```

---

## 6. Utility

### 6.1 Test SMTP

```
POST /settings/test-smtp
```

| Field | Type | Required | Deskripsi |
|-------|------|----------|-----------|
| `testEmail` | `string` | ❌ | Email tujuan test (default: fromEmail) |

**Validasi:** SMTP host dan port harus sudah dikonfigurasi.

---

## Valid Sections

Sections yang valid untuk `GET /settings/:section`:

| Section | Deskripsi |
|---------|-----------|
| `company` | Data perusahaan + lisensi + apoteker (legacy, obat, alkes) + pajak |
| `invoice` | Konfigurasi invoice |
| `purchaseOrder` | Konfigurasi PO |
| `deliveryOrder` | Konfigurasi surat jalan |
| `returnOrder` | Konfigurasi return |
| `salesOrder` | Konfigurasi SO |
| `delivery` | Konfigurasi delivery |
| `return` | Konfigurasi return |
| `payment` | Konfigurasi pembayaran |
| `memo` | Konfigurasi credit/debit memo |
| `gl` | Konfigurasi general ledger |
| `inventory` | Konfigurasi inventaris |
| `cdob` | Konfigurasi CDOB |
| `medication` | Konfigurasi obat |
| `customer` | Konfigurasi customer |
| `notification` | Konfigurasi notifikasi |
| `reporting` | Konfigurasi pelaporan |
| `general` | Konfigurasi umum |

---

## Document Counter Types

| Type | Prefix Default | Deskripsi |
|------|---------------|-----------|
| `invoice` | `INV` | Faktur penjualan |
| `purchaseOrder` | `SP` | Surat Pesanan |
| `deliveryOrder` | `SJ` | Surat Jalan |
| `returnOrder` | `RTN` | Return barang |
| `payment` | `PAY` | Pembayaran |
| `memo` | `CM` / `DM` | Credit/Debit memo |
| `journal` | `JRN` | Journal entry |

---

## Integrasi dengan Modul Lain

| Modul | Setting yang digunakan |
|-------|----------------------|
| PO | `company.tax.defaultPpnRate` → PPN rate untuk `calculateTotals()` |
| PO | `purchaseOrder.requireApproval` → Approval flow |
| Invoice | `invoice.defaultPaymentTermDays` → Hitung `dueDate` |
| Delivery | `delivery.requireBatch`, `delivery.requireExpiry` |
| Return | `returnOrder.maxReturnDays`, `returnOrder.autoRestockGood` |
| Inventory | `inventory.lowStockThreshold` → Fallback untuk stok minimum |
| Inventory | `inventory.useFEFO` → Metode pengambilan stok |
| Customer | `customer.requireSIA`, `customer.customerTypes`, `customer.defaultCreditLimit` |
| Report PDF | `company.name` → Header laporan |
| All Modules | `generateDocNumber(type)` → Auto-numbering dokumen |

---

## Business Rules

1. **Singleton pattern** — hanya 1 dokumen settings di collection `settings`
2. **Initialize required** — harus `POST /settings/initialize` sebelum menggunakan modul lain
3. **Flatten update** — nested object di-flatten ke `$set` agar field yang tidak dikirim tidak ter-overwrite
4. **Array full replace** — field array (`temperatureZones`, `customerTypes`, `bankAccounts`) di-replace seluruhnya
5. **Sensitive data encrypted** — SMTP password dan BPOM API key di-encrypt sebelum disimpan
6. **License warning threshold** — 30 hari sebelum expired → `expiring_soon`, sudah lewat → `expired`
7. **Counter auto-increment** — `documentCounters` menggunakan `$inc` untuk atomic increment
8. **Counter reset** — hanya SUPERADMIN yang bisa reset counter ke 0
9. **DocumentCounters hidden** — `documentCounters` tidak ditampilkan pada response `GET /settings`
10. **Doc number format** — `{prefix}/{YYYYMM}/{000000}` (zero-padded 6 digit)
