# API Contract - Modul Finance (Keuangan)

Modul: Finance Management
Base URL: http://localhost:5000/api/v1
Prefix: /finance

Dokumen ini sudah diselaraskan dengan endpoint yang aktif di backend saat ini.

---

## Scope Endpoint Aktif

Finance saat ini fokus pada:
- Chart of Accounts (COA)
- General Journal dan Ledger
- Cash and Bank (bank transactions)
- Accounts Receivable (piutang)
- Accounts Payable (hutang)
- Financial Reports (balance sheet, profit-loss, cash-flow, ledger)

Endpoint lama seperti dashboard, invoices, payments, memos, trial balance, dan bank reconciliation detail tidak lagi diekspos via finance routes.

---

## Auth dan Role

Semua endpoint finance wajib Bearer token.

Role yang digunakan:
- Superadmin
- Admin
- Keuangan
- Sales (hanya pada endpoint tertentu)

---

## Ringkasan Endpoint

### COA

| Method | Path | Role |
|---|---|---|
| GET | /finance/gl/accounts | Superadmin, Admin, Keuangan |
| POST | /finance/gl/accounts | Superadmin, Admin |
| PUT | /finance/gl/accounts/:id | Superadmin, Admin |
| DELETE | /finance/gl/accounts/:id | Superadmin, Admin |

### Journal dan Ledger

| Method | Path | Role |
|---|---|---|
| GET | /finance/gl/journals | Superadmin, Admin, Keuangan |
| POST | /finance/gl/journals/manual | Superadmin, Admin, Keuangan |
| PATCH | /finance/gl/journals/:id/approve | Superadmin, Admin |
| GET | /finance/gl/ledger | Superadmin, Admin, Keuangan |

### Cash and Bank

| Method | Path | Role |
|---|---|---|
| GET | /finance/bank-transactions | Superadmin, Admin, Keuangan |
| POST | /finance/bank-transactions | Superadmin, Admin, Keuangan |

### Receivables

| Method | Path | Role |
|---|---|---|
| GET | /finance/receivables | Superadmin, Admin, Keuangan, Sales |
| POST | /finance/receivables | Superadmin, Admin, Keuangan |
| POST | /finance/receivables/:id/pay | Superadmin, Admin, Keuangan |

### Payables

| Method | Path | Role |
|---|---|---|
| GET | /finance/payables | Superadmin, Admin, Keuangan |
| POST | /finance/payables | Superadmin, Admin, Keuangan |
| POST | /finance/payables/:id/pay | Superadmin, Admin, Keuangan |

### Reports

| Method | Path | Role |
|---|---|---|
| GET | /finance/reports/balance-sheet | Superadmin, Admin, Keuangan |
| GET | /finance/reports/profit-loss | Superadmin, Admin, Keuangan |
| GET | /finance/reports/cash-flow | Superadmin, Admin, Keuangan |
| GET | /finance/reports/ledger | Superadmin, Admin, Keuangan |

Catatan: /finance/reports/ledger menggunakan validator yang sama dengan /finance/gl/ledger.

---

## Detail Kontrak per Domain

## 1. COA

### 1.1 GET /finance/gl/accounts

Query:
- category (optional): salah satu ACCOUNT_CATEGORY
- search (optional): max 100 karakter
- includeInactive (optional): boolean

### 1.2 POST /finance/gl/accounts

Body:
- code (required, 1-20)
- name (required, 1-200)
- category (required)
- parentId (optional, mongo id)
- description (optional, max 500)
- isActive (optional, boolean)

### 1.3 PUT /finance/gl/accounts/:id

Body field sama seperti create, semuanya optional.

### 1.4 DELETE /finance/gl/accounts/:id

Guard:
- akun tidak punya child account
- akun belum dipakai journal entry

---

## 2. Journal dan Ledger

### 2.1 GET /finance/gl/journals

Query:
- page, limit
- search (max 100)
- accountCategory
- status
- dateFrom, dateTo
- sort

### 2.2 POST /finance/gl/journals/manual

Body:
- date (required, ISO date)
- description (required, 3-500)
- reference (optional, max 100)
- entries (required, min 2)
  - entries[].accountId (required)
  - entries[].debit / entries[].credit
  - entries[].description (optional, max 500)

