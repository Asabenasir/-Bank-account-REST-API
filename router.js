
import { Router } from "express";

// Authentication controllers
import {
    register,
    login
} from "./controllers/authController.js";

// Account controllers
import {
    createAccount,
    listAccounts,
    getAccountByNumber,
    getAccountHistory,
    getAccountSummary,
    depositAccount,
    withdrawAccount,
    transferAccount
} from "./controllers/accountController.js";

// Validation middleware
import { validate } from "./middleware/validate.js";

// Authentication middleware
import { authenticate } from "./middleware/authenticate.js";

// Authentication schemas
import {
    registerSchema,
    loginSchema
} from "./validators/authValidators.js";

// Account schemas
import {
    createAccountSchema,
    depositWithdrawSchema,
    transferSchema
} from "./validators/accountValidators.js";


const router = Router();


// AUTHENTICATION ROUTES

// User registration
router.post(
    "/auth/register",
    validate(registerSchema),
    register
);

// User login
router.post(
    "/auth/login",
    validate(loginSchema),
    login
);


// PROTECTED AUTHENTICATION ROUTE

// Retrieve authenticated customer information
router.get(
    "/auth/me",
    authenticate,
    (req, res) => {
        return res.status(200).json({
            message: "Authentication successful",
            user: req.user
        });
    }
);


// ACCOUNT MANAGEMENT ROUTES

// Create bank account
router.post(
    "/accounts",
    authenticate,
    validate(createAccountSchema),
    createAccount
);

// List authenticated customer's active accounts
router.get(
    "/accounts",
    authenticate,
    listAccounts
);

// Retrieve authenticated customer's account summary
router.get(
    "/accounts/summary",
    authenticate,
    getAccountSummary
);

// Retrieve account transaction history
router.get(
    "/accounts/:account_number/history",
    authenticate,
    getAccountHistory
);

// Retrieve individual bank account details
router.get(
    "/accounts/:account_number",
    authenticate,
    getAccountByNumber
);


// FINANCIAL TRANSACTION ROUTES

// Deposit into bank account
router.post(
    "/accounts/deposit",
    authenticate,
    validate(depositWithdrawSchema),
    depositAccount
);

// Withdraw from bank account
router.post(
    "/accounts/withdraw",
    authenticate,
    validate(depositWithdrawSchema),
    withdrawAccount
);

// Transfer between bank accounts
router.post(
    "/accounts/transfer",
    authenticate,
    validate(transferSchema),
    transferAccount
);


export default router;
