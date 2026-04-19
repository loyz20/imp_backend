const { body, param, query } = require('express-validator');
const {
  PRODUCT_CATEGORY,
  ALL_GOLONGAN,
  GOLONGAN_OBAT,
  GOLONGAN_ALKES,
  BENTUK_SEDIAAN,
  SATUAN,
} = require('../constants');

const productIdParam = [
  param('id').isUUID().withMessage('Invalid product ID format'),
];

const getProducts = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search query too long'),
  query('category')
    .optional()
    .isIn(Object.values(PRODUCT_CATEGORY))
    .withMessage('Invalid category'),
  query('golongan')
    .optional()
    .isIn(Object.values(ALL_GOLONGAN))
    .withMessage('Invalid golongan'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  query('manufacturer')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Manufacturer query too long'),
  query('sort')
    .optional()
    .isIn([
      'name', '-name', 'sku', '-sku', 'createdAt', '-createdAt',
      'category', '-category', 'golongan', '-golongan',
    ])
    .withMessage('Invalid sort field'),
];

const createProduct = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Product name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be between 2 and 200 characters'),
  body('sku')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('SKU must be at most 50 characters'),
  body('barcode')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Barcode must be at most 50 characters'),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(Object.values(PRODUCT_CATEGORY))
    .withMessage('Invalid category'),
  body('golongan')
    .notEmpty()
    .withMessage('Golongan is required')
    .isIn(Object.values(ALL_GOLONGAN))
    .withMessage('Invalid golongan')
    .custom((value, { req }) => {
      const cat = req.body.category;
      if (cat === 'obat' && !Object.values(GOLONGAN_OBAT).includes(value)) {
        throw new Error('Golongan tidak sesuai untuk kategori Obat');
      }
      if (cat === 'alat_kesehatan' && !Object.values(GOLONGAN_ALKES).includes(value)) {
        throw new Error('Golongan tidak sesuai untuk kategori Alat Kesehatan');
      }
      return true;
    }),
  body('nie')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
     .withMessage('No NIE must be at most 50 characters'),
  body('noBpom')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('No BPOM must be at most 50 characters'),
  body('bentukSediaan')
    .optional({ values: 'null' })
    .isIn(BENTUK_SEDIAAN)
    .withMessage('Invalid bentuk sediaan'),
  body('zatAktif')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Zat aktif must be at most 500 characters'),
  body('satuan')
    .optional()
    .isIn(SATUAN)
    .withMessage('Invalid satuan'),
  body('satuanKecil')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Satuan kecil must be at most 50 characters'),
  body('isiPerSatuan')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Isi per satuan must be at least 1'),
  body('ppn')
    .optional()
    .isBoolean()
    .withMessage('PPN must be boolean'),
  body('stokMinimum')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stok minimum must be a non-negative integer'),
  body('manufacturer')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Manufacturer must be at most 200 characters'),
  body('keterangan')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Keterangan must be at most 1000 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
];

const updateProduct = [
  ...productIdParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ min: 2, max: 200 })
    .withMessage('Name must be between 2 and 200 characters'),
  body('sku')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('SKU must be at most 50 characters'),
  body('barcode')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Barcode must be at most 50 characters'),
  body('category')
    .optional()
    .isIn(Object.values(PRODUCT_CATEGORY))
    .withMessage('Invalid category'),
  body('golongan')
    .optional()
    .isIn(Object.values(ALL_GOLONGAN))
    .withMessage('Invalid golongan')
    .custom((value, { req }) => {
      const cat = req.body.category;
      if (cat === 'obat' && !Object.values(GOLONGAN_OBAT).includes(value)) {
        throw new Error('Golongan tidak sesuai untuk kategori Obat');
      }
      if (cat === 'alat_kesehatan' && !Object.values(GOLONGAN_ALKES).includes(value)) {
        throw new Error('Golongan tidak sesuai untuk kategori Alat Kesehatan');
      }
      return true;
    }),
  body('nie')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
     .withMessage('No NIE must be at most 50 characters'),
  body('noBpom')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('No BPOM must be at most 50 characters'),
  body('bentukSediaan')
    .optional({ values: 'null' })
    .isIn(BENTUK_SEDIAAN)
    .withMessage('Invalid bentuk sediaan'),
  body('zatAktif')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 500 })
    .withMessage('Zat aktif must be at most 500 characters'),
  body('satuan')
    .optional()
    .isIn(SATUAN)
    .withMessage('Invalid satuan'),
  body('satuanKecil')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Satuan kecil must be at most 50 characters'),
  body('isiPerSatuan')
    .optional({ values: 'null' })
    .isInt({ min: 1 })
    .withMessage('Isi per satuan must be at least 1'),
  body('ppn')
    .optional()
    .isBoolean()
    .withMessage('PPN must be boolean'),
  body('stokMinimum')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stok minimum must be a non-negative integer'),
  body('manufacturer')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Manufacturer must be at most 200 characters'),
  body('keterangan')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Keterangan must be at most 1000 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
];

const changeStatus = [
  ...productIdParam,
  body('isActive')
    .notEmpty()
    .withMessage('isActive is required')
    .isBoolean()
    .withMessage('isActive must be boolean'),
];

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  changeStatus,
  productIdParam,
};