Rule:
- setiap baris hanya boleh debit atau credit
- total debit dan credit harus seimbang

### 2.3 PATCH /finance/gl/journals/:id/approve

Body:
- notes (optional, max 500)

Rule:
- hanya journal manual dengan status pending approval
- creator tidak boleh approve journal sendiri

### 2.4 GET /finance/gl/ledger

Query:
- accountId (required)
- period (optional): current_month | last_month | current_year | custom
- dateFrom, dateTo (wajib jika period=custom)
- page, limit, sort

Response mencakup opening balance, total debit/credit periode, closing balance, dan transaksi ledger.

---

## 3. Cash and Bank

### 3.1 GET /finance/bank-transactions

Query:
- page, limit
- search (max 100)
- matchStatus
- dateFrom, dateTo
- sort

### 3.2 POST /finance/bank-transactions

Body:
- date (required)
- type (required): debit | credit
- amount (required, min 1)
- description (optional, max 500)
- bankAccount (optional, max 100)
- reference (optional, max 100)

---

## 4. Receivables

### 4.1 GET /finance/receivables

Query:
- page, limit
- search (max 100)
- aging: current | 31-60 | 61-90 | 90+
- dateFrom, dateTo
- sort

### 4.2 POST /finance/receivables

Body:
- invoiceId (required)
- amount (required)
- paymentDate (required)
- paymentMethod (required)
- referenceNumber (optional)
- bankAccount (optional)
- notes (optional)
- verificationNotes (optional)

Behavior:
- membuat draft incoming payment dari invoice sales

### 4.3 POST /finance/receivables/:id/pay

Body sama seperti create receivable payment.

Behavior:
- id diperlakukan sebagai invoiceId
- create draft payment lalu auto verify (direct post)
- auto update invoice dan posting jurnal payment

---

## 5. Payables

### 5.1 GET /finance/payables

Query:
- page, limit
- search (max 100)
- aging: current | 31-60 | 61-90 | 90+
- dateFrom, dateTo
- sort

Behavior:
- Rekap hutang diambil dari purchase invoice (invoiceType=purchase) yang terbentuk dari Goods Receiving, bukan dari Purchase Order.

### 5.2 POST /finance/payables

Body:
- invoiceId (required, invoiceType=purchase dari hasil Goods Receiving)
- amount (required)
- paymentDate (required)
- paymentMethod (required)
- referenceNumber (optional)
- bankAccount (optional)
- notes (optional)
- verificationNotes (optional)

Behavior:
- membuat draft outgoing payment dari purchase invoice (hasil Goods Receiving)

### 5.3 POST /finance/payables/:id/pay

Body sama seperti create payable payment.

Behavior:
- id diperlakukan sebagai invoiceId (purchase invoice dari Goods Receiving)
- create draft payment lalu auto verify (direct post)
- auto update invoice pembelian dan posting jurnal payment

---

## 6. Reports

### 6.1 GET /finance/reports/balance-sheet
### 6.2 GET /finance/reports/profit-loss
### 6.3 GET /finance/reports/cash-flow

Query untuk ketiganya:
- period (optional): current_month | last_month | current_year | custom
- dateFrom, dateTo (wajib jika period=custom)

### 6.4 GET /finance/reports/ledger

Menggunakan kontrak query yang sama dengan GET /finance/gl/ledger.

---

## Integrasi Modul Lain (Tetap Aktif)

Walaupun tidak diekspos sebagai route finance langsung, service finance tetap dipakai oleh modul lain:
- Delivery: auto create invoice + COGS journal
- Goods Receiving: auto create jurnal GR + purchase invoice
- Return: auto create memo + approve memo + COGS reversal

---

## Catatan Migrasi dari Dokumen Lama

Endpoint berikut tidak lagi ada di finance routes aktif:
- /finance/dashboard/*
- /finance/invoices/*
- /finance/payments/*
- /finance/memos/*
- /finance/gl/trial-balance
- /finance/gl/accounts/:id/activate
- /finance/receivables/:customerId
- /finance/payables/:supplierId
- /finance/bank-transactions/summary
- /finance/bank-transactions/:id (PUT/DELETE)
- /finance/bank-transactions/:id/match
- /finance/bank-transactions/:id/unmatch
