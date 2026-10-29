-- Additional class-development demo records. Review, run, then COMMIT separately.
-- No existing records are updated. Repeated runs skip matching fixture records.
-- Adds up to 90 sales, 24 products, and 9 point transactions.
-- Requires the reports and catalog migrations on Team11_DB before running.
USE Team11_DB;
SELECT DATABASE() AS target_database;
START TRANSACTION;

-- Thirty varied transactions per approved, active Driver over thirty days.
INSERT INTO reports_completedsale (
    reference, sponsor_id, driver_id, gross_amount_usd,
    project_share_usd, completed_at, recorded_at
)
SELECT fixture.reference, fixture.sponsor_id, fixture.driver_id,
       fixture.amount, CAST(fixture.amount * 0.01 AS DECIMAL(14,4)),
       DATE_SUB(UTC_TIMESTAMP(6), INTERVAL fixture.day_number DAY), UTC_TIMESTAMP(6)
FROM (
    SELECT CONCAT('S6-DEMO-V2-D', driver.id, '-N', LPAD(numbers.n, 2, '0')) AS reference,
           driver.id AS driver_id, driver.sponsor_id,
           numbers.n AS day_number,
           CAST(CASE MOD(numbers.n, 10)
               WHEN 0 THEN 0.00 WHEN 1 THEN 0.01 WHEN 2 THEN 24.95
               WHEN 3 THEN 49.99 WHEN 4 THEN 125.50 WHEN 5 THEN 8.75
               WHEN 6 THEN 349.95 WHEN 7 THEN 19.99 WHEN 8 THEN 75.00
               ELSE 1299.99 END AS DECIMAL(12,2)) AS amount
    FROM drivers_driver AS driver
    JOIN auth_user AS account ON account.id = driver.user_id AND account.is_active = 1
    CROSS JOIN (
        SELECT tens.n * 10 + units.n AS n
        FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2) AS tens
        CROSS JOIN (
            SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
            UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
            UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
        ) AS units
    ) AS numbers
    WHERE (driver.id = 3 AND driver.sponsor_id = 2
        OR driver.id IN (4,5) AND driver.sponsor_id = 3)
      AND driver.status = 'approved'
) AS fixture
WHERE NOT EXISTS (
    SELECT 1 FROM reports_completedsale AS existing WHERE existing.reference = fixture.reference
);
SELECT ROW_COUNT() AS inserted_sales;

-- Products include affordable, expensive, free, and unavailable examples.
-- Fixture names are used as the repeat-run key because products have no fixture ID.
INSERT INTO catalog_catalogproduct (
    sponsor_id, name, description, image_url, price_usd,
    is_available, created_at, updated_at
)
SELECT sponsor.id, product.name, product.description, '', product.price,
       CASE WHEN product.name = '[Demo S6] Winter jacket' AND MOD(sponsor.id, 2) = 0
            THEN 0 ELSE product.available END,
       UTC_TIMESTAMP(6), UTC_TIMESTAMP(6)
FROM accounts_sponsorcompany AS sponsor
CROSS JOIN (
    SELECT '[Demo S6] Travel mug' AS name,
           'An insulated travel mug for long days on the road.' AS description,
           CAST(24.95 AS DECIMAL(12,2)) AS price, 1 AS available
    UNION ALL SELECT '[Demo S6] Winter jacket',
           'A warm jacket. This reward intentionally costs more than the sample balance.', 349.95, 1
    UNION ALL SELECT '[Demo S6] Safety handbook',
           'A zero-point reward for checking the free-product presentation.', 0.00, 1
    UNION ALL SELECT '[Demo S6] Insulated lunch bag',
           'Keeps a meal cool during a long shift.', 18.50, 1
    UNION ALL SELECT '[Demo S6] Roadside safety kit',
           'A compact kit with a flashlight and reflective supplies.', 74.99, 1
    UNION ALL SELECT '[Demo S6] Weekend getaway voucher',
           'A high-value reward for long-term safe driving.', 899.00, 0
) AS product
WHERE sponsor.id IN (1,2,3,4)
AND NOT EXISTS (
    SELECT 1 FROM catalog_catalogproduct AS existing
    WHERE existing.sponsor_id = sponsor.id AND existing.name = product.name
);
SELECT ROW_COUNT() AS inserted_products;

-- Add point-history examples; net balance increase is 2,550 per Driver.
-- changed_by_user_id=NULL honestly identifies these as SQL fixtures rather
-- than attributing actions to an actual Sponsor account.
INSERT INTO drivers_pointtransaction (
    driver_id, sponsor_id, changed_by_user_id, point_change, reason, changed_at
)
SELECT driver.id, driver.sponsor_id, NULL, adjustment.amount,
       adjustment.reason, DATE_SUB(UTC_TIMESTAMP(6), INTERVAL adjustment.days_ago DAY)
FROM drivers_driver AS driver
JOIN auth_user AS account ON account.id = driver.user_id AND account.is_active = 1
CROSS JOIN (
    SELECT 2000 AS amount, '[Demo S6 v2] Safe-driving milestone' AS reason, 7 AS days_ago
    UNION ALL SELECT 750, '[Demo S6 v2] On-time delivery award', 3
    UNION ALL SELECT -200, '[Demo S6 v2] Training correction', 1
) AS adjustment
WHERE (driver.id = 3 AND driver.sponsor_id = 2
    OR driver.id IN (4,5) AND driver.sponsor_id = 3)
  AND driver.status = 'approved'
  AND NOT EXISTS (
      SELECT 1 FROM drivers_pointtransaction AS existing
      WHERE existing.driver_id = driver.id
        AND existing.sponsor_id = driver.sponsor_id
        AND existing.reason = adjustment.reason
  );
SELECT ROW_COUNT() AS inserted_point_transactions;

-- Review inserted sale totals and verify the exact fee before committing.
SELECT COUNT(*) AS demo_sales, SUM(gross_amount_usd) AS demo_gross_usd,
       SUM(project_share_usd) AS demo_share_usd,
       SUM(project_share_usd <> gross_amount_usd * 0.01) AS incorrect_share_rows
FROM reports_completedsale
WHERE reference LIKE 'S6-DEMO-V2-D%';

SELECT sponsor.name AS sponsor_name, COUNT(*) AS demo_products,
       SUM(product.is_available = 0) AS unavailable_products
FROM catalog_catalogproduct AS product
JOIN accounts_sponsorcompany AS sponsor ON sponsor.id = product.sponsor_id
WHERE product.name LIKE '[Demo S6] %'
GROUP BY sponsor.id, sponsor.name
ORDER BY sponsor.name;

SELECT driver.name, sponsor.name AS sponsor_name,
       SUM(points.point_change) AS current_point_balance
FROM drivers_driver AS driver
JOIN accounts_sponsorcompany AS sponsor ON sponsor.id = driver.sponsor_id
LEFT JOIN drivers_pointtransaction AS points ON points.driver_id = driver.id
WHERE driver.id IN (3,4,5)
GROUP BY driver.id, driver.name, sponsor.name;

-- Run ONE separately after inspecting the output:
-- COMMIT;
-- ROLLBACK;
