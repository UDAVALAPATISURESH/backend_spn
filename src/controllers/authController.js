const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');
 const emailService = require('../services/emailService');
/* =====================================================
   REGISTER
===================================================== */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email, password required' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(400).json({ message: 'Email already used' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      phone,
    });

    res.status(201).json({
      message: 'Registration successful. Please login.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });

  } catch (err) {
    next(err);
  }
};

/* =====================================================
   LOGIN
===================================================== */

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    // Email wrong
    if (!user) {
      return res.status(404).json({ message: 'Email not registered' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    // Password wrong
    if (!ok) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    // // cookie
    // res.cookie('token', token, {
    //   httpOnly: true,
    //   secure: process.env.NODE_ENV === 'production',
    //   sameSite: 'lax',
    //   maxAge: 7 * 24 * 60 * 60 * 1000,
    //   path: '/',
    // });

    res.json({ token, user });
  } catch (err) {
    next(err);
  }
};


/* =====================================================
   FORGOT PASSWORD
===================================================== */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const user = await User.findOne({ where: { email } });
    // security → don't reveal email exists or not
    if (!user) {
      return res.status(404).json({ 
        message: 'Email not registered' 
      });
    }
    // generate token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await user.update({
      resetToken,
      resetTokenExpiry,
    });
    try {
      await emailService.sendPasswordResetEmail(user, resetToken);
      console.log('Reset email sent to:', user.email);
    } catch (err) {
      console.error('Email failed:', err.message);
    }
    return res.json({
      message: 'Password reset link sent to your email',
    });
  } catch (err) {
    next(err);
  }
};

/* =====================================================
   RESET PASSWORD
===================================================== */
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const user = await User.findOne({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          [Op.gt]: new Date(), // Token not expired
        },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Update password and clear reset token
    const passwordHash = await bcrypt.hash(password, 10);
    await user.update({
      passwordHash,
      resetToken: null,
      resetTokenExpiry: null,
    });

    res.json({ message: 'Password reset successful. Please login.' });
  } catch (err) {
    next(err);
  }
};


/* =====================================================
   LOGOUT
===================================================== */
// POST /api/auth/logout - Logout user
// exports.logout = async (req, res, next) => {
//   try {
//     // Clear the HTTP-only cookie
//     res.clearCookie('token', {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === 'production',
//       sameSite: 'lax',
//       path: '/',
//     });
//     res.json({ message: 'Logged out successfully' });
//   } catch (err) {
//     next(err);
//   }
// };


exports.logout = async (req, res, next) => {
  try {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};