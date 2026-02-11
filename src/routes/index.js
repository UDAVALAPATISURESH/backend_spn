const express = require('express');
const authRoutes = require('./authRoutes');
const appointmentRoutes = require('./appointmentRoutes');
const staffRoutes = require('./staffRoutes');
const serviceRoutes = require('./serviceRoutes');
const reviewRoutes = require('./reviewRoutes');
const adminRoutes = require('./adminRoutes');
const userRoutes = require('./userRoutes');
const availabilityRoutes = require('./availabilityRoutes');
const paymentRoutes = require('./paymentRoutes');

const router = express.Router();

// Simple health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/staff', staffRoutes);
router.use('/services', serviceRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);
router.use('/users', userRoutes);
router.use('/availability', availabilityRoutes);
router.use('/payments', paymentRoutes);

module.exports = router;



