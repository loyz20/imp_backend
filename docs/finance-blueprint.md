# Finance Blueprint (Target Architecture)

Dokumen ini merangkum rancangan modul Finance target untuk backend dan frontend.
Blueprint ini disusun dari requirement bisnis dan dipetakan ke implementasi yang sudah ada.

---

## 1. Struktur Modul Finance

### Core Module

- Chart of Accounts (COA)
- Journal (Jurnal Umum)
- Ledger (Buku Besar)
- Cash and Bank
- Account Payable (Hutang)
- Account Receivable (Piutang)
- Expense Management
- Revenue Management
- Financial Report

---

## 2. Struktur Database (High Level)

### 2.1 Accounts (COA)

```json
{
  "_id": "uuid",
  "code": "101",
  "name": "Kas",
  "type": "ASSET",
  "parent_id": null,
  "is_active": true,
  "created_at": "",
  "updated_at": ""
}
```

### 2.2 Journals

```json
{
  "_id": "uuid",
  "date": "2026-04-05",
  "reference": "INV-001",
  "description": "Penjualan obat",
  "entries": [
    {
      "account_id": "101",
      "debit": 1000000,
      "credit": 0
    },
    {
      "account_id": "401",
      "debit": 0,
      "credit": 1000000
    }
  ],
  "created_by": "user_id"
}
```

### 2.3 Transactions (Cash and Bank)

```json
{
  "_id": "uuid",
  "type": "CASH_IN",
  "amount": 500000,
  "account_id": "101",
  "date": "",
  "description": "",
  "reference": ""
}
```

### 2.4 Payables (Hutang)

```json
{
  "_id": "uuid",
  "supplier_id": "",
  "invoice_number": "",
  "amount": 2000000,
  "paid": 500000,
  "due_date": "",
  "status": "PARTIAL"
}
```

### 2.5 Receivables (Piutang)

```json
{
  "_id": "uuid",
  "customer_id": "",
  "invoice_number": "",
  "amount": 1500000,
  "paid": 1000000,
  "due_date": "",
  "status": "PARTIAL"
}
```

---

## 3. Flow Sistem Finance

### 3.1 Penjualan

1. Input penjualan.
2. Generate invoice.
3. Masuk ke:
- Piutang (jika kredit).
- Kas (jika tunai).
4. Auto jurnal:
- Debit Kas/Piutang.
- Kredit Pendapatan.

### 3.2 Pembelian

1. Input pembelian.
2. Masuk ke hutang.
3. Auto jurnal:
- Debit Persediaan.
- Kredit Hutang.

### 3.3 Pembayaran Hutang

- Debit Hutang.
- Kredit Kas.

### 3.4 Penerimaan Piutang

- Debit Kas.
- Kredit Piutang.

---

## 4. Laporan Keuangan

### Wajib

- Neraca (Balance Sheet)
- Laba Rugi (Profit and Loss)
- Arus Kas (Cash Flow)
- Buku Besar
- Jurnal Umum

---

## 5. Struktur API (Express + MongoDB)

### Base

`/api/v1/finance`

### 5.1 COA

- GET `/gl/accounts`
- POST `/gl/accounts`
- PUT `/gl/accounts/:id`
- DELETE `/gl/accounts/:id`

### 5.2 Journal

- GET `/gl/journals`
- POST `/gl/journals/manual`
- PATCH `/gl/journals/:id/approve`
- GET `/gl/ledger`

### 5.3 Cash Flow

- GET `/bank-transactions`
- POST `/bank-transactions`

### 5.4 Payables

- GET `/payables`
- POST `/payables`
- POST `/payables/:id/pay`

### 5.5 Receivables

- GET `/receivables`
- POST `/receivables`
- POST `/receivables/:id/pay`

### 5.6 Reports

- GET `/reports/balance-sheet`
- GET `/reports/profit-loss`
- GET `/reports/cash-flow`
- GET `/reports/ledger`

---

## 6. Struktur Halaman Frontend

### Sidebar Menu

- Dashboard Finance
- Chart of Accounts
- Jurnal Umum
- Kas and Bank
- Hutang
- Piutang
- Laporan

### Halaman Detail

#### 6.1 Dashboard

- Total Kas
- Total Piutang
- Total Hutang
- Grafik pemasukan vs pengeluaran

#### 6.2 Jurnal

- Table + filter tanggal
- Add jurnal manual

#### 6.3 Kas and Bank

- Transaksi masuk/keluar
- Saldo realtime

#### 6.4 Hutang and Piutang

- List invoice
- Status (PAID/PARTIAL/UNPAID)

#### 6.5 Laporan

- Export PDF/Excel
- Filter tanggal

---

## 7. Mapping dengan Implementasi Saat Ini

### Sudah Ada

- COA read/write dasar (list, create, update, activate, delete).
- Journal read (list).
- Manual journal posting dengan approval guard.
- Ledger detail per akun + date range.
- Trial balance.
- Report endpoints: balance sheet, profit-loss, cash-flow, ledger.
- AR/AP ringkasan dan detail.
- Payments incoming/outgoing dengan verifikasi dan jurnal otomatis.
- Bank transactions dan reconciliation.

### Belum Ada (Backlog)

- GET `/gl/journals/:id` detail endpoint.
- Export laporan PDF/Excel.
- Approval workflow lanjutan (reject/revise manual journal).

---

## 8. Prioritas Implementasi Disarankan

1. Expense management (voucher + posting journal).
2. Revenue management analytics layer.
3. Export laporan PDF/Excel.
4. Approval workflow lanjutan (reject/revise manual journal).
