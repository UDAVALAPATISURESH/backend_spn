const express = require('express');
const router = express.Router();
const availabilityController = require('../controllers/availabilityController');
const adminAuth = require('../middleware/adminAuth');
const auth = require('../middleware/auth');

// Public: Get available slots for booking
router.get('/available-slots', availabilityController.getAvailableSlots);

// Admin: Manage staff availability
router.get('/staff/:staffId', ...adminAuth, availabilityController.getStaffAvailability);
router.post('/staff/:staffId', ...adminAuth, availabilityController.setStaffAvailability);
router.post('/staff/:staffId/schedule', ...adminAuth, availabilityController.addSchedule);
router.put('/:id', ...adminAuth, availabilityController.updateSchedule);
router.delete('/:id', ...adminAuth, availabilityController.deleteSchedule);

module.exports = router;
