const db = require('../models');
const { Appointment, Service, Staff, User, StaffAvailability, Review, AppointmentService } = db;
const { Op } = require('sequelize');
const emailService = require('../services/emailService');

// GET /api/appointments/my
exports.myAppointments = async (req, res, next) => {
  try {
    const appointments = await Appointment.findAll({
      where: { userId: req.user.id },
      include: [
        { model: Service, as: 'PrimaryService' },
        { model: Staff, as: 'PrimaryStaff' },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          include: [Service, Staff],
        },
      ],
      order: [['startTime', 'ASC']],
    });

    // Get reviews for each service in each appointment
    const appointmentsWithReviews = await Promise.all(
      appointments.map(async (appointment) => {
        const appointmentData = appointment.toJSON();
        
        // Get reviews for each service in the appointment
        if (appointmentData.AppointmentServices && appointmentData.AppointmentServices.length > 0) {
          const servicesWithReviews = await Promise.all(
            appointmentData.AppointmentServices.map(async (aptService) => {
              const review = await Review.findOne({
                where: {
                  userId: req.user.id,
                  appointmentId: appointment.id,
                  serviceId: aptService.serviceId,
                },
                include: [
                  { model: User, attributes: ['id', 'name'] },
                  { model: Staff, attributes: ['id', 'name', 'specialization'] },
                ],
              });
              return {
                ...aptService,
                Review: review,
              };
            })
          );
          appointmentData.AppointmentServices = servicesWithReviews;
        } else {
          // Backward compatibility: single service appointment
          const review = await Review.findOne({
            where: {
              userId: req.user.id,
              appointmentId: appointment.id,
              serviceId: appointment.serviceId,
            },
            include: [
              { model: User, attributes: ['id', 'name'] },
              { model: Staff, attributes: ['id', 'name', 'specialization'] },
            ],
          });
          appointmentData.Review = review;
        }

        return appointmentData;
      })
    );

    res.json(appointmentsWithReviews);
  } catch (err) {
    next(err);
  }
};

