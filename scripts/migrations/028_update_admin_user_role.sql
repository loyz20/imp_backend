-- Update default admin user role from superadmin to admin
-- This migration handles the role change after removing superadmin from system

UPDATE users SET role = 'admin' WHERE email = 'admin@pbf.co.id' AND role = 'superadmin';
