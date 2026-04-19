const ApiError = require('../utils/ApiError');
const { getMySQLPool } = require('../config/database');
const { randomUUID } = require('crypto');

const toBool = (value) => value === true || value === 1 || value === '1';

const escapeLike = (value = '') => value.replace(/[\\%_]/g, '\\$&');

const getSortClause = (sort) => {
  const sortField = sort || '-createdAt';
  const sortDir = sortField.startsWith('-') ? 'DESC' : 'ASC';
  const sortKey = sortField.replace(/^-/, '');

  const sortMap = {
    name: 'p.name',
    sku: 'p.sku',
    category: 'p.category',
    golongan: 'p.golongan',
    createdAt: 'p.created_at',
    updatedAt: 'p.updated_at',
  };

  return `${sortMap[sortKey] || 'p.created_at'} ${sortDir}`;
};

const mapMysqlProductRow = (row) => ({
  id: row.id,
  _id: row.id,
  name: row.name,
  sku: row.sku,
  barcode: row.barcode,
  category: row.category,
  golongan: row.golongan,
  nie: row.nie,
  noBpom: row.no_bpom,
  bentukSediaan: row.bentuk_sediaan,
  zatAktif: row.zat_aktif,
  satuan: row.satuan,
  satuanKecil: row.satuan_kecil,
  isiPerSatuan: row.isi_per_satuan,
  ppn: toBool(row.ppn),
  stokMinimum: Number(row.stok_minimum || 0),
  manufacturer: row.manufacturer,
  keterangan: row.keterangan ?? row.notes,
  isActive: toBool(row.is_active),
  createdBy: row.created_by_name ? { _id: row.created_by, name: row.created_by_name } : null,
  updatedBy: row.updated_by_name ? { _id: row.updated_by, name: row.updated_by_name } : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const generateMysqlSku = async (pool, category) => {
  // F0001 for obat, A0001 for alat_kesehatan
  const prefix = category === 'alat_kesehatan' ? 'A' : 'F';

  const [rows] = await pool.query(
    'SELECT sku FROM products WHERE sku LIKE ? ORDER BY sku DESC LIMIT 1',
    [`${prefix}%`],
  );

  let nextNum = 1;
  if (rows.length > 0 && rows[0].sku) {
    const parsed = Number(rows[0].sku.replace(prefix, ''));
    if (Number.isFinite(parsed)) nextNum = parsed + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`;
};

const mysqlGetProducts = async (queryParams) => {
  const {
    page: rawPage,
    limit: rawLimit,
    search,
    category,
    golongan,
    isActive,
    manufacturer,
    sort,
  } = queryParams;

  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 10));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  if (search) {
    const term = `%${escapeLike(search)}%`;
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.nie LIKE ? OR p.barcode LIKE ? OR p.zat_aktif LIKE ?)');
    params.push(term, term, term, term, term);
  }

  if (category) {
    where.push('p.category = ?');
    params.push(category);
  }

  if (golongan) {
    where.push('p.golongan = ?');
    params.push(golongan);
  }

  if (manufacturer) {
    where.push('p.manufacturer LIKE ?');
    params.push(`%${escapeLike(manufacturer)}%`);
  }

  if (typeof isActive !== 'undefined') {
    where.push('p.is_active = ?');
    params.push(isActive === 'true' || isActive === true ? 1 : 0);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const orderClause = getSortClause(sort);
  const pool = getMySQLPool();

  if (!pool) {
    throw ApiError.internal('MySQL pool is not initialized');
  }

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM products p ${whereClause}`,
    params,
  );
  const totalDocs = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `
      SELECT
        p.*,
        cu.name AS created_by_name,
        uu.name AS updated_by_name
      FROM products p
      LEFT JOIN users cu ON cu.id = p.created_by
      LEFT JOIN users uu ON uu.id = p.updated_by
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  const totalPages = Math.ceil(totalDocs / limit);

  return {
    docs: rows.map(mapMysqlProductRow),
    pagination: {
      totalDocs,
      totalPages,
      page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
    },
  };
};

const mysqlGetProductStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [[base]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive
     FROM products`,
  );

  const [categoryRows] = await pool.query('SELECT category AS k, COUNT(*) AS c FROM products GROUP BY category');
  const [golonganRows] = await pool.query('SELECT golongan AS k, COUNT(*) AS c FROM products GROUP BY golongan');

  const byCategory = {};
  categoryRows.forEach((r) => { byCategory[r.k] = Number(r.c); });

  const byGolongan = {};
  golonganRows.forEach((r) => { byGolongan[r.k] = Number(r.c); });

  return {
    total: Number(base?.total || 0),
    active: Number(base?.active || 0),
    inactive: Number(base?.inactive || 0),
    byCategory,
    byGolongan,
  };
};

const mysqlGetProductById = async (productId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query(
    `
      SELECT
        p.*,
        cu.name AS created_by_name,
        uu.name AS updated_by_name
      FROM products p
      LEFT JOIN users cu ON cu.id = p.created_by
      LEFT JOIN users uu ON uu.id = p.updated_by
      WHERE p.id = ?
      LIMIT 1
    `,
    [productId],
  );

  if (rows.length === 0) {
    throw ApiError.notFound('Product not found');
  }

  return mapMysqlProductRow(rows[0]);
};

const mysqlCreateProduct = async (productData, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [nameRows] = await pool.query(
    'SELECT id FROM products WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [productData.name],
  );
  if (nameRows.length > 0) {
    throw ApiError.conflict('Product with this name already exists');
  }

  if (productData.sku) {
    const [skuRows] = await pool.query('SELECT id FROM products WHERE sku = ? LIMIT 1', [productData.sku]);
    if (skuRows.length > 0) {
      throw ApiError.conflict('SKU already exists');
    }
  }

  const id = randomUUID();
  const sku = productData.sku || await generateMysqlSku(pool, productData.category);

  await pool.query(
    `
      INSERT INTO products (
        id, name, sku, barcode, category, golongan, nie, no_bpom,
        bentuk_sediaan, zat_aktif,
        satuan, satuan_kecil, isi_per_satuan,
        ppn, stok_minimum,
        manufacturer,
        keterangan, is_active,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      id,
      productData.name,
      sku,
      productData.barcode || null,
      productData.category,
      productData.golongan,
      productData.nie || null,
      productData.noBpom || null,
      productData.bentukSediaan || null,
      productData.zatAktif || null,
      productData.satuan || 'Box',
      productData.satuanKecil || null,
      productData.isiPerSatuan ?? null,
      productData.ppn === undefined ? 1 : (toBool(productData.ppn) ? 1 : 0),
      productData.stokMinimum ?? 0,
      productData.manufacturer || null,
      productData.keterangan || null,
      productData.isActive === undefined ? 1 : (toBool(productData.isActive) ? 1 : 0),
      userId || null,
      userId || null,
    ],
  );

  return mysqlGetProductById(id);
};

const mysqlUpdateProduct = async (productId, updateData, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [existsRows] = await pool.query('SELECT id FROM products WHERE id = ? LIMIT 1', [productId]);
  if (existsRows.length === 0) {
    throw ApiError.notFound('Product not found');
  }

  if (updateData.name) {
    const [nameRows] = await pool.query(
      'SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND id <> ? LIMIT 1',
      [updateData.name, productId],
    );
    if (nameRows.length > 0) {
      throw ApiError.conflict('Product with this name already exists');
    }
  }

  if (updateData.sku) {
    const [skuRows] = await pool.query(
      'SELECT id FROM products WHERE sku = ? AND id <> ? LIMIT 1',
      [updateData.sku, productId],
    );
    if (skuRows.length > 0) {
      throw ApiError.conflict('SKU already exists');
    }
  }

  const setClauses = [];
  const values = [];

  const map = {
    name: 'name',
    sku: 'sku',
    barcode: 'barcode',
    category: 'category',
    golongan: 'golongan',
    nie: 'nie',
    noBpom: 'no_bpom',
    bentukSediaan: 'bentuk_sediaan',
    zatAktif: 'zat_aktif',
    satuan: 'satuan',
    satuanKecil: 'satuan_kecil',
    isiPerSatuan: 'isi_per_satuan',
    stokMinimum: 'stok_minimum',
    manufacturer: 'manufacturer',
    keterangan: 'keterangan',
  };

  Object.entries(map).forEach(([key, column]) => {
    if (updateData[key] !== undefined) {
      setClauses.push(`${column} = ?`);
      values.push(updateData[key]);
    }
  });

  if (updateData.ppn !== undefined) {
    setClauses.push('ppn = ?');
    values.push(toBool(updateData.ppn) ? 1 : 0);
  }

  if (updateData.isActive !== undefined) {
    setClauses.push('is_active = ?');
    values.push(toBool(updateData.isActive) ? 1 : 0);
  }

  setClauses.push('updated_by = ?');
  values.push(userId || null);
  setClauses.push('updated_at = NOW()');

  await pool.query(
    `UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`,
    [...values, productId],
  );

  return mysqlGetProductById(productId);
};

const mysqlDeleteProduct = async (productId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query('SELECT id FROM products WHERE id = ? LIMIT 1', [productId]);
  if (rows.length === 0) {
    throw ApiError.notFound('Product not found');
  }

  await pool.query('UPDATE products SET is_active = 0, updated_at = NOW() WHERE id = ?', [productId]);
  return mysqlGetProductById(productId);
};

const mysqlChangeStatus = async (productId, isActive, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query('SELECT id FROM products WHERE id = ? LIMIT 1', [productId]);
  if (rows.length === 0) {
    throw ApiError.notFound('Product not found');
  }

  await pool.query(
    'UPDATE products SET is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
    [toBool(isActive) ? 1 : 0, userId || null, productId],
  );

  return mysqlGetProductById(productId);
};

const getProducts = (queryParams) => mysqlGetProducts(queryParams);

const getProductStats = () => mysqlGetProductStats();

const getProductById = (productId) => mysqlGetProductById(productId);

const createProduct = (productData, userId) => mysqlCreateProduct(productData, userId);

const updateProduct = (productId, updateData, userId) => mysqlUpdateProduct(productId, updateData, userId);

const deleteProduct = (productId) => mysqlDeleteProduct(productId);

const changeStatus = (productId, isActive, userId) => mysqlChangeStatus(productId, isActive, userId);

module.exports = {
  getProducts,
  getProductStats,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  changeStatus,
};

