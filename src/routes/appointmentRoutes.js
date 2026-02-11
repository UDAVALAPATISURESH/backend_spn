const express = require('express');
const auth = require('../middleware/auth');
const appointmentController = require('../controllers/appointmentController');

const router = express.Router();

// all appointment routes require auth
router.use(auth);

// GET /api/appointments/my - Customer appointments
router.get('/my', appointmentController.myAppointments);

// GET /api/appointments/staff/my - Staff appointments
router.get('/staff/my', appointmentController.myStaffAppointments);

// POST /api/appointments
router.post('/', appointmentController.createAppointment);

// PUT /api/appointments/:id/reschedule
router.put('/:id/reschedule', appointmentController.rescheduleAppointment);

// PUT /api/appointments/:id/complete-service/:serviceId - Complete individual service
router.put('/:id/complete-service/:serviceId', appointmentController.completeService);

// PUT /api/appointments/:id/complete - Complete entire appointment (backward compatibility)
router.put('/:id/complete', appointmentController.completeAppointment);

// DELETE /api/appointments/:id
router.delete('/:id', appointmentController.cancelAppointment);

module.exports = router;

