const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Public: GET all reviews
router.get('/', reviewController.listReviews);
router.get('/:id', reviewController.getReview);

// Authenticated: Create review
router.post('/', auth, reviewController.createReview);

// Staff and Admin: Respond to review (staff can only respond to their own reviews)
router.put('/:id/response', auth, reviewController.respondToReview);
// Admin only: Delete review
router.delete('/:id', ...adminAuth, reviewController.deleteReview);

module.exports = router;
