const { Payment, Appointment, Service, User, Staff } = require('../models');
const paymentService = require('../services/paymentService');

// POST /api/payments/create-intent
// Create payment intent/order for Stripe or Razorpay
exports.createPaymentIntent = async (req, res, next) => {
  try {
    const { appointmentId, provider = 'stripe' } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ message: 'appointmentId is required' });
    }

    if (!['stripe', 'razorpay', 'cashfree'].includes(provider)) {
      return res.status(400).json({ message: 'Provider must be "stripe", "razorpay", or "cashfree"' });
    }

    const appointment = await Appointment.findByPk(appointmentId, {
      include: [
        { model: Service, as: 'PrimaryService' },
        { model: Staff, as: 'PrimaryStaff' },
        { model: User },
        {
          model: require('../models').AppointmentService,
          as: 'AppointmentServices',
          include: [Service],
        },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Ensure the logged-in user owns this appointment (or is admin)
    if (req.user.role !== 'admin' && appointment.userId !== req.user.id) {
      return res.status(403).json({ message: 'You are not allowed to pay for this appointment' });
    }

    // Calculate total amount from all services
    let amount = 0;
    if (appointment.AppointmentServices && appointment.AppointmentServices.length > 0) {
      // Multiple services: sum all service prices
      amount = appointment.AppointmentServices.reduce((sum, aptService) => {
        return sum + parseFloat(aptService.Service.price || 0);
      }, 0);
    } else if (appointment.PrimaryService) {
      // Backward compatibility: single service
      amount = parseFloat(appointment.PrimaryService.price);
    } else {
      return res.status(500).json({ message: 'No services found for this appointment' });
    }

    // Check if payment already exists and is paid
    let payment = await Payment.findOne({ where: { appointmentId } });
    if (payment && payment.status === 'paid') {
      return res.json({
        message: 'Payment already completed',
        payment,
        appointment,
      });
    }

    try {
      let paymentData;

      if (provider === 'stripe') {
        // Create Stripe Payment Intent
        const stripeIntent = await paymentService.createStripePaymentIntent(amount, 'inr', {
          appointmentId: appointmentId.toString(),
          userId: req.user.id.toString(),
        });

        paymentData = {
          appointmentId,
          amount,
          currency: 'INR',
          provider: 'stripe',
          providerPaymentId: stripeIntent.paymentIntentId,
          status: 'pending',
        };

        // Create or update payment record
        if (!payment) {
          payment = await Payment.create(paymentData);
        } else {
          await payment.update(paymentData);
        }

        res.json({
          clientSecret: stripeIntent.clientSecret,
          paymentIntentId: stripeIntent.paymentIntentId,
          amount,
          currency: 'INR',
          provider: 'stripe',
          paymentId: payment.id,
        });
      } else if (provider === 'razorpay') {
        // Create Razorpay Order
        const orderId = `appt_${appointmentId}_${Date.now()}`;
        const razorpayOrder = await paymentService.createRazorpayOrder(
          amount,
          'INR',
          orderId
        );

        paymentData = {
          appointmentId,
          amount,
          currency: 'INR',
          provider: 'razorpay',
          providerPaymentId: razorpayOrder.orderId,
          status: 'pending',
        };

        // Create or update payment record
        if (!payment) {
          payment = await Payment.create(paymentData);
        } else {
          await payment.update(paymentData);
        }

        res.json({
          orderId: razorpayOrder.orderId,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          keyId: process.env.RAZORPAY_KEY_ID, // Frontend needs this for Razorpay checkout
          provider: 'razorpay',
          paymentId: payment.id,
        });
      } else if (provider === 'cashfree') {
        // Create Cashfree Payment Session
        const user = appointment.User;
        if (!user) {
          return res.status(500).json({ message: 'User details missing for appointment' });
        }

        // Check if user has phone number (required by Cashfree)
        if (!user.phone || user.phone.trim() === '') {
          return res.status(400).json({ 
            message: 'Phone number is required for payment. Please update your profile with a phone number before proceeding with payment.' 
          });
        }
        const orderId = `appt_${appointmentId}_${Date.now()}`;
        const cashfreeOrder = await paymentService.createCashfreePayment(
          amount,
          'INR',
          orderId,
          {
            phone: user.phone,
            email: user.email,
            name: user.name,
            customer_id: `user_${user.id}`,
            appointmentId: appointmentId.toString(),
          }
        );

        paymentData = {
          appointmentId,
          amount,
          currency: 'INR',
          provider: 'cashfree',
          providerPaymentId: cashfreeOrder.orderId,
          status: 'pending',
        };

        // Create or update payment record
        if (!payment) {
          payment = await Payment.create(paymentData);
        } else {
          await payment.update(paymentData);
        }

        res.json({
          orderId: cashfreeOrder.orderId,
          paymentSessionId: cashfreeOrder.paymentSessionId,
          amount: cashfreeOrder.amount,
          currency: cashfreeOrder.currency,
          appId: cashfreeOrder.appId, // Frontend needs this for Cashfree checkout
          testMode: cashfreeOrder.testMode,
          provider: 'cashfree',
          paymentId: payment.id,
        });
      }
    } catch (error) {
      console.error(`Error creating ${provider} payment:`, error);
      return res.status(500).json({
        message: `Failed to create ${provider} payment. Please check your ${provider.toUpperCase()} configuration.`,
        error: error.message,
      });
    }
  } catch (err) {
    next(err);
  }
};

// POST /api/payments/verify
// Verify payment after completion (for Razorpay or manual Stripe verification)
exports.verifyPayment = async (req, res, next) => {
  try {
    const { paymentId, provider, paymentIntentId, razorpayOrderId, razorpayPaymentId, razorpaySignature, cashfreeOrderId } = req.body;

    if (!paymentId) {
      return res.status(400).json({ message: 'paymentId is required' });
    }

    const payment = await Payment.findByPk(paymentId, {
      include: [
        {
          model: Appointment,
          include: [Service, Staff],
        },
      ],
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status === 'paid') {
      return res.json({ message: 'Payment already verified', payment });
    }

    try {
      if (provider === 'stripe' && paymentIntentId) {
        const verification = await paymentService.verifyStripePayment(paymentIntentId);
        if (verification.status === 'paid') {
          await payment.update({
            status: 'paid',
            providerPaymentId: paymentIntentId,
          });
          res.json({ message: 'Payment verified successfully', payment: await payment.reload() });
        } else {
          res.status(400).json({ message: 'Payment not completed yet' });
        }
      } else if (provider === 'razorpay' && razorpayOrderId && razorpayPaymentId && razorpaySignature) {
        const isValid = paymentService.verifyRazorpayPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature);
        if (isValid) {
          const razorpayPayment = await paymentService.getRazorpayPayment(razorpayPaymentId);
          if (razorpayPayment.status === 'paid') {
            await payment.update({
              status: 'paid',
              providerPaymentId: razorpayPaymentId,
            });
            res.json({ message: 'Payment verified successfully', payment: await payment.reload() });
          } else {
            res.status(400).json({ message: 'Payment not completed yet' });
          }
        } else {
          res.status(400).json({ message: 'Invalid payment signature' });
        }
      } else if (provider === 'cashfree' && cashfreeOrderId) {
        const verification = await paymentService.verifyCashfreePayment(cashfreeOrderId);
        if (verification.status === 'paid') {
          await payment.update({
            status: 'paid',
            providerPaymentId: verification.paymentId || cashfreeOrderId,
          });
          res.json({ message: 'Payment verified successfully', payment: await payment.reload() });
        } else {
          res.status(400).json({ message: 'Payment not completed yet' });
        }
      } else {
        res.status(400).json({ message: 'Invalid verification parameters' });
      }
    } catch (error) {
      console.error(`Error verifying ${provider} payment:`, error);
      res.status(500).json({ message: 'Payment verification failed', error: error.message });
    }
  } catch (err) {
    next(err);
  }
};

// POST /api/payments/webhook/stripe
// Stripe webhook endpoint (for automatic payment confirmation)
exports.stripeWebhook = async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(400).json({ message: 'Stripe webhook secret not configured' });
    }

    let event;
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const appointmentId = paymentIntent.metadata?.appointmentId;

      if (appointmentId) {
        const payment = await Payment.findOne({
          where: { providerPaymentId: paymentIntent.id },
        });

        if (payment && payment.status !== 'paid') {
          await payment.update({
            status: 'paid',
          });
          console.log(`Payment ${payment.id} marked as paid via Stripe webhook`);
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/payments/webhook/razorpay
// Razorpay webhook endpoint
exports.razorpayWebhook = async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      return res.status(400).json({ message: 'Razorpay webhook secret not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const paymentData = req.body.payload?.payment?.entity;

    if (event === 'payment.captured' && paymentData) {
      const payment = await Payment.findOne({
        where: { providerPaymentId: paymentData.order_id },
      });

      if (payment && payment.status !== 'paid') {
        await payment.update({
          status: 'paid',
          providerPaymentId: paymentData.id,
        });
        console.log(`Payment ${payment.id} marked as paid via Razorpay webhook`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/payments/webhook/cashfree
// Cashfree webhook endpoint
exports.cashfreeWebhook = async (req, res, next) => {
  try {
    if (!process.env.CASHFREE_SECRET_KEY) {
      return res.status(400).json({ message: 'Cashfree secret key not configured' });
    }

    const signature = req.headers['x-cf-signature'];
    const timestamp = req.headers['x-cf-timestamp'];
    const body = JSON.stringify(req.body);

    // Verify webhook signature (Cashfree uses HMAC SHA256)
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(timestamp + body)
      .digest('base64');

    if (signature !== expectedSignature) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const event = req.body;
    const orderId = event.data?.order?.order_id;
    const orderStatus = event.data?.order?.order_status;

    if (orderStatus === 'PAID' && orderId) {
      const payment = await Payment.findOne({
        where: { providerPaymentId: orderId },
      });

      if (payment && payment.status !== 'paid') {
        await payment.update({
          status: 'paid',
          providerPaymentId: event.data?.payment?.cf_payment_id || orderId,
        });
        console.log(`Payment ${payment.id} marked as paid via Cashfree webhook`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/payments (legacy - for mock/testing)
exports.createPayment = async (req, res, next) => {
  try {
    const { appointmentId, provider = 'stripe' } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ message: 'appointmentId is required' });
    }

    const appointment = await Appointment.findByPk(appointmentId, {
      include: [Service, Staff, User],
    });
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (req.user.role !== 'admin' && appointment.userId !== req.user.id) {
      return res.status(403).json({ message: 'You are not allowed to pay for this appointment' });
    }

    const service = appointment.Service;
    if (!service) {
      return res.status(500).json({ message: 'Service details missing for appointment' });
    }

    const amount = service.price;

    let payment = await Payment.findOne({ where: { appointmentId } });
    if (payment && payment.status === 'paid') {
      return res.json({ payment, appointment });
    }

    if (!payment) {
      payment = await Payment.create({
        appointmentId,
        amount,
        currency: 'INR',
        provider,
        providerPaymentId: `mock_${Date.now()}`,
        status: 'paid',
        invoiceUrl: null,
      });
    } else {
      await payment.update({
        amount,
        provider,
        status: 'paid',
      });
    }

    const paymentWithAppointment = await Payment.findByPk(payment.id, {
      include: [
        {
          model: Appointment,
          include: [Service, Staff],
        },
      ],
    });

    res.status(201).json({
      message: 'Payment successful (mock). Use /payments/create-intent for real payments.',
      payment: paymentWithAppointment,
    });
  } catch (err) {
    next(err);
  }
};
