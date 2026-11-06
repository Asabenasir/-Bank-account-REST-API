import {
    randomInt,
    randomUUID
} from "node:crypto";

import pool from "../db.js";


// ACCOUNT NUMBER GENERATOR

export const generateAccountNumber = () => {
    return String(
        randomInt(1_000_000_000, 10_000_000_000)
    );
};


// CREATE BANK ACCOUNT

export const createAccount = async (req, res) => {

    // 1. Retrieve validated request data.
    const {
        account_type,
        currency = "NGN"
    } = req.body;

    // 2. Obtain authenticated customer ID.
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    let connection;
    let transactionStarted = false;

    const maxAttempts = 5;

    try {
        // 3. Acquire a dedicated database connection.
        connection = await pool.getConnection();

        // 4. Begin database transaction.
        await connection.beginTransaction();
        transactionStarted = true;

        // 5. Lock the customer record.
        // Protects the three-active-account restriction
        // against simultaneous account creation requests.
        const [users] = await connection.execute(
            `SELECT id, is_active
             FROM users
             WHERE id = ?
             FOR UPDATE`,
            [userId]
        );

        const user = users[0];

        // 6. Confirm customer exists.
        if (!user) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(401).json({
                error: "User account not found"
            });
        }

        // 7. Confirm customer is active.
        if (Number(user.is_active) !== 1) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(403).json({
                error: "Account is inactive"
            });
        }

        // 8. Count active customer accounts.
        const [accountCounts] = await connection.execute(
            `SELECT COUNT(*) AS active_account_count
             FROM accounts
             WHERE user_id = ?
             AND is_active = 1`,
            [userId]
        );

        const activeCount = Number(
            accountCounts[0].active_account_count
        );

        // 9. Enforce the maximum of three active accounts.
        if (activeCount >= 3) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(400).json({
                error: "Maximum of 3 active accounts allowed"
            });
        }

        // 10. Generate and insert a unique account number.
        let accountNumber;
        let accountId;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            accountNumber = generateAccountNumber();

            try {
                const [result] = await connection.execute(
                    `INSERT INTO accounts (
                        user_id,
                        account_number,
                        account_type,
                        currency
                    ) VALUES (?, ?, ?, ?)`,
                    [
                        userId,
                        accountNumber,
                        account_type,
                        currency
                    ]
                );

                accountId = result.insertId;
                break;

            } catch (error) {
                // Retry only account number uniqueness collisions.
                const isDuplicateAccountNumber =
                    error.code === "ER_DUP_ENTRY" &&
                    (
                        error.message?.includes(
                            "uq_accounts_account_number"
                        ) ||
                        error.sqlMessage?.includes(
                            "uq_accounts_account_number"
                        )
                    );

                if (
                    !isDuplicateAccountNumber ||
                    attempt === maxAttempts
                ) {
                    throw error;
                }
            }
        }

        // 11. Retrieve the newly created account.
        const [createdAccounts] = await connection.execute(
            `SELECT
                id,
                account_number,
                account_type,
                balance,
                currency,
                is_active,
                created_at
             FROM accounts
             WHERE id = ?
             AND user_id = ?`,
            [accountId, userId]
        );

        const account = createdAccounts[0];

        if (!account) {
            throw new Error(
                "Created account could not be retrieved"
            );
        }

        // 12. Commit the transaction.
        await connection.commit();
        transactionStarted = false;

        // 13. Return the new account.
        return res.status(201).json({
            message: "Account created successfully",
            account
        });

    } catch (error) {

        // 14. Roll back database changes on failure.
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
                transactionStarted = false;
            } catch (rollbackError) {
                console.error(
                    "Account creation rollback failed:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Account creation error:",
            error.message
        );

        return res.status(500).json({
            error: "Account creation failed"
        });

    } finally {
        // 15. Always release the connection.
        connection?.release();
    }
};


// LIST CUSTOMER BANK ACCOUNTS

export const listAccounts = async (req, res) => {

    // 1. Obtain authenticated customer ID.
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    try {
        // 2. Retrieve customer's active accounts.
        // INNER JOIN retrieves the owner's full name.
        const [accounts] = await pool.execute(
            `SELECT
                a.id,
                a.account_number,
                a.account_type,
                a.balance,
                a.currency,
                a.created_at,
                u.full_name AS owner_name
             FROM accounts a
             INNER JOIN users u
                ON u.id = a.user_id
             WHERE a.user_id = ?
             AND a.is_active = 1
             ORDER BY a.created_at ASC`,
            [userId]
        );

        // 3. Return customer accounts.
        return res.status(200).json(accounts);

    } catch (error) {
        console.error(
            "Account listing error:",
            error.message
        );

        return res.status(500).json({
            error: "Unable to retrieve accounts"
        });
    }
};


