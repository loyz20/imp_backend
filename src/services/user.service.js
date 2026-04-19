const ApiError = require('../utils/ApiError');
const config = require('../config');
const { getMySQLPool } = require('../config/database');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

const mapMysqlUserRow = (row) => ({
  id: row.id,
  _id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  avatar: row.avatar,
  role: row.role,
  isActive: row.is_active === 1,
  isEmailVerified: row.is_email_verified === 1,
  address: row.address_street ? {
    street: row.address_street,
    city: row.address_city,
    province: row.address_province,
    postalCode: row.address_postal_code,
    country: row.address_country,
  } : {},
  lastLoginAt: row.last_login_at,
  lastLoginIp: row.last_login_ip,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const getUsers = async (query) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const { page = 1, limit = 10, role, isActive, search } = query;
  const offset = (Number(page) - 1) * Number(limit);
  let whereClause = [];
  let params = [];

  if (role) {
    whereClause.push('role = ?');
    params.push(role);
  }

  if (isActive !== undefined) {
    whereClause.push('is_active = ?');
    params.push(isActive ? 1 : 0);
  }

  if (search) {
    whereClause.push('(name LIKE ? OR email LIKE ?)');
    const searchLike = `%${search}%`;
    params.push(searchLike, searchLike);
  }

  const whereSQL = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM users ${whereSQL}`,
    params,
  );

  const [rows] = await pool.query(
    `
      SELECT * FROM users ${whereSQL}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
    [...params, Number(limit), offset],
  );

  return {
    docs: rows.map(mapMysqlUserRow),
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: countRows[0].total,
      pages: Math.ceil(countRows[0].total / Number(limit)),
    },
  };
};

const getUserById = async (userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  return mapMysqlUserRow(rows[0]);
};

const createUser = async (userData, createdBy = 'SYSTEM') => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const { name, email, phone, password, role = 'user', isActive = true } = userData;

  const [existingRows] = await pool.query(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  );

  if (existingRows.length > 0) {
    throw ApiError.conflict('Email already exists');
  }

  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);

  await pool.query(
    `
      INSERT INTO users (
        id, name, email, phone, password_hash, role,
        is_active, is_email_verified,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())
    `,
    [userId, name, email.toLowerCase(), phone || null, passwordHash, role, isActive ? 1 : 0],
  );

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  return mapMysqlUserRow(rows[0]);
};

const updateUser = async (userId, updateData) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [existingRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (existingRows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  const allowedFields = ['name', 'phone', 'role', 'isActive', 'address'];
  const setClauses = [];
  const values = [];

  // Check email uniqueness if email is being updated
  if (updateData.email) {
    const [emailRows] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1',
      [updateData.email.toLowerCase(), userId],
    );
    if (emailRows.length > 0) {
      throw ApiError.conflict('Email already in use by another user');
    }
    setClauses.push('email = ?');
    values.push(updateData.email.toLowerCase());
  }

  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      if (key === 'address' && typeof updateData[key] === 'object') {
        setClauses.push('address_street = ?, address_city = ?, address_province = ?, address_postal_code = ?, address_country = ?');
        values.push(
          updateData[key].street || null,
          updateData[key].city || null,
          updateData[key].province || null,
          updateData[key].postalCode || null,
          updateData[key].country || null,
        );
      } else if (key === 'isActive') {
        setClauses.push('is_active = ?');
        values.push(updateData[key] ? 1 : 0);
      } else if (key !== 'address') {
        setClauses.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    }
  }

  if (setClauses.length > 0) {
    setClauses.push('updated_at = NOW()');
    values.push(userId);

    await pool.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
      values,
    );
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  return mapMysqlUserRow(rows[0]);
};

const deleteUser = async (userId, currentUserId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  if (userId === currentUserId) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  if (rows[0].is_system_user === 1) {
    throw ApiError.badRequest('System users cannot be deleted');
  }

  // Soft delete: deactivate
  await pool.query(
    'UPDATE users SET is_active = 0, refresh_token = NULL WHERE id = ?',
    [userId],
  );

  const [updatedRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  return mapMysqlUserRow(updatedRows[0]);
};

const changeRole = async (userId, role, currentUserId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  if (userId === currentUserId) {
    throw ApiError.badRequest('You cannot change your own role');
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  await pool.query(
    'UPDATE users SET role = ?, updated_at = NOW() WHERE id = ?',
    [role, userId],
  );

  const [updatedRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  return mapMysqlUserRow(updatedRows[0]);
};

const changeStatus = async (userId, isActive, currentUserId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  if (userId === currentUserId) {
    throw ApiError.badRequest('You cannot change your own status');
  }

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  const refreshToken = isActive ? null : null; // Clear token if deactivating
  await pool.query(
    'UPDATE users SET is_active = ?, refresh_token = NULL, updated_at = NOW() WHERE id = ?',
    [isActive ? 1 : 0, userId],
  );

  const [updatedRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  return mapMysqlUserRow(updatedRows[0]);
};

const searchUsers = async (term) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const searchLike = `%${term}%`;
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE name LIKE ? OR email LIKE ? LIMIT 20',
    [searchLike, searchLike],
  );

  return rows.map(mapMysqlUserRow);
};

const getUserStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [[{ total }], [{ active }], [{ inactive }], roleStatsRows] = await Promise.all([
    pool.query('SELECT COUNT(*) as total FROM users'),
    pool.query('SELECT COUNT(*) as active FROM users WHERE is_active = 1'),
    pool.query('SELECT COUNT(*) as inactive FROM users WHERE is_active = 0'),
    pool.query('SELECT role, COUNT(*) as count FROM users GROUP BY role'),
  ]);

  const byRole = {};
  roleStatsRows.forEach((r) => {
    byRole[r.role] = r.count;
  });

  return { total, active, inactive, byRole };
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeRole,
  changeStatus,
  searchUsers,
  getUserStats,
};