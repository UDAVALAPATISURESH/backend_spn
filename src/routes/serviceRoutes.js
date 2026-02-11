const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const adminAuth = require('../middleware/adminAuth');

// Public: GET all services
router.get('/', serviceController.listServices);
router.get('/:id', serviceController.getService);

// Admin only: Create, update, delete
router.post('/', ...adminAuth, serviceController.createService);
router.put('/:id', ...adminAuth, serviceController.updateService);
router.delete('/:id', ...adminAuth, serviceController.deleteService);

module.exports = router;