// GET INDIVIDUAL BANK ACCOUNT DETAILS

export const getAccountByNumber = async (req, res) => {

    // 1. Obtain authenticated customer ID.
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    // 2. Retrieve account number from URL parameters.
    const { account_number } = req.params;

    // 3. Validate account number format.
    if (!/^[0-9]{10}$/.test(account_number)) {
        return res.status(400).json({
            error: "Account number must contain exactly 10 digits"
        });
    }

    try {
        // 4. Retrieve account details using INNER JOIN
        // and a correlated scalar subquery.
        const [accounts] = await pool.execute(
            `SELECT
                a.id,
                a.user_id,
                a.account_number,
                a.account_type,
                a.balance,
                a.currency,
                a.is_active,
                a.created_at,
                u.full_name AS owner_name,
                u.email AS owner_email,

                (
                    SELECT COUNT(*)
                    FROM transactions t
                    WHERE t.from_account_id = a.id
                       OR t.to_account_id = a.id
                ) AS total_transactions

             FROM accounts a

             INNER JOIN users u
                ON u.id = a.user_id

             WHERE a.account_number = ?

             LIMIT 1`,
            [account_number]
        );

        const account = accounts[0];

        // 5. Check whether account exists.
        if (!account) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        // 6. Verify account ownership.
        if (Number(account.user_id) !== userId) {
            return res.status(403).json({
                error: "You are not authorised to access this account"
            });
        }

        // 7. Exclude internal ownership ID.
        const {
            user_id,
            ...publicAccount
        } = account;

        // 8. Return account details.
        return res.status(200).json(publicAccount);

    } catch (error) {
        console.error(
            "Account retrieval error:",
            error.message
        );

        return res.status(500).json({
            error: "Unable to retrieve account details"
        });
    }
};


// DEPOSIT INTO BANK ACCOUNT

