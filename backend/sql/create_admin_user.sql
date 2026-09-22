-- Create a Team 11 Django administrator directly in MySQL.
--
-- Generate @password_hash with Django before running this script:
--   python manage.py shell -c "from getpass import getpass; from django.contrib.auth.hashers import make_password; print(make_password(getpass('Password: ')))"
--
-- Never put the plaintext password or the completed hash in Git.

USE Team11_DB;

SET @admin_username = 'team11.admin';
SET @admin_email = 'admin@example.com';
SET @admin_first_name = 'Team 11';
SET @admin_last_name = 'Administrator';
SET @password_hash = '<paste-django-password-hash-here>';

START TRANSACTION;

INSERT INTO auth_user (
    password,
    last_login,
    is_superuser,
    username,
    first_name,
    last_name,
    email,
    is_staff,
    is_active,
    date_joined
)
SELECT
    @password_hash,
    NULL,
    1,
    @admin_username,
    @admin_first_name,
    @admin_last_name,
    @admin_email,
    1,
    1,
    UTC_TIMESTAMP(6)
WHERE NOT EXISTS (
    SELECT 1 FROM auth_user WHERE username = @admin_username
);

-- affected_rows must be 1. A value of 0 means the username already exists.
SELECT ROW_COUNT() AS affected_rows;
SELECT id, username, email, is_staff, is_superuser, is_active
FROM auth_user
WHERE username = @admin_username;

COMMIT;
