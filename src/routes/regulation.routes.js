const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const regulationController = require('../controllers/regulation.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const regulationValidation = require('../validations/regulation.validation');
const { USER_ROLES, UPLOAD } = require('../constants');

const { ADMIN, APOTEKER, GUDANG, SALES, KEUANGAN, USER } = USER_ROLES;

// ─── Multer config for document upload ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads/regulation'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [...UPLOAD.ALLOWED_DOC_TYPES, ...UPLOAD.ALLOWED_IMAGE_TYPES];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipe file tidak diizinkan. Hanya PDF, JPEG, PNG, dan WebP'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// All regulation routes require authentication
router.use(auth);

// ═══════════════════════════════════════════════════════════════
// ─── SURAT PESANAN KHUSUS ───
// ═══════════════════════════════════════════════════════════════

router.get(
  '/sp/stats',
  authorize(ADMIN, APOTEKER, GUDANG),
  regulationController.getSPStats,
);

router
  .route('/sp')
  .get(
    authorize(ADMIN, APOTEKER, GUDANG),
    validate(regulationValidation.getSPList),
    regulationController.getSPList,
  )
  .post(
    authorize(ADMIN, APOTEKER),
    validate(regulationValidation.createSP),
    regulationController.createSP,
  );

router.get(
  '/sp/:id',
  authorize(ADMIN, APOTEKER, GUDANG),
  validate(regulationValidation.spIdParam),
  regulationController.getSPById,
);

router.patch(
  '/sp/:id/status',
  authorize(ADMIN, APOTEKER),
  validate(regulationValidation.updateSPStatus),
  regulationController.updateSPStatus,
);

// ═══════════════════════════════════════════════════════════════
// ─── E-REPORT BPOM ───
// ═══════════════════════════════════════════════════════════════

router.get(
  '/ereport/stats',
  authorize(ADMIN, APOTEKER, GUDANG),
  regulationController.getEReportStats,
);

router.get(
  '/ereport',
  authorize(ADMIN, APOTEKER, GUDANG),
  validate(regulationValidation.getEReports),
  regulationController.getEReports,
);

router.post(
  '/ereport/generate',
  authorize(ADMIN, APOTEKER),
  validate(regulationValidation.generateEReport),
  regulationController.generateEReport,
);

router.post(
  '/ereport/:id/submit',
  authorize(ADMIN, APOTEKER),
  validate(regulationValidation.ereportIdParam),
  regulationController.submitEReport,
);

// ═══════════════════════════════════════════════════════════════
// ─── DOKUMEN PERIZINAN ───
// ═══════════════════════════════════════════════════════════════

router.get(
  '/documents/stats',
  authorize(ADMIN, APOTEKER, GUDANG, SALES, KEUANGAN, USER),
  regulationController.getDocStats,
);

router.get(
  '/documents',
  authorize(ADMIN, APOTEKER, GUDANG, SALES, KEUANGAN, USER),
  regulationController.getDocuments,
);

router.post(
  '/documents/:id/upload',
  authorize(ADMIN),
  validate(regulationValidation.docIdParam),
  upload.single('file'),
  regulationController.uploadDocument,
);

module.exports = router;
