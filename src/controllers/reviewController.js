const { Review, User, Service, Staff } = require('../models');

// GET /api/reviews
exports.listReviews = async (req, res, next) => {
  try {
    const reviews = await Review.findAll({
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Service, attributes: ['id', 'name'] },
        { model: Staff, attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
    });
    res.json(reviews);
  } catch (err) {
    next(err);
  }
};

// GET /api/reviews/:id
exports.getReview = async (req, res, next) => {
  try {
    const review = await Review.findByPk(req.params.id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Service, attributes: ['id', 'name'] },
        { model: Staff, attributes: ['id', 'name'] },
      ],
    });
    if (!review) return res.status(404).json({ message: 'Review not found' });
    res.json(review);
  } catch (err) {
    next(err);
  }
};

// POST /api/reviews
exports.createReview = async (req, res, next) => {
  try {
    const { appointmentId, serviceId, staffId, rating, comment } = req.body;

    if (!appointmentId || !serviceId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'appointmentId, serviceId and rating (1-5) are required' });
    }

    // Verify the appointment belongs to the user and the service is in the appointment
    const { Appointment, AppointmentService } = require('../models');
    const appointment = await Appointment.findByPk(appointmentId, {
      include: [
        {
          model: AppointmentService,
          as: 'AppointmentServices',
          required: false, // LEFT JOIN to support backward compatibility
        },
      ],
    });

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.userId !== req.user.id) {
      return res.status(403).json({ message: 'You can only review your own appointments' });
    }

    if (appointment.status !== 'completed') {
      return res.status(400).json({ message: 'You can only review completed appointments' });
    }

    // Verify service is in the appointment
    let serviceInAppointment = false;
    let finalStaffId = staffId;
    
    if (appointment.AppointmentServices && appointment.AppointmentServices.length > 0) {
      // Multiple services: check if serviceId matches
      const matchingService = appointment.AppointmentServices.find(aptSvc => aptSvc.serviceId === serviceId);
      if (matchingService) {
        serviceInAppointment = true;
        if (!finalStaffId) {
          finalStaffId = matchingService.staffId;
        }
      }
    } else if (appointment.serviceId === serviceId) {
      // Backward compatibility: single service appointment
      serviceInAppointment = true;
      if (!finalStaffId) {
        finalStaffId = appointment.staffId;
      }
    }

    if (!serviceInAppointment) {
      return res.status(400).json({ message: 'Service not found in this appointment' });
    }

    // Check if review already exists for this appointment + service
    const existingReview = await Review.findOne({
      where: {
        userId: req.user.id,
        appointmentId,
        serviceId,
      },
    });

    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this service for this appointment' });
    }

    const review = await Review.create({
      userId: req.user.id,
      appointmentId,
      serviceId,
      staffId: finalStaffId || null,
      rating,
      comment: comment || null,
    });

    const reviewWithDetails = await Review.findByPk(review.id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Service, attributes: ['id', 'name'] },
        { model: Staff, attributes: ['id', 'name'] },
        { model: Appointment, attributes: ['id', 'startTime', 'endTime'] },
      ],
    });

    res.status(201).json(reviewWithDetails);
  } catch (err) {
    next(err);
  }
};

// PUT /api/reviews/:id/response
// Staff can respond to reviews assigned to them, admins can respond to any review
exports.respondToReview = async (req, res, next) => {
  try {
    const { staffResponse } = req.body;
    const review = await Review.findByPk(req.params.id, {
      include: [
        { model: Staff, attributes: ['id', 'name', 'email'] },
      ],
    });
    
    if (!review) return res.status(404).json({ message: 'Review not found' });

    // Check permissions: Staff can only respond to reviews assigned to them
    if (req.user.role === 'staff') {
      const { Staff } = require('../models');
      const staff = await Staff.findOne({
        where: { email: req.user.email },
      });

      if (!staff) {
        return res.status(403).json({ message: 'Staff profile not found' });
      }

      // Staff can only respond if the review is for their service
      if (review.staffId !== staff.id) {
        return res.status(403).json({ message: 'You can only respond to reviews for services you provided' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only staff and admins can respond to reviews' });
    }

    await review.update({ staffResponse });

    const reviewWithDetails = await Review.findByPk(review.id, {
      include: [
        { model: User, attributes: ['id', 'name', 'email'] },
        { model: Service, attributes: ['id', 'name'] },
        { model: Staff, attributes: ['id', 'name'] },
        { model: require('../models').Appointment, attributes: ['id', 'startTime', 'endTime'] },
      ],
    });

    res.json(reviewWithDetails);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/reviews/:id
exports.deleteReview = async (req, res, next) => {
  try {
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    await review.destroy();
    res.json({ message: 'Review deleted successfully' });
  } catch (err) {
    next(err);
  }
};