// GET /api/appointments/staff/my - Get appointments for logged-in staff member
exports.myStaffAppointments = async (req, res, next) => {
  try {
    // Find staff member by matching email with user email
    const staff = await Staff.findOne({
      where: { email: req.user.email },
    });

    if (!staff) {
      return res.status(404).json({ 
        message: 'Staff profile not found. Please contact admin to link your account to a staff profile.' 
      });
    }

    // Get all appointments where this staff is assigned to any service
    const appointments = await Appointment.findAll({
      include: [
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name'] },
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          where: { staffId: staff.id }, // Only services assigned to this staff
          required: false, // LEFT JOIN to include appointments even if no matching services
          include: [
            { model: Service, attributes: ['id', 'name', 'durationMinutes', 'price'] },
            { model: Staff, attributes: ['id', 'name'] },
          ],
        },
      ],
      order: [['startTime', 'ASC']],
    });

    // Filter to only appointments where this staff has services assigned
    const filteredAppointments = appointments.filter(apt => 
      apt.AppointmentServices && apt.AppointmentServices.length > 0
    );

    // Get reviews for each service
    const appointmentsWithReviews = await Promise.all(
      appointments.map(async (appointment) => {
        const review = await Review.findOne({
          where: {
            serviceId: appointment.serviceId,
            staffId: appointment.staffId,
            userId: appointment.userId,
          },
          include: [
            { model: User, attributes: ['id', 'name'] },
            { model: Staff, attributes: ['id', 'name'] },
          ],
        });

        return {
          ...appointment.toJSON(),
          Review: review,
        };
      })
    );

    res.json({
      staff: {
        id: staff.id,
        name: staff.name,
        specialization: staff.specialization,
      },
      appointments: appointmentsWithReviews,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/appointments
// Creates a new appointment in "pending" status with one or more services.
// Admin must later confirm the appointment from the admin panel.
// Body: { services: [{ serviceId, staffId }], startTime, notes }
// OR (backward compatible): { serviceId, staffId, startTime, notes }
exports.createAppointment = async (req, res, next) => {
  try {
    const { services, serviceId, staffId, startTime, notes } = req.body;

    // Support both new format (array of services) and old format (single service)
    let servicesList = [];
    if (services && Array.isArray(services) && services.length > 0) {
      servicesList = services;
    } else if (serviceId && staffId) {
      // Backward compatibility: single service
      servicesList = [{ serviceId, staffId }];
    } else {
      return res.status(400).json({ message: 'services array (or serviceId/staffId) and startTime are required' });
    }

    if (!startTime) {
      return res.status(400).json({ message: 'startTime is required' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const start = new Date(startTime);
    let totalDuration = 0;
    const serviceDetails = [];

    // Validate all services and calculate total duration
    for (const svc of servicesList) {
      if (!svc.serviceId || !svc.staffId) {
        return res.status(400).json({ message: 'Each service must have serviceId and staffId' });
      }

      const service = await Service.findByPk(svc.serviceId);
      const staff = await Staff.findByPk(svc.staffId);

      if (!service) return res.status(404).json({ message: `Service ${svc.serviceId} not found` });
      if (!staff) return res.status(404).json({ message: `Staff ${svc.staffId} not found` });

      // Check if staff can perform this service
      const staffService = await db.StaffService.findOne({
        where: { staffId: svc.staffId, serviceId: svc.serviceId },
      });
      if (!staffService) {
        return res.status(400).json({ message: `Staff ${staff.name} is not assigned to service ${service.name}` });
      }

      serviceDetails.push({ service, staff, serviceId: svc.serviceId, staffId: svc.staffId });
      totalDuration += service.durationMinutes;
    }

    const end = new Date(start.getTime() + totalDuration * 60000);

    // Check availability for all staff members
    const dayOfWeek = start.getDay();
    for (const detail of serviceDetails) {
      const availability = await StaffAvailability.findOne({
        where: { staffId: detail.staffId, dayOfWeek },
      });

      if (availability) {
        const [availStartHour, availStartMin] = availability.startTime.split(':').map(Number);
        const [availEndHour, availEndMin] = availability.endTime.split(':').map(Number);

        const availStart = new Date(start);
        availStart.setHours(availStartHour, availStartMin, 0, 0);

        const availEnd = new Date(start);
        availEnd.setHours(availEndHour, availEndMin, 0, 0);

        if (start < availStart || end > availEnd) {
          return res.status(400).json({
            message: `${detail.staff.name} is only available from ${availability.startTime} to ${availability.endTime} on this day`,
          });
        }
      }

      // Check for conflicting appointments for each staff
      const conflictingAppointment = await Appointment.findOne({
        where: {
          staffId: detail.staffId,
          status: { [Op.ne]: 'cancelled' },
          [Op.or]: [
            { startTime: { [Op.between]: [start, end] } },
            { endTime: { [Op.between]: [start, end] } },
            {
              [Op.and]: [
                { startTime: { [Op.lte]: start } },
                { endTime: { [Op.gte]: end } },
              ],
            },
          ],
        },
      });

      if (conflictingAppointment) {
        return res.status(400).json({ message: `${detail.staff.name} has a conflicting appointment at this time` });
      }
    }

    // Use first service/staff as primary for backward compatibility
    const primaryService = serviceDetails[0];
    const appointment = await Appointment.create({
      userId: req.user.id,
      serviceId: primaryService.serviceId,
      staffId: primaryService.staffId,
      startTime: start,
      endTime: end,
      status: 'pending',
      notes: notes || null,
    });

    // Create AppointmentService records for each service
    let currentServiceStart = new Date(start);
    const appointmentServices = [];

    for (const detail of serviceDetails) {
      const serviceStart = new Date(currentServiceStart);
      const serviceEnd = new Date(serviceStart.getTime() + detail.service.durationMinutes * 60000);

      const appointmentService = await db.AppointmentService.create({
        appointmentId: appointment.id,
        serviceId: detail.serviceId,
        staffId: detail.staffId,
        startTime: serviceStart,
        endTime: serviceEnd,
        status: 'pending',
      });

      appointmentServices.push(appointmentService);
      currentServiceStart = serviceEnd; // Next service starts when previous ends
    }

    const appointmentWithDetails = await Appointment.findByPk(appointment.id, {
      include: [
        { model: db.Service, as: 'PrimaryService' },
        { model: db.Staff, as: 'PrimaryStaff' },
        { model: db.AppointmentService, as: 'AppointmentServices', include: [db.Service, db.Staff] },
      ],
    });

    res.status(201).json(appointmentWithDetails);
  } catch (err) {
    next(err);
  }
};

// PUT /api/appointments/:id/reschedule
exports.rescheduleAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { startTime } = req.body;

    if (!startTime) {
      return res.status(400).json({ message: 'startTime is required' });
    }

    const appointment = await Appointment.findByPk(id, {
      include: [Service, Staff],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check if user owns this appointment (or is admin)
    if (appointment.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only reschedule your own appointments' });
    }

    // Policy: Can't reschedule if appointment is less than 24 hours away
    const appointmentTime = new Date(appointment.startTime);
    const now = new Date();
    const hoursUntilAppointment = (appointmentTime - now) / (1000 * 60 * 60);

    const MIN_RESCHEDULE_HOURS = process.env.MIN_RESCHEDULE_HOURS || 24;
    if (hoursUntilAppointment < MIN_RESCHEDULE_HOURS) {
      return res.status(400).json({
        message: `Appointments can only be rescheduled at least ${MIN_RESCHEDULE_HOURS} hours in advance`,
      });
    }

    // Policy: Can't reschedule cancelled or completed appointments
    if (appointment.status === 'cancelled' || appointment.status === 'completed') {
      return res.status(400).json({
        message: `Cannot reschedule ${appointment.status} appointments`,
      });
    }

    const service = await Service.findByPk(appointment.serviceId);
    const staff = await Staff.findByPk(appointment.staffId);

    const newStart = new Date(startTime);
    const newEnd = new Date(newStart.getTime() + service.durationMinutes * 60000);

    // Check if staff is available at new time
    const dayOfWeek = newStart.getDay();
    const availability = await StaffAvailability.findOne({
      where: { staffId: appointment.staffId, dayOfWeek },
    });

    if (availability) {
      const [availStartHour, availStartMin] = availability.startTime.split(':').map(Number);
      const [availEndHour, availEndMin] = availability.endTime.split(':').map(Number);

      const availStart = new Date(newStart);
      availStart.setHours(availStartHour, availStartMin, 0, 0);

      const availEnd = new Date(newStart);
      availEnd.setHours(availEndHour, availEndMin, 0, 0);

      if (newStart < availStart || newEnd > availEnd) {
        return res.status(400).json({
          message: `Staff is only available from ${availability.startTime} to ${availability.endTime} on this day`,
        });
      }
    }

    // Check for conflicting appointments (excluding current appointment)
    const conflictingAppointment = await Appointment.findOne({
      where: {
        staffId: appointment.staffId,
        id: { [Op.ne]: id },
        status: { [Op.ne]: 'cancelled' },
        [Op.or]: [
          {
            startTime: { [Op.between]: [newStart, newEnd] },
          },
          {
            endTime: { [Op.between]: [newStart, newEnd] },
          },
          {
            [Op.and]: [
              { startTime: { [Op.lte]: newStart } },
              { endTime: { [Op.gte]: newEnd } },
            ],
          },
        ],
      },
    });

    if (conflictingAppointment) {
      return res.status(400).json({ message: 'This time slot is already booked' });
    }

    // Update appointment
    await appointment.update({
      startTime: newStart,
      endTime: newEnd,
    });

    const updatedAppointment = await Appointment.findByPk(id, {
      include: [Service, Staff, User],
    });

    // Send rescheduling confirmation email
    const user = await User.findByPk(appointment.userId);
    emailService.sendBookingConfirmation(user, updatedAppointment, service, staff).catch((err) => {
      console.error('Failed to send rescheduling email:', err);
    });

    res.json({
      message: 'Appointment rescheduled successfully',
      appointment: updatedAppointment,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/appointments/:id/complete-service/:serviceId - Mark individual service as completed (staff only)
exports.completeService = async (req, res, next) => {
  try {
    const { id, serviceId } = req.params;

    const appointment = await Appointment.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          where: { serviceId: parseInt(serviceId) },
          include: [Service, Staff],
        },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const appointmentService = appointment.AppointmentServices?.[0];
    if (!appointmentService) {
      return res.status(404).json({ message: 'Service not found in this appointment' });
    }

    // Check if user is staff and this is their service
    if (req.user.role === 'staff') {
      const staff = await Staff.findOne({
        where: { email: req.user.email },
      });

      if (!staff || appointmentService.staffId !== staff.id) {
        return res.status(403).json({ message: 'You can only complete services assigned to you' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only staff members can complete services' });
    }

    if (appointmentService.status === 'completed') {
      return res.status(400).json({ message: 'Service is already completed' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot complete service in a cancelled appointment' });
    }

    // Check if payment is completed before allowing service completion
    const { Payment } = require('../models');
    const payment = await Payment.findOne({ where: { appointmentId: id } });
    if (!payment || payment.status !== 'paid') {
      return res.status(400).json({ 
        message: 'Cannot complete service. Payment is required and must be completed first. Payment status: ' + (payment ? payment.status : 'No payment found') 
      });
    }

    // Mark this service as completed
    await appointmentService.update({ status: 'completed' });

    // Check if all services are completed, then mark appointment as completed
    const allServices = await AppointmentService.findAll({
      where: { appointmentId: id },
    });

    const allCompleted = allServices.every(svc => svc.status === 'completed');
    if (allCompleted && appointment.status !== 'completed') {
      await appointment.update({ status: 'completed' });
    }

    const updatedAppointment = await Appointment.findByPk(id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          include: [Service, Staff],
        },
      ],
    });

    res.json({
      message: 'Service marked as completed',
      appointment: updatedAppointment,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/appointments/:id/complete - Mark entire appointment as completed (backward compatibility)
exports.completeAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findByPk(id, {
      include: [
        { model: Service, as: 'PrimaryService' },
        { model: Staff, as: 'PrimaryStaff' },
        { model: User },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          include: [Service, Staff],
        },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({ message: 'Appointment is already completed' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'Cannot complete a cancelled appointment' });
    }

    // Check if payment is completed before allowing appointment completion
    const { Payment } = require('../models');
    const payment = await Payment.findOne({ where: { appointmentId: id } });
    if (!payment || payment.status !== 'paid') {
      return res.status(400).json({ 
        message: 'Cannot complete appointment. Payment is required and must be completed first. Payment status: ' + (payment ? payment.status : 'No payment found') 
      });
    }

    // If appointment has multiple services, complete all of them
    if (appointment.AppointmentServices && appointment.AppointmentServices.length > 0) {
      await AppointmentService.update(
        { status: 'completed' },
        { where: { appointmentId: id } }
      );
    }

    await appointment.update({ status: 'completed' });

    const updatedAppointment = await Appointment.findByPk(id, {
      include: [
        { model: Service, as: 'PrimaryService' },
        { model: Staff, as: 'PrimaryStaff' },
        { model: User },
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          include: [Service, Staff],
        },
      ],
    });

    res.json({
      message: 'Appointment marked as completed',
      appointment: updatedAppointment,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/appointments/:id
exports.cancelAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findByPk(id, {
      include: [Service, Staff],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check if user owns this appointment (or is admin)
    if (appointment.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only cancel your own appointments' });
    }

    // Policy: Can't cancel if appointment is less than 24 hours away
    const appointmentTime = new Date(appointment.startTime);
    const now = new Date();
    const hoursUntilAppointment = (appointmentTime - now) / (1000 * 60 * 60);

    const MIN_CANCEL_HOURS = process.env.MIN_CANCEL_HOURS || 24;
    if (hoursUntilAppointment < MIN_CANCEL_HOURS) {
      return res.status(400).json({
        message: `Appointments can only be cancelled at least ${MIN_CANCEL_HOURS} hours in advance. Please contact us for assistance.`,
      });
    }

    // Policy: Can't cancel already cancelled or completed appointments
    if (appointment.status === 'cancelled') {
      return res.status(400).json({ message: 'Appointment is already cancelled' });
    }

    if (appointment.status === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel completed appointments' });
    }

    // Update appointment status to cancelled
    await appointment.update({ status: 'cancelled' });

    // Optionally: Process refund if payment exists
    // This would require Payment model integration

    const updatedAppointment = await Appointment.findByPk(id, {
      include: [Service, Staff],
    });

    res.json({
      message: 'Appointment cancelled successfully',
      appointment: updatedAppointment,
    });
  } catch (err) {
    next(err);
  }
};

