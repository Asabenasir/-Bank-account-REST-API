import jwt from "jsonwebtoken";
import pool from "../db.js";

export const authenticate = async (req, res, next) => {
    // 1. Check the Authorization header.
    const authHeader = req.get("Authorization");

    if (!authHeader) {
        return res.status(401).json({
            error: "Authentication required"
        });
    }

    // 2. Extract the Bearer token.
    const match = authHeader.trim().match(
        /^Bearer\s+(\S+)$/i
    );

    if (!match) {
        return res.status(401).json({
            error: "Invalid authorization header"
        });
    }

    const token = match[1];

    // 3. Check JWT configuration.
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        console.error("JWT_SECRET is missing");

        return res.status(500).json({
            error: "Authentication service configuration error"
        });
    }

    // 4. Verify the JWT.
    let decoded;

    try {
        decoded = jwt.verify(token, jwtSecret, {
            algorithms: ["HS256"]
        });

    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                error: "Token has expired"
            });
        }

        if (
            error.name === "JsonWebTokenError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                error: "Invalid authentication token"
            });
        }

        console.error("JWT verification error:", error.message);

        return res.status(500).json({
            error: "Authentication failed"
        });
    }

    // 5. Validate the JWT subject.
    if (
    !Number.isSafeInteger(decoded.id) ||
    decoded.id <= 0
) {
    return res.status(401).json({
        error: "Invalid authentication token"
    });
}
    // 6. Retrieve the current customer from MySQL.
    try {
        const [users] = await pool.execute(
            `SELECT
                id,
                full_name,
                email,
                is_active
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [decoded.id]
        );

        const user = users[0];

        if (!user) {
            return res.status(401).json({
                error: "User account not found"
            });
        }

        // 7. Check current account status.
        if (Number(user.is_active) !== 1) {
            return res.status(403).json({
                error: "Account is inactive"
            });
        }

        // 8. Attach authenticated customer information.
        req.user = {
            id: user.id,
            full_name: user.full_name,
            email: user.email
        };

        // 9. Continue to the next middleware.
        return next();

    } catch (error) {
        console.error(
            "Authentication database error:",
            error.message
        );

        return res.status(500).json({
            error: "Unable to authenticate user"
        });
    }
};