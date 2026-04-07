# API Contract — Modul Regulasi

**Base URL:** `http://localhost:5000/api/v1`

Modul regulasi mencakup 3 sub-modul:
1. **Surat Pesanan Khusus** — Pengelolaan SP untuk Narkotika, Psikotropika & Prekursor
2. **e-Report BPOM** — Generate & kirim laporan bulanan ke BPOM
3. **Dokumen Perizinan** — Hub terpusat lisensi perusahaan, supplier & customer

---

## Daftar Isi

- [Role & Akses](#role--akses)
- [1. Surat Pesanan Khusus](#1-surat-pesanan-khusus)
  - [1.1 GET /regulation/sp — Daftar SP](#11-get-regulationsp--daftar-sp)
  - [1.2 GET /regulation/sp/stats — Statistik SP](#12-get-regulationspstats--statistik-sp)
  - [1.3 GET /regulation/sp/:id — Detail SP](#13-get-regulationspid--detail-sp)
  - [1.4 POST /regulation/sp — Buat SP Baru](#14-post-regulationsp--buat-sp-baru)
  - [1.5 PATCH /regulation/sp/:id/status — Update Status SP](#15-patch-regulationspidstatus--update-status-sp)
- [2. e-Report BPOM](#2-e-report-bpom)
  - [2.1 GET /regulation/ereport — Riwayat e-Report](#21-get-regulationereport--riwayat-e-report)
  - [2.2 GET /regulation/ereport/stats — Statistik e-Report](#22-get-regulationereportstats--statistik-e-report)
  - [2.3 POST /regulation/ereport/generate — Generate e-Report](#23-post-regulationereportgenerate--generate-e-report)
  - [2.4 POST /regulation/ereport/:id/submit — Submit ke BPOM](#24-post-regulationereportidsubmit--submit-ke-bpom)
- [3. Dokumen Perizinan](#3-dokumen-perizinan)
  - [3.1 GET /regulation/documents — Semua Dokumen](#31-get-regulationdocuments--semua-dokumen)
  - [3.2 GET /regulation/documents/stats — Statistik Dokumen](#32-get-regulationdocumentsstats--statistik-dokumen)
  - [3.3 POST /regulation/documents/:id/upload — Upload File Dokumen](#33-post-regulationdocumentsidupload--upload-file-dokumen)

---

## Role & Akses

| Fitur | superadmin | admin | apoteker | gudang | sales | keuangan | user |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Lihat SP Khusus | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Buat/Kelola SP | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve/Reject SP | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Lihat e-Report | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Generate/Submit e-Report | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Lihat Dokumen Perizinan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload Dokumen | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 1. Surat Pesanan Khusus

### 1.1 GET /regulation/sp — Daftar SP

Mengambil daftar Surat Pesanan Khusus dengan filter & pagination.

**Query Parameters:**

| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|:-----:|-----------|
| `page` | number | ❌ | Halaman (default: 1) |
| `limit` | number | ❌ | Jumlah per halaman (default: 20) |
| `type` | string | ❌ | Filter golongan: `narkotika`, `psikotropika`, `prekursor` |
| `status` | string | ❌ | Filter status: `draft`, `submitted`, `approved`, `rejected`, `expired` |
| `search` | string | ❌ | Pencarian di nomor SP dan nama supplier |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "sp1",
      "spNumber": "SP-NK/2026/04/001",
      "date": "2026-04-01",
      "type": "narkotika",
      "supplier": {
        "_id": "s1",
        "name": "PT Kimia Farma"
      },
      "items": [
        {
          "product": {
            "_id": "p1",
            "name": "Codein 10mg Tab",
            "sku": "COD-010"
          },
          "qty": 100,
          "unit": "tablet"
        }
      ],
      "validUntil": "2026-04-30",
      "status": "approved",
      "notes": "Kebutuhan bulanan",
      "createdBy": { "name": "apt. Siti Aminah" },
      "approvedBy": { "name": "Admin Utama" },
      "approvedAt": "2026-04-02",
      "createdAt": "2026-04-01"
    }
  ],
  "meta": {
    "pagination": {
      "totalDocs": 5,
      "totalPages": 1,
      "page": 1,
      "limit": 20
    }
  }
}
```

**Frontend Mapping:**

| Response Field | Ditampilkan Sebagai |
|----------------|---------------------|
| `spNumber` | Kolom "No. SP" |
| `date` | Kolom "Tanggal" (formatDate) |
| `type` | Badge golongan (narkotika=merah, psikotropika=kuning, prekursor=ungu) |
| `supplier.name` | Kolom "Supplier" |
| `items[].product.name` | Tabel item di Detail Modal |
| `items[].qty` + `items[].unit` | Kolom "Jumlah" di Detail Modal |
| `validUntil` | Kolom "Berlaku Sampai" (formatDate) |
| `status` | Badge status (draft/submitted/approved/rejected/expired) |
| `createdBy.name` | Detail Modal: "Dibuat oleh" |
| `approvedBy.name` | Detail Modal: "Disetujui oleh" |
| `approvedAt` | Detail Modal: "Tanggal persetujuan" |

---

### 1.2 GET /regulation/sp/stats — Statistik SP

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 5,
    "narkotika": 2,
    "psikotropika": 2,
    "prekursor": 1,
    "byStatus": {
      "draft": 1,
      "submitted": 1,
      "approved": 1,
      "rejected": 1,
      "expired": 1
    }
  }
}
```

**Frontend Mapping:**

| Field | Stat Card |
|-------|-----------|
| `total` | "Total SP" (indigo) |
| `narkotika` | "Narkotika" (merah) |
| `psikotropika` | "Psikotropika" (kuning) |
| `prekursor` | "Prekursor" (ungu) |
| `byStatus.*` | Digunakan sebagai filter count di badge |

---

### 1.3 GET /regulation/sp/:id — Detail SP

**Path Parameters:**

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `id` | string | ID Surat Pesanan |

**Response:** Sama dengan satu item di response daftar SP (1.1). Digunakan di Detail Modal.

---

### 1.4 POST /regulation/sp — Buat SP Baru

**Request Body:**

```json
{
  "type": "narkotika",
  "supplier": "s1",
  "items": [
    {
      "product": "p1",
      "qty": 100,
      "unit": "tablet"
    }
  ],
  "validUntil": "2026-04-30",
  "notes": "Kebutuhan bulanan"
}
```

| Field | Tipe | Wajib | Deskripsi |
|-------|------|:-----:|-----------|
| `type` | string | ✅ | `narkotika` / `psikotropika` / `prekursor` |
| `supplier` | string | ✅ | ID supplier |
| `items` | array | ✅ | Minimal 1 item |
| `items[].product` | string | ✅ | ID produk |
| `items[].qty` | number | ✅ | Jumlah pesanan (> 0) |
| `items[].unit` | string | ✅ | Satuan (tablet, ampul, vial, dll) |
| `validUntil` | string (date) | ✅ | Tanggal berlaku SP |
| `notes` | string | ❌ | Catatan tambahan |

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "sp_new",
    "spNumber": "SP-NK/2026/04/006",
    "status": "draft",
    "createdAt": "2026-04-04T10:00:00.000Z"
  }
}
```

SP baru selalu dibuat dengan status `draft`.

---

### 1.5 PATCH /regulation/sp/:id/status — Update Status SP

**Path Parameters:**

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `id` | string | ID Surat Pesanan |

**Request Body:**

```json
{
  "status": "submitted"
}
```

| Field | Tipe | Wajib | Deskripsi |
|-------|------|:-----:|-----------|
| `status` | string | ✅ | Status baru |

**Status Flow:**

```
draft → submitted → approved
                  → rejected
approved → expired (otomatis jika validUntil terlewat)
```

| Transisi | Dilakukan oleh | Aksi UI |
|----------|----------------|---------|
| `draft` → `submitted` | apoteker, admin, superadmin | Tombol "Ajukan" |
| `submitted` → `approved` | admin, superadmin | Tombol "Setujui" |
| `submitted` → `rejected` | admin, superadmin | Tombol "Tolak" |

**Response:** Objek SP yang terupdate (format sama dengan 1.1).

---

## 2. e-Report BPOM

### 2.1 GET /regulation/ereport — Riwayat e-Report

**Query Parameters:**

| Parameter | Tipe | Wajib | Deskripsi |
|-----------|------|:-----:|-----------|
| `page` | number | ❌ | Halaman (default: 1) |
| `limit` | number | ❌ | Jumlah per halaman (default: 20) |
| `type` | string | ❌ | Filter tipe: `narkotika`, `psikotropika`, `prekursor` |
| `status` | string | ❌ | Filter status: `draft`, `submitted`, `received`, `rejected` |

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "er1",
      "reportNumber": "RPT-NK/2026/03",
      "period": "2026-03",
      "type": "narkotika",
      "status": "received",
      "submittedAt": "2026-04-01",
      "submittedBy": { "name": "apt. Siti Aminah" },
      "receivedAt": "2026-04-02",
      "rejectReason": null,
      "items": [
        {
          "product": "Codein 10mg Tab",
          "qtyIn": 100,
          "qtyOut": 80,
          "stockEnd": 120
        },
        {
          "product": "Morfin 10mg Inj",
          "qtyIn": 20,
          "qtyOut": 15,
          "stockEnd": 25
        }
      ],
      "createdAt": "2026-04-01"
    }
  ],
  "meta": {
    "pagination": {
      "totalDocs": 5,
      "totalPages": 1,
      "page": 1,
      "limit": 20
    }
  }
}
```

**Frontend Mapping:**

| Response Field | Ditampilkan Sebagai |
|----------------|---------------------|
| `reportNumber` | Kolom "No. Laporan" |
| `period` | Kolom "Periode" (format: bulan-tahun) |
| `type` | Badge tipe (narkotika/psikotropika/prekursor) |
| `status` | Badge status (draft/submitted/received/rejected) |
| `submittedAt` | Kolom "Tanggal Kirim" |
| `submittedBy.name` | Detail Modal: "Dikirim oleh" |
| `receivedAt` | Detail Modal: "Diterima pada" |
| `rejectReason` | Detail Modal: alert merah jika rejected |
| `items[].product` | Tabel detail: Kolom "Produk" |
| `items[].qtyIn` | Tabel detail: Kolom "Pemasukan" |
| `items[].qtyOut` | Tabel detail: Kolom "Pengeluaran" |
| `items[].stockEnd` | Tabel detail: Kolom "Stok Akhir" |

---

### 2.2 GET /regulation/ereport/stats — Statistik e-Report

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 5,
    "submitted": 1,
    "received": 3,
    "rejected": 1,
    "draft": 0
  }
}
```

**Frontend Mapping:**

| Field | Stat Card |
|-------|-----------|
| `total` | "Total Report" (indigo) |
| `submitted` | "Terkirim" (biru) |
| `received` | "Diterima BPOM" (hijau) |
| `rejected` | "Ditolak" (merah) |

---

### 2.3 POST /regulation/ereport/generate — Generate e-Report

Generate laporan e-Report berdasarkan data transaksi pada periode tertentu. Backend menghitung `qtyIn`, `qtyOut`, `stockEnd` dari data penerimaan, penjualan, dan stok.

**Request Body:**

```json
{
  "period": "2026-03",
  "type": "narkotika"
}
```

| Field | Tipe | Wajib | Deskripsi |
|-------|------|:-----:|-----------|
| `period` | string | ✅ | Periode laporan dalam format `YYYY-MM` |
| `type` | string | ✅ | `narkotika` / `psikotropika` / `prekursor` |

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "2026-03",
    "type": "narkotika",
    "items": [
      {
        "product": "Codein 10mg Tab",
        "qtyIn": 100,
        "qtyOut": 80,
        "stockEnd": 120
      },
      {
        "product": "Morfin 10mg Inj",
        "qtyIn": 20,
        "qtyOut": 15,
        "stockEnd": 25
      }
    ]
  }
}
```

Data ini ditampilkan sebagai preview tabel di tab "Generate Report". User dapat export PDF atau submit ke BPOM.

---

### 2.4 POST /regulation/ereport/:id/submit — Submit ke BPOM

Mengirim laporan yang sudah di-generate ke BPOM. Hanya laporan dengan status `draft` atau `rejected` yang bisa di-submit ulang.

**Path Parameters:**

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `id` | string | ID e-Report |

**Request Body:** Tidak ada (empty body).

**Response:** Objek e-Report yang terupdate dengan `status: "submitted"`.

**Status Flow:**

```
draft → submitted → received (dikonfirmasi BPOM)
                  → rejected (ditolak BPOM)
rejected → submitted (re-submit)
```

---

## 3. Dokumen Perizinan

### 3.1 GET /regulation/documents — Semua Dokumen

Mengambil semua dokumen perizinan yang dikelompokkan berdasarkan kategori.

**Response:**

```json
{
  "success": true,
  "data": {
    "company": [
      {
        "_id": "d1",
        "type": "PBF",
        "number": "PBF-2024-001234",
        "issuedDate": "2024-01-15",
        "expiryDate": "2029-01-15",
        "status": "active",
        "fileName": "izin_pbf.pdf",
        "holder": null
      },
      {
        "_id": "d5",
        "type": "SIPA",
        "number": "SIPA-2023-007890",
        "issuedDate": "2023-09-15",
        "expiryDate": "2026-09-15",
        "status": "active",
        "fileName": "sipa_apoteker.pdf",
        "holder": "apt. Siti Aminah"
      }
    ],
    "supplier": [
      {
        "_id": "ds1",
        "entityName": "PT Kimia Farma",
        "type": "CDOB",
        "number": "CDOB-KF-2024",
        "expiryDate": "2027-05-01",
        "status": "active"
      }
    ],
    "customer": [
      {
        "_id": "dc1",
        "entityName": "Apotek Sehat Jaya",
        "customerType": "apotek",
        "siaNumber": "SIA-2024-001",
        "siaExpiry": "2027-03-01",
        "status": "active"
      }
    ]
  }
}
```

**Kategori Company — Tipe Dokumen:**

| Tipe | Deskripsi |
|------|-----------|
| `PBF` | Izin Pedagang Besar Farmasi |
| `SIUP` | Surat Izin Usaha Perdagangan |
| `CDOB` | Cara Distribusi Obat yang Baik |
| `TDP` | Tanda Daftar Perusahaan |
| `NIB` | Nomor Induk Berusaha |
| `SIPA` | Surat Izin Praktik Apoteker |
| `STRA` | Surat Tanda Registrasi Apoteker |

**Kategori Customer — Tipe Customer:**

| Tipe | Label UI |
|------|----------|
| `apotek` | Apotek |
| `rumah_sakit` | Rumah Sakit |
| `klinik` | Klinik |
| `puskesmas` | Puskesmas |
| `toko_obat` | Toko Obat |
| `pemerintah` | Pemerintah |
| `pbf_lain` | PBF Lain |

**Status Dokumen:**

| Status | Label UI | Warna Badge | Deskripsi |
|--------|----------|-------------|-----------|
| `active` | Aktif | Hijau | Dokumen masih berlaku |
| `expiring_soon` | Segera Expired | Kuning | Sisa masa berlaku ≤ 30 hari |
| `expired` | Expired | Merah | Sudah melewati tanggal expired |

**Frontend Mapping per Kategori:**

**Company (Cards):**

| Response Field | Ditampilkan Sebagai |
|----------------|---------------------|
| `type` | Judul card (PBF, SIUP, dll) |
| `number` | Baris "Nomor" |
| `issuedDate` | Baris "Terbit" (formatDate) |
| `expiryDate` | Baris "Expired" (formatDate, warna sesuai status) |
| `status` | Badge status di pojok kanan atas |
| `fileName` | Tombol "Lihat File" (jika ada) / "Belum ada file" |
| `holder` | Baris "Pemegang" (jika ada, untuk SIPA/STRA) |

**Supplier (Tabel):**

| Response Field | Kolom Tabel |
|----------------|-------------|
| `entityName` | Supplier |
| `type` | Tipe Lisensi |
| `number` | Nomor |
| `expiryDate` | Expired (formatDate) |
| `status` | Status (badge) |

**Customer (Tabel):**

| Response Field | Kolom Tabel |
|----------------|-------------|
| `entityName` | Customer |
| `customerType` | Tipe (label mapping) |
| `siaNumber` | No. SIA |
| `siaExpiry` | SIA Expired (formatDate) |
| `status` | Status (badge) |

---

### 3.2 GET /regulation/documents/stats — Statistik Dokumen

**Response:**

```json
{
  "success": true,
  "data": {
    "total": 15,
    "active": 9,
    "expiringSoon": 4,
    "expired": 2
  }
}
```

**Frontend Mapping:**

| Field | Stat Card |
|-------|-----------|
| `total` | "Total Dokumen" (indigo) |
| `active` | "Aktif" (hijau) |
| `expiringSoon` | "Segera Expired" (kuning) |
| `expired` | "Sudah Expired" (merah) |

---

### 3.3 POST /regulation/documents/:id/upload — Upload File Dokumen

Upload atau update file dokumen perizinan. Hanya role `superadmin` dan `admin` yang dapat melakukan upload.

**Path Parameters:**

| Parameter | Tipe | Deskripsi |
|-----------|------|-----------|
| `id` | string | ID dokumen perizinan |

**Request Body:** `multipart/form-data`

| Field | Tipe | Wajib | Deskripsi |
|-------|------|:-----:|-----------|
| `file` | File | ✅ | File dokumen (PDF, JPG, PNG, maks 10MB) |

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "d4",
    "fileName": "tdp_2022.pdf",
    "uploadedAt": "2026-04-04T10:00:00.000Z"
  }
}
```

---

## Frontend — Store & Service Mapping

### Service Methods → API Endpoints

| Service Method | HTTP | Endpoint | Store Action |
|----------------|------|----------|--------------|
| `getSPList(params)` | GET | `/regulation/sp` | `fetchSPList()` |
| `getSPStats()` | GET | `/regulation/sp/stats` | `fetchSPStats()` |
| `getSPById(id)` | GET | `/regulation/sp/:id` | — (langsung di komponen) |
| `createSP(data)` | POST | `/regulation/sp` | `createSP(payload)` |
| `updateSPStatus(id, status)` | PATCH | `/regulation/sp/:id/status` | `updateSPStatus(id, status)` |
| `getEReports(params)` | GET | `/regulation/ereport` | `fetchEReports()` |
| `getEReportStats()` | GET | `/regulation/ereport/stats` | `fetchEReportStats()` |
| `generateEReport(data)` | POST | `/regulation/ereport/generate` | `generateEReport(payload)` |
| `submitEReport(id)` | POST | `/regulation/ereport/:id/submit` | `submitEReport(id)` |
| `getDocuments()` | GET | `/regulation/documents` | `fetchDocuments()` |
| `getDocStats()` | GET | `/regulation/documents/stats` | `fetchDocStats()` |
| `uploadDocument(id, file)` | POST | `/regulation/documents/:id/upload` | `uploadDocument(id, file)` |

### Fetch Strategy (Per Halaman)

```
SuratPesananKhusus.jsx
├── onMount → fetchSPList() + fetchSPStats()
├── onFilter → setSPFilters({...}) → fetchSPList()
├── onCreate → createSP(data) → fetchSPList() + fetchSPStats()
└── onStatusChange → updateSPStatus(id, status) → fetchSPList() + fetchSPStats()

EReportBPOM.jsx
├── onMount → fetchEReports() + fetchEReportStats()
├── onFilter → setEReportFilters({...}) → fetchEReports()
├── onGenerate → generateEReport({period, type}) → preview tabel
├── onSubmit → submitEReport(id) → fetchEReports() + fetchEReportStats()
└── onClear → clearGeneratedReport()

DokumenPerizinan.jsx
├── onMount → fetchDocuments() + fetchDocStats()
└── onUpload → uploadDocument(id, file) → fetchDocuments()
```

### Routing

| Path | Komponen | Sidebar Label |
|------|----------|---------------|
| `/regulasi/surat-pesanan` | `SuratPesananKhusus` | Surat Pesanan Khusus |
| `/regulasi/e-report` | `EReportBPOM` | e-Report BPOM |
| `/regulasi/perizinan` | `DokumenPerizinan` | Dokumen Perizinan |
