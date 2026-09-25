# Good Driver Incentive Program Database ERD

This document reflects the tables, columns, keys, and relationships currently deployed in `Team11_DB`. It is based on the MySQL Workbench schema exports and the corresponding Django models and migrations.

## Application data model

This view emphasizes the tables used directly by application features. Django's `auth_user` table is included because application profiles and security records reference it.

```mermaid
erDiagram
    AUTH_USER {
        int id PK
        varchar password
        datetime last_login "nullable"
        boolean is_superuser
        varchar username UK
        varchar first_name
        varchar last_name
        varchar email "not unique"
        boolean is_staff
        boolean is_active
        datetime date_joined
    }

    ACCOUNTS_SPONSORCOMPANY {
        bigint id PK
        varchar name UK
        datetime created_at
        boolean driver_mfa_required
    }

    ACCOUNTS_SPONSORACCOUNT {
        bigint id PK
        datetime created_at
        int user_id FK, UK
        bigint company_id FK
    }

    DRIVERS_DRIVER {
        bigint id PK
        varchar name
        varchar status
        bigint sponsor_id FK "nullable"
        int user_id FK, UK
        varchar profile_picture "nullable"
    }

    ACCOUNTS_MFASETTINGS {
        bigint id PK
        blob totp_secret_encrypted "nullable"
        boolean totp_enabled
        boolean email_enabled
        boolean sms_enabled
        varchar phone_number "nullable"
        datetime created_at
        datetime updated_at
        int user_id FK, UK
    }

    ACCOUNTS_MFACODE {
        bigint id PK
        varchar purpose
        varchar method
        varchar code_hash
        datetime created_at
        datetime expires_at
        smallint attempts
        boolean used
        int user_id FK
    }

    ACCOUNTS_DRIVERNOTIFICATION {
        bigint id PK
        varchar message
        boolean read
        datetime created_at
        bigint driver_id FK
    }

    ACCOUNTS_LOGINATTEMPT {
        bigint id PK
        varchar username "submitted value; no FK"
        datetime timestamp
        boolean successful
    }

    ABOUT_PAGE_ABOUTPAGERELEASE {
        bigint id PK
        smallint team_number
        varchar version_number UK
        date release_date
        varchar product_name
        text product_description
        datetime created_at
        datetime updated_at
    }

    AUTH_USER ||--o| DRIVERS_DRIVER : "has driver profile"
    AUTH_USER ||--o| ACCOUNTS_SPONSORACCOUNT : "has sponsor account"
    AUTH_USER ||--o| ACCOUNTS_MFASETTINGS : "has MFA settings"
    AUTH_USER ||--o{ ACCOUNTS_MFACODE : "receives MFA codes"
    ACCOUNTS_SPONSORCOMPANY ||--o{ ACCOUNTS_SPONSORACCOUNT : "employs"
    ACCOUNTS_SPONSORCOMPANY o|--o{ DRIVERS_DRIVER : "sponsors"
    DRIVERS_DRIVER ||--o{ ACCOUNTS_DRIVERNOTIFICATION : "receives"
```

`accounts_loginattempt` deliberately stores a submitted username rather than a foreign key so failed attempts for nonexistent usernames can be recorded. `about_page_aboutpagerelease` is currently independent of the other application tables.

## Complete physical database

This view adds Django's authorization, administration, migration, content-type, and session infrastructure. It represents all 18 tables currently present in the database.

