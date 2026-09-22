USE Team11_DB;

SET @dev_password_hash = '<paste-django-password-hash-here>';

START TRANSACTION;

-- Sponsor organizations
INSERT INTO accounts_sponsorcompany (name, created_at)
VALUES
    ('Palmetto Freight', UTC_TIMESTAMP(6)),
    ('Blue Ridge Logistics', UTC_TIMESTAMP(6)),
    ('Upstate Haulers', UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Base Django users
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
VALUES
    -- Administrators
    (@dev_password_hash, NULL, 1, 'dev.admin1', 'Kylie', 'Gilbert',
     'dev.admin1@example.com', 1, 1, UTC_TIMESTAMP(6)),

    (@dev_password_hash, NULL, 1, 'dev.admin2', 'Team', 'Administrator',
     'dev.admin2@example.com', 1, 1, UTC_TIMESTAMP(6)),

    -- Sponsors
    (@dev_password_hash, NULL, 0, 'dev.palmetto', 'Dana', 'Whitfield',
     'dev.palmetto@example.com', 0, 1, UTC_TIMESTAMP(6)),

    (@dev_password_hash, NULL, 0, 'dev.blueridge', 'Robert', 'Kim',
     'dev.blueridge@example.com', 0, 1, UTC_TIMESTAMP(6)),

    -- Drivers
    (@dev_password_hash, NULL, 0, 'dev.malvarez', 'Marcus', 'Alvarez',
     'dev.malvarez@example.com', 0, 1, UTC_TIMESTAMP(6)),

    (@dev_password_hash, NULL, 0, 'dev.tgreene', 'Tasha', 'Greene',
     'dev.tgreene@example.com', 0, 1, UTC_TIMESTAMP(6)),

    (@dev_password_hash, NULL, 0, 'dev.lortega', 'Luis', 'Ortega',
     'dev.lortega@example.com', 0, 0, UTC_TIMESTAMP(6)),

    (@dev_password_hash, NULL, 0, 'dev.jpike', 'Jordan', 'Pike',
     'dev.jpike@example.com', 0, 1, UTC_TIMESTAMP(6))

-- Makes the seed repeatable without duplicating users.
ON DUPLICATE KEY UPDATE
    password = VALUES(password),
    first_name = VALUES(first_name),
    last_name = VALUES(last_name),
    email = VALUES(email),
    is_staff = VALUES(is_staff),
    is_superuser = VALUES(is_superuser),
    is_active = VALUES(is_active);

-- Connect sponsor users to sponsor organizations.
INSERT IGNORE INTO accounts_sponsoraccount (
    created_at,
    user_id,
    company_id
)
SELECT UTC_TIMESTAMP(6), u.id, c.id
FROM auth_user u
JOIN accounts_sponsorcompany c ON c.name = 'Palmetto Freight'
WHERE u.username = 'dev.palmetto';

INSERT IGNORE INTO accounts_sponsoraccount (
    created_at,
    user_id,
    company_id
)
SELECT UTC_TIMESTAMP(6), u.id, c.id
FROM auth_user u
JOIN accounts_sponsorcompany c ON c.name = 'Blue Ridge Logistics'
WHERE u.username = 'dev.blueridge';

-- Create driver profiles.
INSERT IGNORE INTO drivers_driver (
    name,
    status,
    user_id,
    sponsor_id
)
SELECT
    'Marcus Alvarez',
    'approved',
    u.id,
    c.id
FROM auth_user u
JOIN accounts_sponsorcompany c ON c.name = 'Palmetto Freight'
WHERE u.username = 'dev.malvarez';

INSERT IGNORE INTO drivers_driver (
    name,
    status,
    user_id,
    sponsor_id
)
SELECT
    'Tasha Greene',
    'approved',
    u.id,
    c.id
FROM auth_user u
JOIN accounts_sponsorcompany c ON c.name = 'Blue Ridge Logistics'
WHERE u.username = 'dev.tgreene';

-- Inactive driver for testing status display.
INSERT IGNORE INTO drivers_driver (
    name,
    status,
    user_id,
    sponsor_id
)
SELECT
    'Luis Ortega',
    'approved',
    u.id,
    c.id
FROM auth_user u
JOIN accounts_sponsorcompany c ON c.name = 'Blue Ridge Logistics'
WHERE u.username = 'dev.lortega';

-- Driver without a sponsor.
INSERT IGNORE INTO drivers_driver (
    name,
    status,
    user_id,
    sponsor_id
)
SELECT
    'Jordan Pike',
    'pending',
    u.id,
    NULL
FROM auth_user u
WHERE u.username = 'dev.jpike';

COMMIT;