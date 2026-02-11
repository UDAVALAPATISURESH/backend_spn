const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

require('dotenv').config();

const app = express();

app.use(cors());
app.use(morgan('dev'));

// Stripe webhook needs raw body for signature verification
// Handle it before JSON parser
app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));

// For all other routes, use JSON parser
app.use(express.json());

app.use('/api', routes);

app.use(errorHandler);

module.exports = app;

