
-- Bank Account REST API
-- Database schema for MySQL 8.0.16
--
-- IMPORTANT:
--   This script DROPS and recreates the four application tables below.
--   Running it against an existing bank_api database deletes their existing
--   data. Use a disposable development database when testing this script.
--
--     mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS bank_api;"
--     mysql -u root -p bank_api < schema.sql
--
--   Alternatively, this file creates/selects bank_api when run without a
--   database argument:
--
--     mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS bank_api
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE bank_api;

-- Drop child tables before parent tables because of foreign-key dependencies.
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;

-- 1. USERS
-- Parent table for accounts and authentication audit events.

CREATE TABLE users (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(15) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,

    CONSTRAINT pk_users
        PRIMARY KEY (id),

    CONSTRAINT uq_users_email
        UNIQUE (email),

    CONSTRAINT uq_users_phone
        UNIQUE (phone),

    CONSTRAINT chk_users_is_active
        CHECK (is_active IN (0, 1)),

    -- The Joi validator also enforces 10-15 numeric characters.
    CONSTRAINT chk_users_phone_digits
        CHECK (REGEXP_LIKE(phone, '^[0-9]{10,15}$', 'c'))
)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;


-- 2. ACCOUNTS
-- Each account belongs to exactly one user.

CREATE TABLE accounts (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED NOT NULL,
    account_number  CHAR(10) NOT NULL,
    account_type    ENUM('savings', 'current', 'fixed') NOT NULL,
    balance         DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    currency        CHAR(3) NOT NULL DEFAULT 'NGN',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_accounts
        PRIMARY KEY (id),

    CONSTRAINT uq_accounts_account_number
        UNIQUE (account_number),

    CONSTRAINT chk_accounts_balance_nonnegative
        CHECK (balance >= 0.00),

    CONSTRAINT chk_accounts_is_active
        CHECK (is_active IN (0, 1)),

    -- RTRIM removes CHAR padding before the exact ten-digit check.
    -- The application must still generate account numbers securely and
    -- retry if the UNIQUE constraint reports a collision.
    CONSTRAINT chk_accounts_account_number_digits
        CHECK (REGEXP_LIKE(RTRIM(account_number), '^[0-9]{10}$', 'c')),

    -- The API validator also enforces a three-character uppercase code.
    CONSTRAINT chk_accounts_currency_format
        CHECK (REGEXP_LIKE(RTRIM(currency), '^[A-Z]{3}$', 'c')),

    CONSTRAINT fk_accounts_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    -- Supports a user's active-account count and active-account listing.
    -- user_id is the leading column, so this index also supports the FK.
    INDEX idx_accounts_user_active_created
        (user_id, is_active, created_at)
)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- 3. AUDIT_LOG
-- One row for each user registration or login event.

CREATE TABLE audit_log (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id         INT UNSIGNED NOT NULL,
    action          ENUM('register', 'login') NOT NULL,
    ip_address      VARCHAR(45) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_audit_log
        PRIMARY KEY (id),

    CONSTRAINT fk_audit_log_user
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    -- Supports retrieval of a user's audit events in time order and
    -- provides the leading user_id column required for the FK index.
    INDEX idx_audit_log_user_created
        (user_id, created_at)
)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- 4. TRANSACTIONS
-- A single transaction row represents a deposit, withdrawal, or transfer.
-- The source and destination columns reference accounts in different roles.

CREATE TABLE transactions (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    from_account_id     INT UNSIGNED NULL,
    to_account_id       INT UNSIGNED NULL,
    amount              DECIMAL(15, 2) NOT NULL,
    type                ENUM('deposit', 'withdrawal', 'transfer') NOT NULL,
    description         VARCHAR(255) NULL,
    reference           CHAR(36) NOT NULL,
    status              ENUM('pending', 'completed', 'failed') NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_transactions
        PRIMARY KEY (id),

    CONSTRAINT uq_transactions_reference
        UNIQUE (reference),

    CONSTRAINT chk_transactions_amount_positive
        CHECK (amount > 0.00),

    -- Enforce the source/destination rules from the assignment:
    -- deposit:    no source, destination required
    -- withdrawal: source required, no destination
    -- transfer:   both accounts required and they must be different
    CONSTRAINT chk_transactions_account_roles
        CHECK (
            (
                type = 'deposit'
                AND from_account_id IS NULL
                AND to_account_id IS NOT NULL
            )
            OR
            (
                type = 'withdrawal'
                AND from_account_id IS NOT NULL
                AND to_account_id IS NULL
            )
            OR
            (
                type = 'transfer'
                AND from_account_id IS NOT NULL
                AND to_account_id IS NOT NULL
                AND from_account_id <> to_account_id
            )
        ),

    CONSTRAINT fk_transactions_from_account
        FOREIGN KEY (from_account_id)
        REFERENCES accounts (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    CONSTRAINT fk_transactions_to_account
        FOREIGN KEY (to_account_id)
        REFERENCES accounts (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,

    -- Separate composite indexes support source- and destination-account
    -- history lookups and begin with their respective foreign-key columns.
    INDEX idx_transactions_from_created
        (from_account_id, created_at),

    INDEX idx_transactions_to_created
        (to_account_id, created_at)
)
ENGINE = InnoDB
DEFAULT CHARACTER SET = utf8mb4
COLLATE = utf8mb4_unicode_ci;

-- End of schema
