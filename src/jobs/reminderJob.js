const cron = require('node-cron');
const { Appointment, User, Service, Staff } = require('../models');
const { Op } = require('sequelize');
const emailService = require('../services/emailService');

/**
 * Send reminder emails for appointments that are 24 hours away
 * Runs every 15 minutes
 */
const sendAppointmentReminders = async () => {
  try {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 25 hours from now (window to avoid duplicates)

    // Find appointments that are:
    // - Confirmed status
    // - Start time is between 23-25 hours from now (24-hour reminder window)
    // - Not cancelled or completed
    const appointments = await Appointment.findAll({
      where: {
        status: 'confirmed',
        startTime: {
          [Op.gte]: in24Hours,
          [Op.lt]: in25Hours,
        },
      },
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
      ],
    });

    console.log(`Found ${appointments.length} appointments to send 24-hour reminders for`);

    // Send reminder email for each appointment
    for (const appointment of appointments) {
      try {
        // Check if user and service/staff exist
        const service = appointment.PrimaryService || (appointment.AppointmentServices?.[0]?.Service);
        const staff = appointment.PrimaryStaff || (appointment.AppointmentServices?.[0]?.Staff);
        
        if (appointment.User && service && staff) {
          await emailService.sendReminder(
            appointment.User,
            appointment,
            service,
            staff
          );

          // Optional: Send SMS reminder if phone number exists
          if (appointment.User.phone) {
            const appointmentDate = new Date(appointment.startTime);
            const smsMessage = `Reminder: Your appointment for ${service.name} with ${staff.name} is tomorrow at ${appointmentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}.`;
            await emailService.sendSMS(appointment.User.phone, smsMessage);
          }

          console.log(`24-hour reminder sent for appointment ${appointment.id} (User: ${appointment.User.email})`);
        }
      } catch (error) {
        console.error(`Error sending reminder for appointment ${appointment.id}:`, error);
        // Continue with next appointment even if one fails
      }
    }
  } catch (error) {
    console.error('Error in reminder job:', error);
  }
};

/**
 * Send 15-minute reminder emails for appointments
 * Runs every 5 minutes to catch appointments 15 minutes before
 */
const send15MinuteReminders = async () => {
  try {
    const now = new Date();
    const in15Minutes = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now
    const in20Minutes = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes from now (window to avoid duplicates)

    // Find appointments that are:
    // - Confirmed status
    // - Start time is between 15-20 minutes from now
    // - Not cancelled or completed
    const appointments = await Appointment.findAll({
      where: {
        status: 'confirmed',
        startTime: {
          [Op.gte]: in15Minutes,
          [Op.lt]: in20Minutes,
        },
      },
      include: [
        { model: User, attributes: ['id', 'name', 'email', 'phone'] },
        { model: Service, as: 'PrimaryService', attributes: ['id', 'name', 'durationMinutes', 'price'] },
        { model: Staff, as: 'PrimaryStaff', attributes: ['id', 'name', 'specialization'] },
      ],
    });

    console.log(`Found ${appointments.length} appointments to send 15-minute reminders for`);

    // Send reminder email for each appointment
    for (const appointment of appointments) {
      try {
        // Check if user and service/staff exist
        const service = appointment.PrimaryService || (appointment.AppointmentServices?.[0]?.Service);
        const staff = appointment.PrimaryStaff || (appointment.AppointmentServices?.[0]?.Staff);
        
        if (appointment.User && service && staff) {
          await emailService.send15MinuteReminder(
            appointment.User,
            appointment,
            service,
            staff
          );

          // Optional: Send SMS reminder if phone number exists
          if (appointment.User.phone) {
            const appointmentDate = new Date(appointment.startTime);
            const smsMessage = `URGENT: Your appointment for ${service.name} with ${staff.name} is in 15 minutes at ${appointmentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}.`;
            await emailService.sendSMS(appointment.User.phone, smsMessage);
          }

          console.log(`15-minute reminder sent for appointment ${appointment.id} (User: ${appointment.User.email})`);
        }
      } catch (error) {
        console.error(`Error sending 15-minute reminder for appointment ${appointment.id}:`, error);
        // Continue with next appointment even if one fails
      }
    }
  } catch (error) {
    console.error('Error in 15-minute reminder job:', error);
  }
};

/**
 * Start the cron jobs
 * - 24-hour reminder: Runs every 15 minutes
 * - 15-minute reminder: Runs every 5 minutes
 */
const startReminderJob = () => {
  // Run 24-hour reminder every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    console.log('Running 24-hour appointment reminder job...');
    sendAppointmentReminders();
  });

  // Run 15-minute reminder every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    console.log('Running 15-minute appointment reminder job...');
    send15MinuteReminders();
  });

  console.log('Appointment reminder cron jobs started:');
  console.log('  - 24-hour reminders: every 15 minutes');
  console.log('  - 15-minute reminders: every 5 minutes');

  // Also run immediately on startup (optional - for testing)
  // Uncomment the lines below if you want to test immediately
  // sendAppointmentReminders();
  // send15MinuteReminders();
};

module.exports = { startReminderJob, sendAppointmentReminders, send15MinuteReminders };