```mermaid
erDiagram
    AUTH_USER {
        int id PK
        varchar password
        datetime last_login "nullable"
        boolean is_superuser
        varchar username UK
        varchar first_name
        varchar last_name
        varchar email
        boolean is_staff
        boolean is_active
        datetime date_joined
    }

    AUTH_GROUP {
        int id PK
        varchar name UK
    }

    AUTH_PERMISSION {
        int id PK
        varchar name
        int content_type_id FK
        varchar codename
    }

    AUTH_USER_GROUPS {
        bigint id PK
        int user_id FK
        int group_id FK
    }

    AUTH_USER_USER_PERMISSIONS {
        bigint id PK
        int user_id FK
        int permission_id FK
    }

    AUTH_GROUP_PERMISSIONS {
        bigint id PK
        int group_id FK
        int permission_id FK
    }

    DJANGO_CONTENT_TYPE {
        int id PK
        varchar app_label
        varchar model
    }

    DJANGO_ADMIN_LOG {
        int id PK
        datetime action_time
        text object_id "nullable"
        varchar object_repr
        smallint action_flag
        text change_message
        int content_type_id FK "nullable"
        int user_id FK
    }

    DJANGO_MIGRATIONS {
        bigint id PK
        varchar app
        varchar name
        datetime applied
    }

    DJANGO_SESSION {
        varchar session_key PK
        text session_data
        datetime expire_date
    }

    ACCOUNTS_SPONSORCOMPANY {
        bigint id PK
        varchar name UK
        datetime created_at
        boolean driver_mfa_required
    }

    ACCOUNTS_SPONSORACCOUNT {
        bigint id PK
        datetime created_at
        int user_id FK, UK
        bigint company_id FK
    }

    DRIVERS_DRIVER {
        bigint id PK
        varchar name
        varchar status
        bigint sponsor_id FK "nullable"
        int user_id FK, UK
        varchar profile_picture "nullable"
    }

    ACCOUNTS_MFASETTINGS {
        bigint id PK
        blob totp_secret_encrypted "nullable"
        boolean totp_enabled
        boolean email_enabled
        boolean sms_enabled
        varchar phone_number "nullable"
        datetime created_at
        datetime updated_at
        int user_id FK, UK
    }

    ACCOUNTS_MFACODE {
        bigint id PK
        varchar purpose
        varchar method
        varchar code_hash
        datetime created_at
        datetime expires_at
        smallint attempts
        boolean used
        int user_id FK
    }

    ACCOUNTS_DRIVERNOTIFICATION {
        bigint id PK
        varchar message
        boolean read
        datetime created_at
        bigint driver_id FK
    }

    ACCOUNTS_LOGINATTEMPT {
        bigint id PK
        varchar username
        datetime timestamp
        boolean successful
    }

    ABOUT_PAGE_ABOUTPAGERELEASE {
        bigint id PK
        smallint team_number
        varchar version_number UK
        date release_date
        varchar product_name
        text product_description
        datetime created_at
        datetime updated_at
    }

    AUTH_USER ||--o| DRIVERS_DRIVER : "has driver profile"
    AUTH_USER ||--o| ACCOUNTS_SPONSORACCOUNT : "has sponsor account"
    AUTH_USER ||--o| ACCOUNTS_MFASETTINGS : "has MFA settings"
    AUTH_USER ||--o{ ACCOUNTS_MFACODE : "receives MFA codes"
    ACCOUNTS_SPONSORCOMPANY ||--o{ ACCOUNTS_SPONSORACCOUNT : "employs"
    ACCOUNTS_SPONSORCOMPANY o|--o{ DRIVERS_DRIVER : "sponsors"
    DRIVERS_DRIVER ||--o{ ACCOUNTS_DRIVERNOTIFICATION : "receives"

    AUTH_USER ||--o{ AUTH_USER_GROUPS : "belongs through"
    AUTH_GROUP ||--o{ AUTH_USER_GROUPS : "contains through"
    AUTH_USER ||--o{ AUTH_USER_USER_PERMISSIONS : "receives through"
    AUTH_PERMISSION ||--o{ AUTH_USER_USER_PERMISSIONS : "assigned through"
    AUTH_GROUP ||--o{ AUTH_GROUP_PERMISSIONS : "receives through"
    AUTH_PERMISSION ||--o{ AUTH_GROUP_PERMISSIONS : "assigned through"
    DJANGO_CONTENT_TYPE ||--o{ AUTH_PERMISSION : "classifies"
    DJANGO_CONTENT_TYPE o|--o{ DJANGO_ADMIN_LOG : "classifies"
    AUTH_USER ||--o{ DJANGO_ADMIN_LOG : "performs"
```

## Composite unique constraints and indexes

Mermaid ER diagrams cannot fully express every composite index, so these constraints supplement the diagrams:

| Table | Columns | Constraint or index |
| --- | --- | --- |
| `accounts_mfacode` | `user_id`, `purpose`, `used` | Non-unique composite index |
| `auth_group_permissions` | `group_id`, `permission_id` | Composite unique constraint |
| `auth_permission` | `content_type_id`, `codename` | Composite unique constraint |
| `auth_user_groups` | `user_id`, `group_id` | Composite unique constraint |
| `auth_user_user_permissions` | `user_id`, `permission_id` | Composite unique constraint |
| `django_content_type` | `app_label`, `model` | Composite unique constraint |
| `django_session` | `expire_date` | Non-unique index |

Foreign-key indexes and single-column unique indexes are shown by `FK` and `UK` markers in the diagrams.

## Scope

The following proposed entities from the earlier WIP diagram are not currently deployed and are intentionally excluded from the current-state ERD:

- Admin user profile
- Driver application
- Purchase order
- Order item
- Catalog item
- Point transaction
- Audit user

They should be maintained separately in a future-state or planned-schema diagram until corresponding Django models and migrations are implemented.
