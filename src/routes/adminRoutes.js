const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminAuth = require('../middleware/adminAuth');

// All admin routes require admin authentication
router.use(...adminAuth);

router.get('/summary', adminController.getSummary);
router.get('/appointments', adminController.getAllAppointments);
router.get('/users', adminController.getAllUsers);
router.get('/users/all', adminController.getAllUsersIncludingAdmins);
router.post('/users/create', adminController.createUser);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);
router.post('/staff/create-user', adminController.createStaffUser);

// Appointment approval and payment verification
router.put('/appointments/:id/confirm', adminController.confirmAppointment);
router.post('/appointments/:id/verify-payment', adminController.verifyPayment);
router.post('/appointments/:id/verify-and-confirm', adminController.verifyAndConfirm);

module.exports = router;
