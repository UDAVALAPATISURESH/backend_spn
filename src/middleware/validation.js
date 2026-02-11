/**
 * Validation middleware for request validation
 */

const validate = (schema) => {
  return (req, res, next) => {
    const errors = {};

    // Validate body
    if (schema.body) {
      for (const [field, rules] of Object.entries(schema.body)) {
        const value = req.body[field];
        const error = validateField(value, rules, field);
        if (error) errors[field] = error;
      }
    }

    // Validate params
    if (schema.params) {
      for (const [field, rules] of Object.entries(schema.params)) {
        const value = req.params[field];
        const error = validateField(value, rules, field);
        if (error) errors[field] = error;
      }
    }

    // Validate query
    if (schema.query) {
      for (const [field, rules] of Object.entries(schema.query)) {
        const value = req.query[field];
        const error = validateField(value, rules, field);
        if (error) errors[field] = error;
      }
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        message: 'Validation failed',
        errors,
      });
    }

    next();
  };
};

const validateField = (value, rules, fieldName) => {
  // Required check
  if (rules.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
    return `${fieldName} is required`;
  }

  // Skip other validations if value is empty and not required
  if (!value && !rules.required) {
    return null;
  }

  // Type check
  if (rules.type) {
    if (rules.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return `${fieldName} must be a valid email`;
    }
    if (rules.type === 'number' && isNaN(Number(value))) {
      return `${fieldName} must be a number`;
    }
    if (rules.type === 'integer' && (!Number.isInteger(Number(value)) || isNaN(Number(value)))) {
      return `${fieldName} must be an integer`;
    }
    if (rules.type === 'date' && isNaN(new Date(value).getTime())) {
      return `${fieldName} must be a valid date`;
    }
  }

  // Min/Max length
  if (rules.minLength && value.length < rules.minLength) {
    return `${fieldName} must be at least ${rules.minLength} characters`;
  }
  if (rules.maxLength && value.length > rules.maxLength) {
    return `${fieldName} must be no more than ${rules.maxLength} characters`;
  }

  // Min/Max value
  if (rules.min !== undefined && Number(value) < rules.min) {
    return `${fieldName} must be at least ${rules.min}`;
  }
  if (rules.max !== undefined && Number(value) > rules.max) {
    return `${fieldName} must be no more than ${rules.max}`;
  }

  // Enum check
  if (rules.enum && !rules.enum.includes(value)) {
    return `${fieldName} must be one of: ${rules.enum.join(', ')}`;
  }

  // Custom validator
  if (rules.validator && typeof rules.validator === 'function') {
    const error = rules.validator(value);
    if (error) return error;
  }

  return null;
};

module.exports = { validate };
