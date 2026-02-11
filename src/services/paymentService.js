const crypto = require('crypto');

// Try to load Stripe (gracefully handle if not installed)
let stripe = null;
let stripeClient = null;
try {
  stripe = require('stripe');
  // Initialize Stripe (if API key is provided)
  stripeClient = process.env.STRIPE_SECRET_KEY
    ? stripe(process.env.STRIPE_SECRET_KEY)
    : null;
} catch (error) {
  console.warn('Stripe module not installed. Stripe payment features will be unavailable.');
  console.warn('To enable Stripe, run: npm install stripe');
}

/**
 * Create Stripe Payment Intent
 */
exports.createStripePaymentIntent = async (amount, currency = 'inr', metadata = {}) => {
  if (!stripeClient) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in environment variables.');
  }

  try {
    // Convert amount to cents (Stripe uses smallest currency unit)
    // For INR, amount is in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(parseFloat(amount) * 100);

    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: amountInPaise,
      currency: currency.toLowerCase(),
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error('Stripe payment intent creation error:', error);
    throw error;
  }
};

/**
 * Verify Stripe Payment Intent
 */
exports.verifyStripePayment = async (paymentIntentId) => {
  if (!stripeClient) {
    throw new Error('Stripe is not configured');
  }

  try {
    const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
    return {
      status: paymentIntent.status === 'succeeded' ? 'paid' : 'pending',
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100, // Convert from paise to INR
    };
  } catch (error) {
    console.error('Stripe payment verification error:', error);
    throw error;
  }
};

/**
 * Create Razorpay Order
 */
exports.createRazorpayOrder = async (amount, currency = 'INR', receipt = null) => {
  let Razorpay;
  try {
    Razorpay = require('razorpay');
  } catch (error) {
    throw new Error('Razorpay module not installed. Please run: npm install razorpay');
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in environment variables.');
  }

  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Amount in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(parseFloat(amount) * 100);

    const options = {
      amount: amountInPaise,
      currency: currency.toUpperCase(),
      receipt: receipt || `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    return {
      orderId: order.id,
      amount: order.amount / 100, // Convert from paise to INR
      currency: order.currency,
    };
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    throw error;
  }
};

/**
 * Verify Razorpay Payment Signature
 */
exports.verifyRazorpayPayment = (razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  // Razorpay module not needed for signature verification (uses crypto)

  if (!process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const crypto = require('crypto');
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    return generatedSignature === razorpaySignature;
  } catch (error) {
    console.error('Razorpay signature verification error:', error);
    return false;
  }
};

/**
 * Get Razorpay Payment Details
 */
exports.getRazorpayPayment = async (paymentId) => {
  let Razorpay;
  try {
    Razorpay = require('razorpay');
  } catch (error) {
    throw new Error('Razorpay module not installed. Please run: npm install razorpay');
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const payment = await razorpay.payments.fetch(paymentId);

    return {
      status: payment.status === 'authorized' || payment.status === 'captured' ? 'paid' : 'pending',
      paymentId: payment.id,
      amount: payment.amount / 100, // Convert from paise to INR
      orderId: payment.order_id,
    };
  } catch (error) {
    console.error('Razorpay payment fetch error:', error);
    throw error;
  }
};

/**
 * Create Cashfree Payment Session
 */
exports.createCashfreePayment = async (amount, currency = 'INR', orderId = null, customerDetails = {}) => {
  if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY) {
    throw new Error('Cashfree is not configured. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in environment variables.');
  }

  try {
    const axios = require('axios');
    const testMode = process.env.TEST_MODE === 'true' || process.env.TEST_MODE === true;
    const baseUrl = testMode 
      ? 'https://sandbox.cashfree.com/pg' 
      : 'https://api.cashfree.com/pg';

    // Cashfree expects amount in base currency units (e.g., INR), NOT in paise
    const orderAmount = Math.round(parseFloat(amount) * 100) / 100; // ensure two decimals
    const order_id = orderId || `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate customer phone (required by Cashfree)
    const customerPhone = customerDetails.phone || customerDetails.customer_phone || '';
    if (!customerPhone || customerPhone.trim() === '') {
      throw new Error('Customer phone number is required for Cashfree payment. Please update your profile with a phone number.');
    }

    // Format phone number (remove spaces, ensure it starts with country code if needed)
    const formattedPhone = customerPhone.replace(/\s+/g, '').replace(/^\+?91/, ''); // Remove +91 if present, Cashfree will add it
    const finalPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone; // Add country code if 10 digits

    const requestData = {
      order_id,
      order_amount: orderAmount,
      order_currency: currency.toUpperCase(),
      order_note: `Appointment payment - Order ${order_id}`,
      customer_details: {
        customer_id: customerDetails.customer_id || `customer_${Date.now()}`,
        customer_phone: finalPhone,
        customer_email: customerDetails.email || customerDetails.customer_email || '',
        customer_name: customerDetails.name || customerDetails.customer_name || '',
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?order_id={order_id}&appointmentId=${customerDetails.appointmentId || ''}`,
        notify_url: `${process.env.BACKEND_URL || 'http://localhost:4000'}/api/payments/webhook/cashfree`,
      },
    };

    const response = await axios.post(`${baseUrl}/orders`, requestData, {
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'x-api-version': '2022-09-01',
        'Content-Type': 'application/json',
      },
    });

    return {
      orderId: response.data.order_id,
      paymentSessionId: response.data.payment_session_id,
      amount: response.data.order_amount, // Already in INR
      currency: response.data.order_currency,
      appId: process.env.CASHFREE_APP_ID, // Frontend needs this
      testMode,
    };
  } catch (error) {
    console.error('Cashfree payment creation error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to create Cashfree payment session');
  }
};

/**
 * Verify Cashfree Payment
 */
exports.verifyCashfreePayment = async (orderId) => {
  if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY) {
    throw new Error('Cashfree is not configured');
  }

  try {
    const axios = require('axios');
    const testMode = process.env.TEST_MODE === 'true' || process.env.TEST_MODE === true;
    const baseUrl = testMode 
      ? 'https://sandbox.cashfree.com/pg' 
      : 'https://api.cashfree.com/pg';

    const response = await axios.get(`${baseUrl}/orders/${orderId}`, {
      headers: {
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
        'x-api-version': '2022-09-01',
      },
    });

    const order = response.data;
    return {
      status: order.order_status === 'PAID' ? 'paid' : 'pending',
      orderId: order.order_id,
      amount: order.order_amount, // Already in INR (not paise)
      paymentId: order.payment_details?.cf_payment_id || null,
    };
  } catch (error) {
    console.error('Cashfree payment verification error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to verify Cashfree payment');
  }
};
