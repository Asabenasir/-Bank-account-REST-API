
import Joi from "joi";

// Password must contain at least one uppercase letter,
// one digit, and one special character.
const passwordPattern = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9\s]).+$/;

// Registration validation schema
export const registerSchema = Joi.object({
    full_name: Joi.string()
        .trim()
        .min(2)
        .max(150)
        .required()
        .messages({
            "string.min": "Full name must contain at least 2 characters",
            "string.max": "Full name must not exceed 150 characters",
            "any.required": "Full name is required",
            "string.empty": "Full name cannot be empty"
        }),

    email: Joi.string()
        .trim()
        .lowercase()
        .email()
        .required()
        .messages({
            "string.email": "Please provide a valid email address",
            "any.required": "Email is required",
            "string.empty": "Email cannot be empty"
        }),

    phone: Joi.string()
        .pattern(/^[0-9]{10,15}$/)
        .required()
        .messages({
            "string.pattern.base": "Phone number must contain 10 to 15 digits only",
            "any.required": "Phone number is required",
            "string.empty": "Phone number cannot be empty"
        }),

    password: Joi.string()
        .min(8)
        .pattern(passwordPattern)
        .required()
        .messages({
            "string.min": "Password must contain at least 8 characters",
            "string.pattern.base":
                "Password must contain at least one uppercase letter, one digit and one special character",
            "any.required": "Password is required",
            "string.empty": "Password cannot be empty"
        }),

    confirm_password: Joi.string()
        .valid(Joi.ref("password"))
        .required()
        .messages({
            "any.only": "Confirm password must match password",
            "any.required": "Password confirmation is required",
            "string.empty": "Password confirmation cannot be empty"
        })
});

// Login validation schema
export const loginSchema = Joi.object({
    email: Joi.string()
        .trim()
        .lowercase()
        .email()
        .required()
        .messages({
            "string.email": "Please provide a valid email address",
            "any.required": "Email is required",
            "string.empty": "Email cannot be empty"
        }),

    password: Joi.string()
        .min(1)
        .required()
        .messages({
            "any.required": "Password is required",
            "string.empty": "Password cannot be empty"
        })
});
