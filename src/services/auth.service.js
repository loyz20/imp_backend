const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const config = require('../config');
const { getMySQLPool } = require('../config/database');

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

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ id: userId, role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  const refreshToken = jwt.sign({ id: userId, role }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
};

const register = async ({ name, email, password }) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [existingRows] = await pool.query(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  );
  if (existingRows.length > 0) {
    throw ApiError.conflict('Email already registered');
  }

  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  const tokens = generateTokens(userId, 'user');
  const emailVerificationToken = crypto.randomBytes(32).toString('hex');
  const emailVerificationTokenHash = crypto
    .createHash('sha256')
    .update(emailVerificationToken)
    .digest('hex');
  const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    `
      INSERT INTO users (
        id, name, email, password_hash, role,
        email_verification_token, email_verification_expires,
        refresh_token, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [
      userId,
      name,
      email.toLowerCase(),
      passwordHash,
      'user',
      emailVerificationTokenHash,
      emailVerificationExpires,
      tokens.refreshToken,
    ],
  );

  const [userRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  return {
    user: mapMysqlUserRow(userRows[0]),
    tokens,
    emailVerificationToken,
  };
};

const login = async ({ email, password, ip }) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  );

  if (rows.length === 0) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const user = rows[0];

  // Check if account is locked
  if (user.lock_until && new Date(user.lock_until) > new Date()) {
    throw ApiError.forbidden(
      'Account is temporarily locked due to too many failed login attempts. Please try again later.',
    );
  }

  // Check if account is active
  if (!user.is_active) {
    throw ApiError.forbidden('Your account has been deactivated. Please contact support.');
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    const newAttempts = Number(user.login_attempts || 0) + 1;
    const MAX_ATTEMPTS = 5;
    const LOCK_TIME = 30 * 60 * 1000;

    if (newAttempts >= MAX_ATTEMPTS) {
      const lockUntil = new Date(Date.now() + LOCK_TIME);
      await pool.query(
        'UPDATE users SET login_attempts = ?, lock_until = ? WHERE id = ?',
        [newAttempts, lockUntil, user.id],
      );
    } else {
      await pool.query(
        'UPDATE users SET login_attempts = ? WHERE id = ?',
        [newAttempts, user.id],
      );
    }
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Reset login attempts on successful login
  const tokens = generateTokens(user.id, user.role);

  // Update login tracking
  await pool.query(
    'UPDATE users SET refresh_token = ?, last_login_at = NOW(), last_login_ip = ?, login_attempts = 0, lock_until = NULL WHERE id = ?',
    [tokens.refreshToken, ip, user.id],
  );

  const [updatedRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [user.id],
  );

  return { user: mapMysqlUserRow(updatedRows[0]), tokens };
};

const logout = async (userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  await pool.query(
    'UPDATE users SET refresh_token = NULL WHERE id = ?',
    [userId],
  );
};

const refreshToken = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.refreshSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query(
    'SELECT refresh_token FROM users WHERE id = ? LIMIT 1',
    [decoded.id],
  );

  if (rows.length === 0) {
    throw ApiError.unauthorized('User not found');
  }

  const user = rows[0];

  // Verify that the refresh token matches stored token (token rotation)
  if (user.refresh_token !== token) {
    // Possible token reuse attack — clear all tokens
    await pool.query('UPDATE users SET refresh_token = NULL WHERE id = ?', [decoded.id]);
    throw ApiError.unauthorized('Token reuse detected. Please login again.');
  }

  const tokens = generateTokens(decoded.id, decoded.role);

  // Rotate refresh token
  await pool.query(
    'UPDATE users SET refresh_token = ? WHERE id = ?',
    [tokens.refreshToken, decoded.id],
  );

  return tokens;
};

const getMe = async (userId) => {
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

const updateProfile = async (userId, updateData) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const allowedFields = ['name', 'phone', 'address'];
  const setClauses = [];
  const values = [];

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
      } else if (key !== 'address') {
        setClauses.push(`${key} = ?`);
        values.push(updateData[key]);
      }
    }
  }

  if (setClauses.length === 0) {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
    if (rows.length === 0) throw ApiError.notFound('User not found');
    return mapMysqlUserRow(rows[0]);
  }

  setClauses.push('updated_at = NOW()');
  values.push(userId);

  await pool.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`,
    values,
  );

  const [rows] = await pool.query('SELECT * FROM users WHERE id = ? LIMIT 1', [userId]);
  if (rows.length === 0) throw ApiError.notFound('User not found');
  return mapMysqlUserRow(rows[0]);
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query(
    'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  const isMatch = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!isMatch) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 12);
  const tokens = generateTokens(userId, rows[0].role);

  await pool.query(
    'UPDATE users SET password_hash = ?, password_changed_at = NOW(), refresh_token = ? WHERE id = ?',
    [newPasswordHash, tokens.refreshToken, userId],
  );

  return tokens;
};

const forgotPassword = async (email) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()],
  );

  if (rows.length === 0) {
    // Don't reveal whether user exists
    return null;
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  const resetExpires = new Date(Date.now() + 15 * 60 * 1000);

  await pool.query(
    'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
    [resetTokenHash, resetExpires, rows[0].id],
  );

  return { resetToken, user: mapMysqlUserRow(rows[0]) };
};

const resetPassword = async (token, newPassword) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW() LIMIT 1',
    [hashedToken],
  );

  if (rows.length === 0) {
    throw ApiError.badRequest('Token is invalid or has expired');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await pool.query(
    'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL, refresh_token = NULL WHERE id = ?',
    [passwordHash, rows[0].id],
  );

  const [updatedRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [rows[0].id],
  );

  return mapMysqlUserRow(updatedRows[0]);
};

const verifyEmail = async (token) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE email_verification_token = ? AND email_verification_expires > NOW() LIMIT 1',
    [hashedToken],
  );

  if (rows.length === 0) {
    throw ApiError.badRequest('Verification token is invalid or has expired');
  }

  await pool.query(
    'UPDATE users SET is_email_verified = 1, email_verification_token = NULL, email_verification_expires = NULL WHERE id = ?',
    [rows[0].id],
  );

  const [updatedRows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [rows[0].id],
  );

  return mapMysqlUserRow(updatedRows[0]);
};

const resendEmailVerification = async (userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool is not initialized');

  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = ? LIMIT 1',
    [userId],
  );

  if (rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  if (rows[0].is_email_verified) {
    throw ApiError.badRequest('Email is already verified');
  }

  const emailVerificationToken = crypto.randomBytes(32).toString('hex');
  const emailVerificationTokenHash = crypto
    .createHash('sha256')
    .update(emailVerificationToken)
    .digest('hex');
  const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await pool.query(
    'UPDATE users SET email_verification_token = ?, email_verification_expires = ? WHERE id = ?',
    [emailVerificationTokenHash, emailVerificationExpires, userId],
  );

  return { emailVerificationToken, user: mapMysqlUserRow(rows[0]) };
};

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendEmailVerification,
};