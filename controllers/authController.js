import bcrypt from "bcrypt";
import pool from "../db.js";
import jwt from "jsonwebtoken";

// USER REGISTRATION

export const register = async (req, res) => {
    const { full_name, email, phone, password } = req.body;

    let connection;
    let transactionStarted = false;

    try {
        // 1. Check whether the email or phone already exists.
        const [existingUsers] = await pool.execute(
            `SELECT id
             FROM users
             WHERE email = ? OR phone = ?
             LIMIT 1`,
            [email, phone]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                error: "Email or phone number is already registered"
            });
        }

        // 2. Read bcrypt configuration.
        const saltRounds = Number(
            process.env.BCRYPT_SALT_ROUNDS || 10
        );

        if (
            !Number.isInteger(saltRounds) ||
            saltRounds < 4 ||
            saltRounds > 31
        ) {
            throw new Error("Invalid bcrypt salt configuration");
        }

        // 3. Hash the password before database insertion.
        const passwordHash = await bcrypt.hash(
            password,
            saltRounds
        );

        // 4. Acquire a dedicated database connection.
        connection = await pool.getConnection();

        // 5. Begin database transaction.
        await connection.beginTransaction();
        transactionStarted = true;

        // 6. Insert the new user.
        const [userResult] = await connection.execute(
            `INSERT INTO users (
                full_name,
                email,
                phone,
                password_hash
            ) VALUES (?, ?, ?, ?)`,
            [full_name, email, phone, passwordHash]
        );

        const userId = userResult.insertId;

        // 7. Record the registration event.
        await connection.execute(
            `INSERT INTO audit_log (
                user_id,
                action,
                ip_address
            ) VALUES (?, ?, ?)`,
            [userId, "register", req.ip]
        );

        // 8. Commit both database operations.
        await connection.commit();
        transactionStarted = false;

        // 9. Return public user information.
        return res.status(201).json({
            id: userId,
            full_name,
            email
        });

    } catch (error) {
        // Roll back database changes if an operation fails.
        if (connection && transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Rollback failed:",
                    rollbackError.message
                );
            }
        }

        // Handle duplicate records, including concurrent requests.
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "Email or phone number is already registered"
            });
        }

        console.error(
            "Registration error:",
            error.message
        );

        return res.status(500).json({
            error: "Registration failed"
        });

    } finally {
        // Always release the database connection.
        connection?.release();
    }
};

// USER LOGIN

export const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Retrieve the customer by email.
        const [users] = await pool.execute(
            `SELECT
                id,
                full_name,
                email,
                password_hash,
                is_active
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        const user = users[0];

        // 2. Reject unknown email addresses.
        if (!user) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        // 3. Compare submitted password with stored hash.
        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        // 4. Check whether the customer account is active.
        if (Number(user.is_active) !== 1) {
            return res.status(401).json({
                error: "Invalid email or password"
            });
        }

        // 5. Read JWT configuration.
        const jwtSecret = process.env.JWT_SECRET;
        const jwtExpiresIn = process.env.JWT_EXPIRES_IN;

        if (!jwtSecret || !jwtExpiresIn) {
            throw new Error(
                "JWT configuration is incomplete"
            );
        }

        // 6. Generate the authentication token.
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                full_name: user.full_name
            },
            jwtSecret,
            {
                expiresIn: jwtExpiresIn,
                algorithm: "HS256"
            }
        );

        // 7. Record the successful login.
        await pool.execute(
            `INSERT INTO audit_log (
                user_id,
                action,
                ip_address
            ) VALUES (?, ?, ?)`,
            [user.id, "login", req.ip]
        );

        // 8. Return the authentication response.
        return res.status(200).json({
            message: "Login successful",
            token,
            token_type: "Bearer",
            expires_in: jwtExpiresIn,
            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email
            }
        });

    } catch (error) {
        console.error(
            "Login error:",
            error.message
        );

        return res.status(500).json({
            error: "Login failed"
        });
    }
};