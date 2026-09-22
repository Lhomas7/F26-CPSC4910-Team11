-- Promote an existing Django user to a Team 11 administrator.
-- Review the selected row before running the UPDATE.

USE Team11_DB;

SET @admin_username = 'existing.username';

SELECT id, username, email, is_staff, is_superuser, is_active
FROM auth_user
WHERE username = @admin_username;

START TRANSACTION;

UPDATE auth_user
SET is_staff = 1,
    is_superuser = 1,
    is_active = 1
WHERE username = @admin_username;

-- affected_rows must be 1. Roll back and inspect the username otherwise.
SELECT ROW_COUNT() AS affected_rows;

COMMIT;
