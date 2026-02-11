const { Appointment, User, Service, Staff, Review, Payment } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const emailService = require('../services/emailService');

// GET /api/admin/summary
exports.getSummary = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [totalAppointments, todayAppointments, monthAppointments, totalUsers, totalServices, totalStaff, totalReviews] = await Promise.all([
      Appointment.count(),
      Appointment.count({ where: { startTime: { [Op.gte]: today, [Op.lt]: tomorrow } } }),
      Appointment.count({ where: { startTime: { [Op.gte]: startOfMonth } } }),
      User.count({ where: { role: 'customer' } }),
      Service.count({ where: { isActive: true } }),
      Staff.count({ where: { isActive: true } }),
      Review.count(),
    ]);

    const monthPayments = await Payment.findAll({
      where: {
        status: 'paid',
        createdAt: { [Op.gte]: startOfMonth },
      },
      attributes: ['amount'],
    });

    const monthRevenue = monthPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    res.json({
      totalAppointments,
      todayAppointments,
      monthAppointments,
      totalUsers,
      totalServices,
      totalStaff,
      totalReviews,
      monthRevenue: monthRevenue.toFixed(2),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/appointments
exports.getAllAppointments = async (req, res, next) => {
  try {
    const { Payment, AppointmentService } = require('../models');
    const appointments = await Appointment.findAll({
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'price'] }, // Use alias for primary service
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name'] }, // Use alias for primary staff
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          include: [
            { model: Service, attributes: ['id', 'name', 'price', 'durationMinutes'] },
            { model: Staff, attributes: ['id', 'name'] },
          ],
        },
        { model: Payment, attributes: ['id', 'status', 'amount', 'provider', 'createdAt'] },
      ],
      order: [['startTime', 'DESC']],
    });
    res.json(appointments);
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/appointments/:id/confirm
// Admin approves a pending appointment and marks it as confirmed.
exports.confirmAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status === 'confirmed') {
      return res.status(400).json({ message: 'Appointment is already confirmed' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot confirm a cancelled appointment' });
    }

    // Check if payment is completed before allowing appointment confirmation
    const { Payment } = require('../models');
    const payment = await Payment.findOne({ where: { appointmentId: id } });
    if (!payment || payment.status !== 'paid') {
      return res.status(400).json({ 
        message: 'Cannot confirm appointment. Payment is required and must be completed first. Customer must complete online payment before appointment can be confirmed.' 
      });
    }

    // Update status to confirmed
    await appointment.update({ status: 'confirmed' });

    // Reload with full details (including associations and multiple services)
    const { AppointmentService } = require('../models');
    const updated = await Appointment.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          include: [
            { model: Service, attributes: ['id', 'name', 'durationMinutes', 'price'] },
            { model: Staff, attributes: ['id', 'name'] },
          ],
        },
      ],
    });

    // Send confirmation email/SMS after admin approval (non-blocking)
    const user = updated.User;
    const service = updated.PrimaryService || updated.Service;
    const staff = updated.PrimaryStaff || updated.Staff;

    if (user && service && staff) {
      emailService
        .sendBookingConfirmation(user, updated, service, staff)
        .catch((err) => console.error('Failed to send confirmation email:', err));

      // Also send invoice email with payment details
      const services = updated.AppointmentServices && updated.AppointmentServices.length > 0
        ? updated.AppointmentServices
        : null;
      const payment = await Payment.findOne({ where: { appointmentId: id } });
      if (payment) {
        emailService
          .sendPaymentInvoice(user, updated, payment, services)
          .catch((err) => console.error('Failed to send payment invoice email:', err));
      }

      if (user.phone) {
        const smsMessage = `Your appointment for ${service.name} with ${staff.name} is confirmed for ${new Date(
          updated.startTime
        ).toLocaleString()}.`;
        emailService.sendSMS(user.phone, smsMessage).catch((err) => {
          console.error('Failed to send SMS:', err);
        });
      }
    }

    res.json({
      message: 'Appointment confirmed successfully',
      appointment: updated,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/appointments/:id/verify-payment
// Admin manually verifies payment with payment gateway
exports.verifyPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const paymentService = require('../services/paymentService');
    const { Payment } = require('../models');

    const appointment = await Appointment.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Find payment record
    const payment = await Payment.findOne({ where: { appointmentId: id } });
    if (!payment) {
      return res.status(404).json({ message: 'No payment record found for this appointment' });
    }

    if (payment.status === 'paid') {
      return res.json({ message: 'Payment is already verified', payment });
    }

    // Verify payment based on provider
    try {
      let verification;
      if (payment.provider === 'cashfree' && payment.providerPaymentId) {
        verification = await paymentService.verifyCashfreePayment(payment.providerPaymentId);
      } else if (payment.provider === 'razorpay' && payment.providerPaymentId) {
        // For Razorpay, we need payment ID from the order
        verification = await paymentService.getRazorpayPayment(payment.providerPaymentId);
      } else if (payment.provider === 'stripe' && payment.providerPaymentId) {
        verification = await paymentService.verifyStripePayment(payment.providerPaymentId);
      } else {
        return res.status(400).json({ message: 'Cannot verify payment. Payment provider or ID missing.' });
      }

      if (verification.status === 'paid') {
        await payment.update({
          status: 'paid',
          providerPaymentId: verification.paymentId || payment.providerPaymentId,
        });

        const updatedPayment = await Payment.findByPk(payment.id);
        
        // Reload appointment with services for invoice email
        const { AppointmentService } = require('../models');
        const appointmentWithServices = await Appointment.findByPk(id, {
          include: [
            { model: User, attributes: ['id', 'name', 'email', 'phone'] },
            { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
            { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
            {
              model: AppointmentService,
              as: 'AppointmentServices',
              include: [
                { model: Service, attributes: ['id', 'name', 'durationMinutes', 'price'] },
                { model: Staff, attributes: ['id', 'name'] },
              ],
            },
          ],
        });

        // Send invoice email (non-blocking)
        if (appointmentWithServices && appointmentWithServices.User) {
          const services = appointmentWithServices.AppointmentServices && appointmentWithServices.AppointmentServices.length > 0
            ? appointmentWithServices.AppointmentServices
            : null;
          emailService
            .sendPaymentInvoice(appointmentWithServices.User, appointmentWithServices, updatedPayment, services)
            .catch((err) => console.error('Failed to send payment invoice email:', err));
        }

        return res.json({
          message: 'Payment verified successfully',
          payment: updatedPayment,
        });
      } else {
        return res.status(400).json({
          message: 'Payment verification failed. Payment status: ' + verification.status,
          payment,
        });
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      return res.status(500).json({
        message: 'Failed to verify payment with payment gateway',
        error: error.message,
      });
    }
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/appointments/:id/verify-and-confirm
// Admin verifies payment and confirms appointment in one click
exports.verifyAndConfirm = async (req, res, next) => {
  try {
    const { id } = req.params;
    const paymentService = require('../services/paymentService');
    const { Payment } = require('../models');

    const appointment = await Appointment.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status === 'confirmed') {
      return res.status(400).json({ message: 'Appointment is already confirmed' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot confirm a cancelled appointment' });
    }

    // Find and verify payment
    const payment = await Payment.findOne({ where: { appointmentId: id } });
    if (!payment) {
      return res.status(404).json({ message: 'No payment record found for this appointment' });
    }

    // Verify payment if not already paid
    if (payment.status !== 'paid') {
      try {
        let verification;
        if (payment.provider === 'cashfree' && payment.providerPaymentId) {
          verification = await paymentService.verifyCashfreePayment(payment.providerPaymentId);
        } else if (payment.provider === 'razorpay' && payment.providerPaymentId) {
          verification = await paymentService.getRazorpayPayment(payment.providerPaymentId);
        } else if (payment.provider === 'stripe' && payment.providerPaymentId) {
          verification = await paymentService.verifyStripePayment(payment.providerPaymentId);
        } else {
          return res.status(400).json({ message: 'Cannot verify payment. Payment provider or ID missing.' });
        }

        if (verification.status === 'paid') {
          await payment.update({
            status: 'paid',
            providerPaymentId: verification.paymentId || payment.providerPaymentId,
          });
        } else {
          return res.status(400).json({
            message: 'Payment verification failed. Payment status: ' + verification.status + '. Cannot confirm appointment.',
            payment,
          });
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({
          message: 'Failed to verify payment with payment gateway: ' + error.message,
        });
      }
    }

    // Reload payment to get updated status
    const updatedPayment = await Payment.findByPk(payment.id);
    if (updatedPayment.status !== 'paid') {
      return res.status(400).json({
        message: 'Payment is not paid. Cannot confirm appointment.',
        payment: updatedPayment,
      });
    }

    // Update appointment status to confirmed
    await appointment.update({ status: 'confirmed' });

    // Reload with full details including multiple services
    const { AppointmentService } = require('../models');
    const updated = await Appointment.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          include: [
            { model: Service, attributes: ['id', 'name', 'durationMinutes', 'price'] },
            { model: Staff, attributes: ['id', 'name'] },
          ],
        },
      ],
    });

    // Send confirmation email/SMS after admin approval (non-blocking)
    const user = updated.User;
    const service = updated.PrimaryService || updated.Service;
    const staff = updated.PrimaryStaff || updated.Staff;

    if (user && service && staff) {
      emailService
        .sendBookingConfirmation(user, updated, service, staff)
        .catch((err) => console.error('Failed to send confirmation email:', err));
      
      // Also send invoice email with payment details
      const services = updated.AppointmentServices && updated.AppointmentServices.length > 0
        ? updated.AppointmentServices
        : null;
      emailService
        .sendPaymentInvoice(user, updated, updatedPayment, services)
        .catch((err) => console.error('Failed to send payment invoice email:', err));

      if (user.phone) {
        const smsMessage = `Your appointment for ${service.name} with ${staff.name} is confirmed for ${new Date(
          updated.startTime
        ).toLocaleString()}.`;
        emailService.sendSMS(user.phone, smsMessage).catch((err) => {
          console.error('Failed to send SMS:', err);
        });
      }
    }

    res.json({
      message: 'Payment verified and appointment confirmed successfully',
      appointment: updated,
      payment: updatedPayment,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { role: 'customer' },
      attributes: ['id', 'name', 'email', 'phone', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/users/create - Create admin or customer user account
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, and password are required' });
    }

    // Validate role
    const validRoles = ['admin', 'customer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ message: 'role must be "admin" or "customer"' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email already exists',
        user: existingUser 
      });
    }

    // Create user account
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      passwordHash,
      phone: phone || null,
      role: role || 'customer',
    });

    res.status(201).json({
      message: `${role || 'Customer'} account created successfully`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users/all - Get all users (including admins)
exports.getAllUsersIncludingAdmins = async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'phone', 'role', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id - Update user account
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, password, phone, role } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent changing role of the last admin
    if (user.role === 'admin' && role && role !== 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot change role of the last admin account' });
      }
    }

    // Prevent changing non-admin users to admin (only allow creating admins via create endpoint)
    if (role === 'admin' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Cannot change user role to admin. Use create user function instead.' });
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['admin', 'customer', 'staff'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: 'role must be "admin", "customer", or "staff"' });
      }
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use by another user' });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.update(updateData);

    const updated = await User.findByPk(id, {
      attributes: ['id', 'name', 'email', 'phone', 'role', 'createdAt'],
    });

    res.json({
      message: 'User updated successfully',
      user: updated,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/users/:id - Delete user account
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deleting the last admin account
    if (user.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' } });
      if (adminCount <= 1) {
        return res.status(400).json({ message: 'Cannot delete the last admin account' });
      }
    }

    await user.destroy();

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/staff/create-user - Create user account for staff member
exports.createStaffUser = async (req, res, next) => {
  try {
    const { staffId, password } = req.body;

    if (!staffId || !password) {
      return res.status(400).json({ message: 'staffId and password are required' });
    }

    const staff = await Staff.findByPk(staffId);
    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    if (!staff.email) {
      return res.status(400).json({ message: 'Staff must have an email address to create a user account' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: staff.email } });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User account already exists for this email',
        user: existingUser 
      });
    }

    // Create user account
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: staff.name,
      email: staff.email,
      passwordHash,
      phone: staff.phone,
      role: 'staff',
    });

    res.status(201).json({
      message: 'Staff user account created successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
};
