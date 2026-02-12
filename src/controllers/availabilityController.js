const { StaffAvailability, Staff } = require('../models');
const { Op } = require('sequelize');

// GET /api/availability/staff/:staffId
exports.getStaffAvailability = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const availability = await StaffAvailability.findAll({
      where: { staffId },
      include: [{ model: Staff, attributes: ['id', 'name'] }],
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']],
    });
    res.json(availability);
  } catch (err) {
    next(err);
  }
};

// POST /api/availability/staff/:staffId
exports.setStaffAvailability = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { schedules } = req.body; // Array of { dayOfWeek, startTime, endTime }

    if (!Array.isArray(schedules)) {
      return res.status(400).json({ message: 'schedules must be an array' });
    }

    // Validate staff exists
    const staff = await Staff.findByPk(staffId);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    // Delete existing availability for this staff
    await StaffAvailability.destroy({ where: { staffId } });

    // Create new availability entries
    const availabilityEntries = schedules.map((schedule) => ({
      staffId,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
    }));

    const created = await StaffAvailability.bulkCreate(availabilityEntries);

    const availability = await StaffAvailability.findAll({
      where: { staffId },
      include: [{ model: Staff, attributes: ['id', 'name'] }],
      order: [['dayOfWeek', 'ASC'], ['startTime', 'ASC']],
    });

    res.status(201).json(availability);
  } catch (err) {
    next(err);
  }
};

// POST /api/availability/staff/:staffId/schedule
exports.addSchedule = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { dayOfWeek, startTime, endTime } = req.body;

    if (dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ message: 'dayOfWeek, startTime, and endTime are required' });
    }

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ message: 'dayOfWeek must be 0-6 (Sunday-Saturday)' });
    }

    const staff = await Staff.findByPk(staffId);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    // Check for overlapping schedules
    const existing = await StaffAvailability.findOne({
      where: {
        staffId,
        dayOfWeek,
        [Op.or]: [
          {
            startTime: { [Op.between]: [startTime, endTime] },
          },
          {
            endTime: { [Op.between]: [startTime, endTime] },
          },
          {
            [Op.and]: [
              { startTime: { [Op.lte]: startTime } },
              { endTime: { [Op.gte]: endTime } },
            ],
          },
        ],
      },
    });

    if (existing) {
      return res.status(400).json({ message: 'Overlapping schedule exists for this day' });
    }

    const availability = await StaffAvailability.create({
      staffId,
      dayOfWeek,
      startTime,
      endTime,
    });

    const availabilityWithStaff = await StaffAvailability.findByPk(availability.id, {
      include: [{ model: Staff, attributes: ['id', 'name'] }],
    });

    res.status(201).json(availabilityWithStaff);
  } catch (err) {
    next(err);
  }
};

