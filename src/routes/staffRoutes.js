const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staffController');
const adminAuth = require('../middleware/adminAuth');

// Public / customer: view staff list & details
router.get('/', staffController.listStaff);
router.get('/:id', staffController.getStaff);

// Admin only: manage staff
router.post('/', ...adminAuth, staffController.createStaff);
router.put('/:id', ...adminAuth, staffController.updateStaff);
router.delete('/:id', ...adminAuth, staffController.deleteStaff);

module.exports = router;
