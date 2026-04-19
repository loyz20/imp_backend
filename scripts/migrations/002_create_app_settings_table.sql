-- core table migration
-- table: app_settings

CREATE TABLE IF NOT EXISTS app_settings (
  id VARCHAR(36) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_settings_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO app_settings (id, setting_key, setting_value, created_at, updated_at)
VALUES (
  UUID(),
  'main',
  '{"company":{"name":"","logo":null,"phone":"","email":"","website":"","officeAddress":{"street":"","city":"","province":"","postalCode":"","country":"Indonesia"},"warehouseAddress":{"street":"","city":"","province":"","postalCode":"","country":"Indonesia"},"licenses":{"pbf":{"number":"","issuedDate":null,"expiryDate":null,"document":null},"siup":{"number":"","issuedDate":null,"expiryDate":null,"document":null},"tdp":{"number":"","issuedDate":null,"expiryDate":null,"document":null},"nib":{"number":""},"cdob":{"number":"","issuedDate":null,"expiryDate":null,"document":null}},"responsiblePharmacist":{"name":"","sipaNumber":"","straNumber":"","sipaExpiry":null,"straExpiry":null,"phone":"","email":""},"pharmacistObat":{"name":"","sipaNumber":"","straNumber":"","sipaExpiry":null,"straExpiry":null,"phone":"","email":""},"pharmacistAlkes":{"name":"","sipaNumber":"","straNumber":"","sipaExpiry":null,"straExpiry":null,"phone":"","email":""},"tax":{"npwp":"","isPkp":false,"defaultPpnRate":11}},"invoice":{"prefix":"INV","autoNumber":true,"defaultPaymentTermDays":30},"purchaseOrder":{"prefix":"SP","autoNumber":true,"requireApproval":true,"approvalLevels":2},"deliveryOrder":{"prefix":"SJ","autoNumber":true},"salesOrder":{"prefix":"SO","autoNumber":true},"delivery":{"prefix":"DLV","autoNumber":true,"requireBatch":true,"requireExpiry":true},"returnOrder":{"prefix":"RTN","autoNumber":true,"maxReturnDays":14,"requireApproval":true,"autoRestockGood":false},"payment":{"prefix":"PAY","autoNumber":true,"bankAccounts":[],"allowPartialPayment":true,"allowCreditPayment":true,"latePenaltyRate":2},"memo":{"creditPrefix":"CM","debitPrefix":"DM","autoNumber":true},"gl":{"journalPrefix":"JRN","autoNumber":true},"inventory":{"enableBatchTracking":true,"enableExpiryDate":true,"useFEFO":true,"lowStockThreshold":10,"temperatureZones":[{"name":"CRT (Controlled Room Temperature)","minTemp":15,"maxTemp":25},{"name":"Ruang Sejuk","minTemp":8,"maxTemp":15},{"name":"Lemari Es","minTemp":2,"maxTemp":8}]},"cdob":{"enableTemperatureLog":true,"enableRecallManagement":true,"enableComplaintTracking":true,"selfInspectionSchedule":"quarterly","documentRetentionYears":5},"medication":{"trackNarcotic":true,"trackPsychotropic":true,"trackPrecursor":true,"trackOtc":false,"requireSpecialSP":true},"customer":{"requireSIA":true,"customerTypes":["apotek","rumah_sakit","klinik","puskesmas"],"defaultCreditLimit":50000000},"notification":{"enableEmail":true,"enableSMS":false,"enableWhatsApp":false,"alerts":{"lowStock":true,"nearExpiry":true,"overduePayment":true,"recall":true,"temperatureAlert":true},"smtp":{"host":"","port":587,"user":"","password":"","fromName":"","fromEmail":""}},"reporting":{"bpom":{"enableEReport":false,"apiKey":""},"fiscalYearStart":1,"currency":"IDR"},"general":{"timezone":"Asia/Jakarta","dateFormat":"DD/MM/YYYY","language":"id","maintenanceMode":false,"sessionTimeoutMinutes":60},"documentCounters":{"invoice":{"current":0,"lastReset":null},"purchaseOrder":{"current":0,"lastReset":null},"deliveryOrder":{"current":0,"lastReset":null},"returnOrder":{"current":0,"lastReset":null},"payment":{"current":0,"lastReset":null},"memo":{"current":0,"lastReset":null},"journal":{"current":0,"lastReset":null}}}',
  NOW(),
  NOW()
);
