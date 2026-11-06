import Joi from "joi";

// Account creation validation schema
export const createAccountSchema = Joi.object({

    // Account type validation
    account_type: Joi.string()
        .valid("savings", "current", "fixed")
        .required()
        .messages({
            "any.only": "Account type must be savings, current or fixed",
            "any.required": "Account type is required",
            "string.empty": "Account type cannot be empty"
        }),

    // Currency validation
    currency: Joi.string()
        .length(3)
        .uppercase()
        .pattern(/^[A-Z]{3}$/)
        .default("NGN")
        .messages({
            "string.length": "Currency must contain exactly 3 characters",
            "string.pattern.base": "Currency must contain exactly 3 uppercase letters"
        })

});

// DEPOSIT AND WITHDRAWAL VALIDATION SCHEMA

export const depositWithdrawSchema = Joi.object({

    // Account number must contain exactly 10 digits.
    account_number: Joi.string()
        .pattern(/^[0-9]{10}$/)
        .required()
        .messages({
            "string.pattern.base":
                "Account number must contain exactly 10 digits",
            "any.required":
                "Account number is required",
            "string.empty":
                "Account number cannot be empty"
        }),

    // Transaction amount must be positive
    // and contain no more than two decimal places.
    amount: Joi.number()
        .greater(0)
        .precision(2)
        .strict()
        .required()
        .messages({
            "number.base":
                "Amount must be a number",
            "number.greater":
                "Amount must be greater than zero",
            "number.precision":
                "Amount must not exceed 2 decimal places",
            "any.required":
                "Amount is required"
        }),

    // Optional transaction description.
    description: Joi.string()
        .trim()
        .max(255)
        .allow("")
        .optional()
        .messages({
            "string.max":
                "Description must not exceed 255 characters"
        })

});


// TRANSFER VALIDATION SCHEMA

export const transferSchema = Joi.object({

    // Sending account number.
    from_account_number: Joi.string()
        .pattern(/^[0-9]{10}$/)
        .required()
        .messages({
            "string.pattern.base":
                "Source account number must contain exactly 10 digits",
            "any.required":
                "Source account number is required"
        }),

    // Receiving account number.
    // Must differ from the sending account.
    to_account_number: Joi.string()
        .pattern(/^[0-9]{10}$/)
        .invalid(Joi.ref("from_account_number"))
        .required()
        .messages({
            "string.pattern.base":
                "Destination account number must contain exactly 10 digits",
            "any.invalid":
                "Source and destination accounts must be different",
            "any.required":
                "Destination account number is required"
        }),

    // Transfer amount.
    amount: Joi.number()
        .greater(0)
        .precision(2)
        .strict()
        .required()
        .messages({
            "number.base":
                "Amount must be a number",
            "number.greater":
                "Amount must be greater than zero",
            "number.precision":
                "Amount must not exceed 2 decimal places",
            "any.required":
                "Amount is required"
        }),

    // Optional transfer description.
    description: Joi.string()
        .trim()
        .max(255)
        .allow("")
        .optional()
        .messages({
            "string.max":
                "Description must not exceed 255 characters"
        })

});