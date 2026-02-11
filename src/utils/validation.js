/**
 * Backend validation utilities
 */

const validators = {
  required: (value, fieldName = 'Field') => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `${fieldName} is required`;
    }
    return null;
  },

  email: (value) => {
    if (!value) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return 'Invalid email format';
    }
    return null;
  },

  phone: (value) => {
    if (!value) return null;
    const cleaned = value.replace(/[\s\-\(\)]/g, '');
    if (cleaned.length < 10 || cleaned.length > 15) {
      return 'Phone number must be 10-15 digits';
    }
    return null;
  },

  minLength: (min) => (value, fieldName = 'Field') => {
    if (!value) return null;
    if (value.length < min) {
      return `${fieldName} must be at least ${min} characters`;
    }
    return null;
  },

  maxLength: (max) => (value, fieldName = 'Field') => {
    if (!value) return null;
    if (value.length > max) {
      return `${fieldName} must be no more than ${max} characters`;
    }
    return null;
  },

  min: (min) => (value, fieldName = 'Field') => {
    if (!value) return null;
    const num = parseFloat(value);
    if (isNaN(num) || num < min) {
      return `${fieldName} must be at least ${min}`;
    }
    return null;
  },

  max: (max) => (value, fieldName = 'Field') => {
    if (!value) return null;
    const num = parseFloat(value);
    if (isNaN(num) || num > max) {
      return `${fieldName} must be no more than ${max}`;
    }
    return null;
  },

  positive: (value, fieldName = 'Field') => {
    if (!value) return null;
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      return `${fieldName} must be a positive number`;
    }
    return null;
  },

  enum: (allowedValues) => (value, fieldName = 'Field') => {
    if (!value) return null;
    if (!allowedValues.includes(value)) {
      return `${fieldName} must be one of: ${allowedValues.join(', ')}`;
    }
    return null;
  },
};

/**
 * Validate a value against multiple validators
 */
const validate = (value, validatorsList, fieldName) => {
  for (const validator of validatorsList) {
    const error = typeof validator === 'function' 
      ? validator(value, fieldName)
      : validators[validator](value, fieldName);
    if (error) return error;
  }
  return null;
};

/**
 * Validate request body
 */
const validateRequest = (data, schema) => {
  const errors = {};
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const fieldValidators = Array.isArray(rules) ? rules : [rules];
    const error = validate(value, fieldValidators, field);
    if (error) {
      errors[field] = error;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
};

module.exports = { validators, validate, validateRequest };
