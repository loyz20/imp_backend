-- Insert default system admin user (cannot be deleted)

INSERT IGNORE INTO users (
  id,
  name,
  email,
  password_hash,
  role,
  is_active,
  is_email_verified,
  is_system_user,
  login_attempts,
  created_at,
  updated_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Admin',
  'admin@pbf.co.id',
  '$2b$12$xOHFaUOFUX1WeNfjsI2csuK1HbxvkI0Y0b0btQELDUhLIHr9r3qe.',
  'admin',
  1,
  1,
  1,
  0,
  NOW(),
  NOW()
);