export const depositAccount = async (req, res) => {

    // 1. Obtain authenticated customer ID.
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    // 2. Retrieve validated request data.
    const {
        account_number,
        amount,
        description
    } = req.body;

    let connection;
    let transactionStarted = false;

    try {
        // 3. Acquire a dedicated database connection.
        connection = await pool.getConnection();

        // 4. Begin database transaction.
        await connection.beginTransaction();
        transactionStarted = true;

        // 5. Retrieve and lock the requested account.
        const [accounts] = await connection.execute(
            `SELECT
                id,
                user_id,
                account_number,
                balance,
                currency,
                is_active
             FROM accounts
             WHERE account_number = ?
             LIMIT 1
             FOR UPDATE`,
            [account_number]
        );

        const account = accounts[0];

        // 6. Check whether account exists.
        if (!account) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(404).json({
                error: "Account not found"
            });
        }

        // 7. Verify account ownership.
        if (Number(account.user_id) !== userId) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(403).json({
                error: "You are not authorised to access this account"
            });
        }

        // 8. Verify account status.
        if (Number(account.is_active) !== 1) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(400).json({
                error: "Cannot deposit into an inactive account"
            });
        }

        // 9. Increase account balance.
        const [updateResult] = await connection.execute(
            `UPDATE accounts
             SET balance = balance + ?
             WHERE id = ?
             AND is_active = 1`,
            [amount, account.id]
        );

        if (updateResult.affectedRows !== 1) {
            throw new Error("Account balance update failed");
        }

        // 10. Retrieve updated balance from MySQL.
        const [updatedAccounts] = await connection.execute(
            `SELECT balance
             FROM accounts
             WHERE id = ?`,
            [account.id]
        );

        const updatedBalance = updatedAccounts[0]?.balance;

        if (updatedBalance === undefined) {
            throw new Error("Updated account balance not found");
        }

        // 11. Generate unique transaction reference.
        const reference = randomUUID();

        // 12. Record the deposit.
        await connection.execute(
            `INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount,
                type,
                description,
                reference,
                status
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                null,
                account.id,
                amount,
                "deposit",
                description?.trim() || null,
                reference,
                "completed"
            ]
        );

        // 13. Commit both database operations.
        await connection.commit();
        transactionStarted = false;

        // 14. Return successful deposit response.
        return res.status(200).json({
            message: "Deposit successful",

            transaction: {
                reference,
                type: "deposit",
                amount,
                status: "completed"
            },

            account: {
                account_number: account.account_number,
                balance: updatedBalance,
                currency: account.currency
            }
        });

    } catch (error) {

        // 15. Roll back database changes on failure.
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
                transactionStarted = false;
            } catch (rollbackError) {
                console.error(
                    "Deposit rollback failed:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Deposit error:",
            error.message
        );

        return res.status(500).json({
            error: "Deposit failed"
        });

    } finally {
        // 16. Always release database connection.
        connection?.release();
    }
};


// WITHDRAW FROM BANK ACCOUNT

export const withdrawAccount = async (req, res) => {

    // 1. Obtain authenticated customer ID.
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    // 2. Retrieve validated request data.
    const {
        account_number,
        amount,
        description
    } = req.body;

    let connection;
    let transactionStarted = false;

    try {
        // 3. Acquire a dedicated database connection.
        connection = await pool.getConnection();

        // 4. Begin database transaction.
        await connection.beginTransaction();
        transactionStarted = true;

        // 5. Retrieve and lock the requested account.
        const [accounts] = await connection.execute(
            `SELECT
                id,
                user_id,
                account_number,
                balance,
                currency,
                is_active
             FROM accounts
             WHERE account_number = ?
             LIMIT 1
             FOR UPDATE`,
            [account_number]
        );

        const account = accounts[0];

        // 6. Verify account existence.
        if (!account) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(404).json({
                error: "Account not found"
            });
        }

        // 7. Verify account ownership.
        if (Number(account.user_id) !== userId) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(403).json({
                error: "You are not authorised to access this account"
            });
        }

        // 8. Verify account status.
        if (Number(account.is_active) !== 1) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(400).json({
                error: "Cannot withdraw from an inactive account"
            });
        }

        // 9. Deduct money only when sufficient funds exist.
        const [updateResult] = await connection.execute(
            `UPDATE accounts
             SET balance = balance - ?
             WHERE id = ?
             AND is_active = 1
             AND balance >= ?`,
            [
                amount,
                account.id,
                amount
            ]
        );

        // 10. Reject insufficient funds.
        if (updateResult.affectedRows !== 1) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(422).json({
                error: "Insufficient funds"
            });
        }

        // 11. Retrieve updated balance from MySQL.
        const [updatedAccounts] = await connection.execute(
            `SELECT balance
             FROM accounts
             WHERE id = ?`,
            [account.id]
        );

        const updatedBalance = updatedAccounts[0]?.balance;

        if (updatedBalance === undefined) {
            throw new Error("Updated account balance not found");
        }

        // 12. Generate unique transaction reference.
        const reference = randomUUID();

        // 13. Record the withdrawal.
        await connection.execute(
            `INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount,
                type,
                description,
                reference,
                status
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                account.id,
                null,
                amount,
                "withdrawal",
                description?.trim() || null,
                reference,
                "completed"
            ]
        );

        // 14. Commit database changes.
        await connection.commit();
        transactionStarted = false;

        // 15. Return successful withdrawal response.
        return res.status(200).json({
            message: "Withdrawal successful",

            transaction: {
                reference,
                type: "withdrawal",
                amount,
                status: "completed"
            },

            account: {
                account_number: account.account_number,
                balance: updatedBalance,
                currency: account.currency
            }
        });

    } catch (error) {

        // 16. Roll back database changes on failure.
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
                transactionStarted = false;
            } catch (rollbackError) {
                console.error(
                    "Withdrawal rollback failed:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Withdrawal error:",
            error.message
        );

        return res.status(500).json({
            error: "Withdrawal failed"
        });

    } finally {
        // 17. Always release database connection.
        connection?.release();
    }
};


// TRANSFER BETWEEN BANK ACCOUNTS