// PUT /api/availability/:id
exports.updateSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dayOfWeek, startTime, endTime } = req.body;

    const availability = await StaffAvailability.findByPk(id);
    if (!availability) return res.status(404).json({ message: 'Schedule not found' });

    const updateData = {};
    if (dayOfWeek !== undefined) {
      if (dayOfWeek < 0 || dayOfWeek > 6) {
        return res.status(400).json({ message: 'dayOfWeek must be 0-6 (Sunday-Saturday)' });
      }
      updateData.dayOfWeek = dayOfWeek;
    }
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endTime !== undefined) updateData.endTime = endTime;

    // Check for overlapping schedules (excluding current one)
    if (startTime || endTime || dayOfWeek !== undefined) {
      const checkDay = dayOfWeek !== undefined ? dayOfWeek : availability.dayOfWeek;
      const checkStart = startTime || availability.startTime;
      const checkEnd = endTime || availability.endTime;

      const existing = await StaffAvailability.findOne({
        where: {
          staffId: availability.staffId,
          dayOfWeek: checkDay,
          id: { [Op.ne]: id },
          [Op.or]: [
            {
              startTime: { [Op.between]: [checkStart, checkEnd] },
            },
            {
              endTime: { [Op.between]: [checkStart, checkEnd] },
            },
            {
              [Op.and]: [
                { startTime: { [Op.lte]: checkStart } },
                { endTime: { [Op.gte]: checkEnd } },
              ],
            },
          ],
        },
      });

      if (existing) {
        return res.status(400).json({ message: 'Overlapping schedule exists for this day' });
      }
    }

    await availability.update(updateData);

    const updated = await StaffAvailability.findByPk(id, {
      include: [{ model: Staff, attributes: ['id', 'name'] }],
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/availability/:id
exports.deleteSchedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const availability = await StaffAvailability.findByPk(id);
    if (!availability) return res.status(404).json({ message: 'Schedule not found' });

    await availability.destroy();
    res.json({ message: 'Schedule deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// GET /api/availability/available-slots
exports.getAvailableSlots = async (req, res, next) => {
  try {
    const { staffId, serviceId, date } = req.query;

    if (!staffId || !serviceId || !date) {
      return res.status(400).json({ message: 'staffId, serviceId, and date are required' });
    }

    const { Service, Appointment } = require('../models');
    const service = await Service.findByPk(serviceId);
    if (!service) return res.status(404).json({ message: 'Service not found' });

    const staff = await Staff.findByPk(staffId);
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    const selectedDate = new Date(date);
    const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDateOnly = new Date(selectedDate);
    selectedDateOnly.setHours(0, 0, 0, 0);
    
    if (selectedDateOnly < today) {
      return res.json({ 
        slots: [],
        message: 'Cannot book appointments in the past. Please select today or a future date.'
      });
    }

    // Get staff availability for this day
    const availability = await StaffAvailability.findOne({
      where: { staffId, dayOfWeek },
    });

    if (!availability) {
      // Return empty slots without message - frontend will handle display
      return res.json({ 
        slots: []
      });
    }

    // Get existing appointments for this staff on this date
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await Appointment.findAll({
      where: {
        staffId,
        startTime: { [Op.between]: [startOfDay, endOfDay] },
        status: { [Op.ne]: 'cancelled' },
      },
      order: [['startTime', 'ASC']],
    });

    // Generate available slots
    const slots = [];
    const [startHour, startMin] = availability.startTime.split(':').map(Number);
    const [endHour, endMin] = availability.endTime.split(':').map(Number);

    const slotStart = new Date(selectedDate);
    slotStart.setHours(startHour, startMin, 0, 0);

    const slotEnd = new Date(selectedDate);
    slotEnd.setHours(endHour, endMin, 0, 0);

    const serviceDuration = service.durationMinutes * 60000; // Convert to milliseconds
    const slotInterval = 30 * 60000; // 30-minute intervals

    let currentSlot = new Date(slotStart);

    // Also filter out slots that are in the past (for today)
    const now = new Date();

    while (currentSlot.getTime() + serviceDuration <= slotEnd.getTime()) {
      const slotEndTime = new Date(currentSlot.getTime() + serviceDuration);

      // Skip slots in the past (for today)
      if (currentSlot < now) {
        currentSlot = new Date(currentSlot.getTime() + slotInterval);
        continue;
      }

      // Check if this slot conflicts with existing appointments
      const hasConflict = appointments.some((apt) => {
        const aptStart = new Date(apt.startTime);
        const aptEnd = new Date(apt.endTime);

        return (
          (currentSlot.getTime() < aptEnd.getTime() && slotEndTime.getTime() > aptStart.getTime())
        );
      });

      if (!hasConflict) {
        slots.push({
          startTime: currentSlot.toISOString(),
          endTime: slotEndTime.toISOString(),
          displayTime: currentSlot.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
        });
      }

      currentSlot = new Date(currentSlot.getTime() + slotInterval);
    }

    const message = slots.length === 0 
      ? 'All available slots for this date are booked. Please select a different date or time.'
      : null;

    res.json({ slots, message });
  } catch (err) {
    next(err);
  }
};
