-- Run manually in MySQL Workbench against the class development database.
-- Adds labeled UI test sales only. No existing rows are updated or removed.
USE Team11_DB;

-- Review the target and actual table definition first.
SELECT DATABASE() AS target_database;
SHOW CREATE TABLE reports_completedsale;

START TRANSACTION;

-- Each row is inserted only while the Driver is active, approved, and still
-- belongs to the intended Sponsor. Existing references are left unchanged.
-- Direct SQL bypasses Django's save(), so compute the exact 1% here explicitly.
INSERT INTO reports_completedsale (
    reference, sponsor_id, driver_id, gross_amount_usd,
    project_share_usd, completed_at, recorded_at
)
SELECT
    fixture.reference,
    fixture.sponsor_id,
    fixture.driver_id,
    fixture.gross_amount_usd,
    CAST(fixture.gross_amount_usd * 0.01 AS DECIMAL(14,4)),
    UTC_TIMESTAMP(6),
    UTC_TIMESTAMP(6)
FROM (
    SELECT 'S6-UI-QA-20261029-001' AS reference, 2 AS sponsor_id,
           3 AS driver_id, CAST(24.95 AS DECIMAL(12,2)) AS gross_amount_usd
    UNION ALL
    SELECT 'S6-UI-QA-20261029-002', 2, 3, CAST(15.05 AS DECIMAL(12,2))
    UNION ALL
    SELECT 'S6-UI-QA-20261029-003', 3, 4, CAST(100.00 AS DECIMAL(12,2))
    UNION ALL
    SELECT 'S6-UI-QA-20261029-004', 3, 5, CAST(0.01 AS DECIMAL(12,2))
) AS fixture
JOIN drivers_driver AS driver
    ON driver.id = fixture.driver_id
   AND driver.sponsor_id = fixture.sponsor_id
   AND driver.status = 'approved'
JOIN auth_user AS account
    ON account.id = driver.user_id AND account.is_active = 1
WHERE NOT EXISTS (
    SELECT 1 FROM reports_completedsale AS existing
    WHERE existing.reference = fixture.reference
);

SELECT ROW_COUNT() AS inserted_sales;

-- Inspect before committing. Expected fixture totals: 4 / 140.01 / 1.4001.
SELECT COUNT(*) AS fixture_sale_count,
       SUM(gross_amount_usd) AS fixture_gross_usd,
       SUM(project_share_usd) AS fixture_share_usd
FROM reports_completedsale
WHERE reference IN (
    'S6-UI-QA-20261029-001', 'S6-UI-QA-20261029-002',
    'S6-UI-QA-20261029-003', 'S6-UI-QA-20261029-004'
);

SELECT sponsor.name AS sponsor_name, driver.name AS driver_name,
       COUNT(*) AS sale_count, SUM(sale.gross_amount_usd) AS gross_sales_usd,
       SUM(sale.project_share_usd) AS project_share_usd
FROM reports_completedsale AS sale
JOIN accounts_sponsorcompany AS sponsor ON sponsor.id = sale.sponsor_id
JOIN drivers_driver AS driver ON driver.id = sale.driver_id
GROUP BY sale.sponsor_id, sponsor.name, sale.driver_id, driver.name
ORDER BY sponsor.name, driver.name;

-- Execute ONE of these separately after reviewing the results above:
-- COMMIT;
-- ROLLBACK;