export const transferAccount = async (req, res) => {

    // 1. Obtain authenticated customer ID.
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    // 2. Retrieve validated request data.
    const {
        from_account_number,
        to_account_number,
        amount,
        description
    } = req.body;

    let connection;
    let transactionStarted = false;

    try {
        // 3. Acquire a dedicated database connection.
        connection = await pool.getConnection();

        // 4. Begin database transaction.
        await connection.beginTransaction();
        transactionStarted = true;

        // 5. Sort account numbers to establish
        // a consistent locking order.
        const accountNumbers = [
            from_account_number,
            to_account_number
        ].sort();

        const accountsByNumber = new Map();

        // 6. Lock both accounts in the same order.
        for (const accountNumber of accountNumbers) {

            const [accounts] = await connection.execute(
                `SELECT
                    id,
                    user_id,
                    account_number,
                    balance,
                    currency,
                    is_active
                 FROM accounts
                 WHERE account_number = ?
                 LIMIT 1
                 FOR UPDATE`,
                [accountNumber]
            );

            if (accounts[0]) {
                accountsByNumber.set(
                    accountNumber,
                    accounts[0]
                );
            }
        }

        // 7. Retrieve sender and receiver.
        const sender = accountsByNumber.get(
            from_account_number
        );

        const receiver = accountsByNumber.get(
            to_account_number
        );

        // 8. Check source account existence.
        if (!sender) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(404).json({
                error: "Source account not found"
            });
        }

        // 9. Check destination account existence.
        if (!receiver) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(404).json({
                error: "Destination account not found"
            });
        }

        // 10. Verify sender ownership.
        if (Number(sender.user_id) !== userId) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(403).json({
                error: "You are not authorised to transfer from this account"
            });
        }

        // 11. Check sender account status.
        if (Number(sender.is_active) !== 1) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(400).json({
                error: "Source account is inactive"
            });
        }

        // 12. Check receiver account status.
        if (Number(receiver.is_active) !== 1) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(400).json({
                error: "Destination account is inactive"
            });
        }

        // 13. Prevent unsupported currency conversion.
        if (sender.currency !== receiver.currency) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(400).json({
                error: "Transfers between different currencies are not supported"
            });
        }

        // 14. Debit the sender.
        // MySQL independently enforces sufficient funds.
        const [debitResult] = await connection.execute(
            `UPDATE accounts
             SET balance = balance - ?
             WHERE id = ?
             AND is_active = 1
             AND balance >= ?`,
            [
                amount,
                sender.id,
                amount
            ]
        );

        // 15. Reject insufficient funds.
        if (debitResult.affectedRows !== 1) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(422).json({
                error: "Insufficient funds"
            });
        }

        // 16. Credit the receiver.
        const [creditResult] = await connection.execute(
            `UPDATE accounts
             SET balance = balance + ?
             WHERE id = ?
             AND is_active = 1`,
            [
                amount,
                receiver.id
            ]
        );

        if (creditResult.affectedRows !== 1) {
            throw new Error(
                "Destination account credit failed"
            );
        }

        // 17. Generate unique transaction reference.
        const reference = randomUUID();

        // 18. Record the transfer.
        await connection.execute(
            `INSERT INTO transactions (
                from_account_id,
                to_account_id,
                amount,
                type,
                description,
                reference,
                status
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                sender.id,
                receiver.id,
                amount,
                "transfer",
                description?.trim() || null,
                reference,
                "completed"
            ]
        );

        // 19. Retrieve both updated balances.
        const [updatedAccounts] = await connection.execute(
            `SELECT
                id,
                account_number,
                balance,
                currency
             FROM accounts
             WHERE id IN (?, ?)`,
            [
                sender.id,
                receiver.id
            ]
        );

        const updatedAccountsById = new Map(
            updatedAccounts.map(account => [
                Number(account.id),
                account
            ])
        );

        const updatedSender = updatedAccountsById.get(
            Number(sender.id)
        );

        const updatedReceiver = updatedAccountsById.get(
            Number(receiver.id)
        );

        if (!updatedSender || !updatedReceiver) {
            throw new Error(
                "Updated account balances could not be retrieved"
            );
        }

        // 20. Commit all financial operations.
        await connection.commit();
        transactionStarted = false;

        // 21. Return successful transfer response.
        return res.status(200).json({
            message: "Transfer successful",

            transaction: {
                reference,
                type: "transfer",
                amount,
                status: "completed"
            },

            from_account: {
                account_number: updatedSender.account_number,
                balance: updatedSender.balance,
                currency: updatedSender.currency
            },

            to_account: {
                account_number: updatedReceiver.account_number,
                balance: updatedReceiver.balance,
                currency: updatedReceiver.currency
            }
        });

    } catch (error) {

        // 22. Roll back all financial changes on failure.
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
                transactionStarted = false;

            } catch (rollbackError) {
                console.error(
                    "Transfer rollback failed:",
                    rollbackError.message
                );
            }
        }

        console.error(
            "Transfer error:",
            error.message
        );

        return res.status(500).json({
            error: "Transfer failed"
        });

    } finally {

        // 23. Always release database connection.
        connection?.release();
    }
};

// GET ACCOUNT TRANSACTION HISTORY

export const getAccountHistory = async (req, res) => {

    // 1. Retrieve account number and authenticated user.
    const { account_number } = req.params;
    const userId = Number(req.user?.id);

    // 2. Read pagination parameters.
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    // 3. Validate pagination values.
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        return res.status(400).json({
            error: "Invalid pagination parameters"
        });
    }

    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
        return res.status(400).json({
            error: "Invalid pagination offset"
        });
    }

    try {

        // 4. Find the requested account.
        const [accounts] = await pool.execute(
            `SELECT
                id,
                user_id,
                account_number
             FROM accounts
             WHERE account_number = ?
             LIMIT 1`,
            [account_number]
        );

        const account = accounts[0];

        // 5. Check account existence.
        if (!account) {
            return res.status(404).json({
                error: "Account not found"
            });
        }

        // 6. Verify account ownership.
        if (Number(account.user_id) !== userId) {
            return res.status(403).json({
                error: "You are not authorised to view this account history"
            });
        }

        // 7. Count all transactions involving this account.
        const [countRows] = await pool.execute(
            `SELECT COUNT(*) AS total_transactions
             FROM transactions
             WHERE from_account_id = ?
             OR to_account_id = ?`,
            [account.id, account.id]
        );

        const totalTransactions = Number(
            countRows[0].total_transactions
        );

        // 8. Retrieve paginated transaction history.
        const [transactions] = await pool.execute(
            `SELECT
                t.id,
                t.reference,
                t.type,
                t.amount,
                t.description,
                t.status,
                t.created_at,

                fa.account_number AS from_account_number,
                fu.full_name AS from_owner_name,

                ta.account_number AS to_account_number,
                tu.full_name AS to_owner_name

             FROM transactions t

             LEFT JOIN accounts fa
                ON fa.id = t.from_account_id

             LEFT JOIN users fu
                ON fu.id = fa.user_id

             LEFT JOIN accounts ta
                ON ta.id = t.to_account_id

             LEFT JOIN users tu
                ON tu.id = ta.user_id

             WHERE t.from_account_id = ?
             OR t.to_account_id = ?

             ORDER BY t.created_at DESC, t.id DESC

             LIMIT ? OFFSET ?`,
            [
                account.id,
                account.id,
                limit,
                offset
            ]
        );

        // 9. Return transaction history.
        return res.status(200).json({
            account_number: account.account_number,

            pagination: {
                current_page: page,
                limit,
                total_transactions: totalTransactions,
                total_pages: Math.ceil(
                    totalTransactions / limit
                )
            },

            transactions
        });

    } catch (error) {

        console.error(
            "Transaction history error:",
            error.message
        );

        return res.status(500).json({
            error: "Unable to retrieve transaction history"
        });
    }
};

// GET AUTHENTICATED CUSTOMER ACCOUNT SUMMARY

export const getAccountSummary = async (req, res) => {

    // 1. Retrieve authenticated customer ID.
    const userId = Number(req.user?.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    try {

        // 2. Calculate account and transaction summaries.
        const [summaryRows] = await pool.execute(
            `SELECT
                u.full_name,
                u.email,

                COUNT(a.id) AS total_accounts,

                COALESCE(SUM(a.balance), 0.00)
                    AS total_balance,

                MAX(a.balance) AS highest_balance,

                MIN(a.balance) AS lowest_balance,

                (
                    SELECT COUNT(*)
                    FROM transactions t
                    INNER JOIN accounts src
                        ON src.id = t.from_account_id
                    WHERE src.user_id = u.id
                ) AS total_debits,

                (
                    SELECT COUNT(*)
                    FROM transactions t
                    INNER JOIN accounts dest
                        ON dest.id = t.to_account_id
                    WHERE dest.user_id = u.id
                ) AS total_credits

             FROM users u

             INNER JOIN accounts a
                ON a.user_id = u.id

             WHERE u.id = ?
             AND a.is_active = 1

             GROUP BY
                u.id,
                u.full_name,
                u.email`,
            [userId]
        );

        // 3. Retrieve the summary.
        const summary = summaryRows[0];

        // 4. Handle customers without active accounts.
        if (!summary) {
            return res.status(404).json({
                error: "No active accounts found"
            });
        }

        // 5. Return customer summary.
        return res.status(200).json({
            summary: {
                full_name: summary.full_name,
                email: summary.email,
                total_accounts: Number(summary.total_accounts),
                total_balance: summary.total_balance,
                highest_balance: summary.highest_balance,
                lowest_balance: summary.lowest_balance,
                total_debits: Number(summary.total_debits),
                total_credits: Number(summary.total_credits)
            }
        });

    } catch (error) {

        console.error(
            "Account summary error:",
            error.message
        );

        return res.status(500).json({
            error: "Unable to retrieve account summary"
        });
    }
};