
export const validate = (schema) => (req, res, next) => {
    // Validate the incoming request body.
    const { error, value } = schema.validate(req.body, {
        abortEarly: false,
        convert: true
    });

    // Return all validation errors.
    if (error) {
        const messages = error.details.map(
            (detail) => detail.message
        );

        return res.status(400).json({
            error: "Validation failed",
            details: messages
        });
    }

    // Replace the original body with validated data.
    req.body = value;

    // Continue to the next middleware or controller.
    next();
};
