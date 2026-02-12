const nodemailer = require('nodemailer');

// Check if email credentials are provided
const hasEmailConfig = !!(process.env.SMTP_USER || process.env.EMAIL_USER) && 
                       !!(process.env.SMTP_PASS || process.env.EMAIL_PASS);

// Helper to get the password, preferring EMAIL_PASS if SMTP_PASS looks invalid
const getPassword = () => {
  const smtpPass = process.env.SMTP_PASS;
  const emailPass = process.env.EMAIL_PASS;
  
  // If SMTP_PASS looks like an email address (contains @), it's probably wrong
  // Prefer EMAIL_PASS in that case, or use SMTP_PASS if EMAIL_PASS is not available
  if (smtpPass && smtpPass.includes('@')) {
    if (emailPass && !emailPass.includes('@')) {
      console.warn('⚠️  SMTP_PASS appears to be an email address. Using EMAIL_PASS instead.');
      console.warn('   Please set SMTP_PASS to your Gmail App Password (not your email address).');
      return emailPass;
    } else if (emailPass) {
      console.warn('⚠️  Both SMTP_PASS and EMAIL_PASS appear to be email addresses.');
      console.warn('   Gmail requires an App Password, not your email address.');
      console.warn('   Get an App Password: https://support.google.com/accounts/answer/185833');
      return emailPass; // Still use it, but warn
    }
  }
  
  return smtpPass || emailPass;
};

// Create transporter only if credentials are provided
let transporter = null;
if (hasEmailConfig) {
  const password = getPassword();
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const useSecure = smtpPort === 465; // Port 465 uses SSL, 587 uses STARTTLS
  
  // Log configuration for debugging (without exposing password)
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  console.log(`📧 Configuring email service: ${smtpUser}@${process.env.SMTP_HOST || 'smtp.gmail.com'}:${smtpPort} (secure: ${useSecure})`);
  
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: useSecure, // true for 465, false for other ports
    auth: {
      user: smtpUser,
      pass: password,
    },
    // Add timeout configurations to prevent long waits
    // Increased slightly for cloud environments that may have network latency
    connectionTimeout: 15000, // 15 seconds
    socketTimeout: 15000, // 15 seconds
    greetingTimeout: 10000, // 10 seconds
    // Connection pool options
    pool: false, // Disable pooling for cloud environments to avoid connection issues
    // TLS options for better compatibility with cloud environments
    tls: {
      // Don't reject unauthorized certificates (needed for some cloud environments)
      // Note: This is less secure but may be necessary for cloud platforms
      rejectUnauthorized: process.env.NODE_ENV === 'production' ? false : true,
    },
    // Retry options
    retry: {
      attempts: 1, // Don't retry automatically - we handle errors gracefully
    },
  });

  // Verify transporter configuration (non-blocking with timeout)
  // Note: Verification failure doesn't disable the service - it's just informational
  const verifyTimeout = setTimeout(() => {
    console.warn('⚠️  Email service verification timed out. Will still attempt to send emails.');
    console.warn('   This is common on cloud platforms (Render, Heroku, etc.) due to network restrictions.');
    console.warn('   Consider using a dedicated email service like SendGrid, Mailgun, or AWS SES.');
  }, 10000); // 10 second timeout for verification

  transporter.verify((error, success) => {
    clearTimeout(verifyTimeout);
    if (error) {
      // Don't disable service on verification failure - just warn
      // Sometimes verification fails but actual sending works
      console.warn('⚠️  Email service verification failed:', error.message);
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        console.warn('   Connection timeout or refused during verification.');
        console.warn('   Email sending will still be attempted, but may fail.');
        console.warn('   On cloud platforms (Render, Heroku, etc.), Gmail SMTP is often blocked.');
        console.warn('   Consider using SendGrid, Mailgun, or AWS SES instead of Gmail SMTP.');
      } else if (error.code === 'EAUTH' || error.responseCode === 535) {
        console.warn('   Authentication failed. For Gmail:');
        console.warn('   1. Make sure you\'re using an App Password, not your regular password');
        console.warn('   2. Get an App Password: https://support.google.com/accounts/answer/185833');
        console.warn('   3. Set SMTP_PASS or EMAIL_PASS to the 16-character App Password');
        console.warn('   4. Ensure 2-Step Verification is enabled on your Google account');
      } else {
        console.warn('   Email sending will still be attempted.');
        console.warn('   If emails fail to send, check your SMTP configuration.');
      }
    } else {
      console.log('✅ Email service verified and ready to send messages');
    }
  });
} else {
  console.warn('⚠️  Email service not configured. Email features will be disabled.');
  console.warn('   To enable email, set SMTP_USER and SMTP_PASS in your .env file');
}

/**
 * Send booking confirmation email
 */
exports.sendBookingConfirmation = async (user, appointment, service, staff) => {
  if (!transporter) {
    console.warn('Email service not configured. Skipping booking confirmation email.');
    return null;
  }

  try {
    const appointmentDate = new Date(appointment.startTime);
    const appointmentEnd = new Date(appointment.endTime);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SENDER_EMAIL || `"Salon Booking" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@salon.com'}>`,
      to: user.email,
      subject: 'Appointment Confirmation - Salon Booking',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #111827; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .detail-row { margin: 10px 0; }
            .label { font-weight: bold; color: #4b5563; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .button { display: inline-block; padding: 10px 20px; background: #111827; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Appointment Confirmed!</h1>
            </div>
            <div class="content">
              <p>Dear ${user.name},</p>
              <p>Your appointment has been successfully confirmed. Here are the details:</p>
              
              <div class="details">
                <div class="detail-row">
                  <span class="label">Service:</span> ${service.name}
                </div>
                <div class="detail-row">
                  <span class="label">Staff:</span> ${staff.name}
                </div>
                <div class="detail-row">
                  <span class="label">Date:</span> ${appointmentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div class="detail-row">
                  <span class="label">Time:</span> ${appointmentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${appointmentEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
                <div class="detail-row">
                  <span class="label">Duration:</span> ${service.durationMinutes} minutes
                </div>
                <div class="detail-row">
                  <span class="label">Price:</span> ₹${service.price}
                </div>
                ${appointment.notes ? `<div class="detail-row"><span class="label">Notes:</span> ${appointment.notes}</div>` : ''}
              </div>

              <p>We look forward to seeing you!</p>
              <p>If you need to reschedule or cancel, please contact us or log in to your account.</p>
              
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">View My Appointments</a>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} Salon Booking System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Appointment Confirmation
        
        Dear ${user.name},
        
        Your appointment has been successfully confirmed.
        
        Service: ${service.name}
        Staff: ${staff.name}
        Date: ${appointmentDate.toLocaleDateString()}
        Time: ${appointmentDate.toLocaleTimeString()} - ${appointmentEnd.toLocaleTimeString()}
        Duration: ${service.durationMinutes} minutes
        Price: ₹${service.price}
        ${appointment.notes ? `Notes: ${appointment.notes}` : ''}
        
        We look forward to seeing you!
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Booking confirmation email sent:', info.messageId);
    return info;
  } catch (error) {
    // Handle timeout errors more gracefully
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKETTIMEDOUT') {
      console.warn('Email service connection timeout. Booking confirmation email not sent.');
      console.warn('   Gmail SMTP is often blocked on cloud platforms (Render, Heroku, etc.).');
      console.warn('   Consider using SendGrid, Mailgun, or AWS SES for better reliability.');
    } else if (error.code === 'EAUTH' || error.responseCode === 535) {
      console.warn('Email authentication failed. Booking confirmation email not sent.');
      console.warn('   For Gmail, use an App Password (not your email address or regular password).');
      console.warn('   Get an App Password: https://support.google.com/accounts/answer/185833');
    } else {
      console.error('Error sending booking confirmation email:', error.message || error);
    }
    // Don't throw error - email failure shouldn't break booking
    return null;
  }
};

/**
 * Send appointment reminder email
 */
exports.sendReminder = async (user, appointment, service, staff) => {
  if (!transporter) {
    console.warn('Email service not configured. Skipping reminder email.');
    return null;
  }

  try {
    const appointmentDate = new Date(appointment.startTime);
    const appointmentEnd = new Date(appointment.endTime);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SENDER_EMAIL || `"Salon Booking" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@salon.com'}>`,
      to: user.email,
      subject: 'Reminder: Your Appointment Tomorrow',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #111827; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
            .detail-row { margin: 10px 0; }
            .label { font-weight: bold; color: #4b5563; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Appointment Reminder</h1>
            </div>
            <div class="content">
              <p>Dear ${user.name},</p>
              <p>This is a friendly reminder about your upcoming appointment:</p>
              
              <div class="details">
                <div class="detail-row">
                  <span class="label">Service:</span> ${service.name}
                </div>
                <div class="detail-row">
                  <span class="label">Staff:</span> ${staff.name}
                </div>
                <div class="detail-row">
                  <span class="label">Date:</span> ${appointmentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div class="detail-row">
                  <span class="label">Time:</span> ${appointmentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${appointmentEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
              </div>

              <p>We look forward to seeing you!</p>
            </div>
            <div class="footer">
              <p>This is an automated reminder. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Reminder email sent:', info.messageId);
    return info;
  } catch (error) {
    // Handle timeout errors more gracefully
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKETTIMEDOUT') {
      console.warn('Email service connection timeout. Reminder email not sent.');
      console.warn('   Gmail SMTP is often blocked on cloud platforms. Consider using SendGrid, Mailgun, or AWS SES.');
    } else if (error.code === 'EAUTH' || error.responseCode === 535) {
      console.warn('Email authentication failed. Reminder email not sent.');
      console.warn('   For Gmail, use an App Password (not your email address or regular password).');
      console.warn('   Get an App Password: https://support.google.com/accounts/answer/185833');
    } else {
      console.error('Error sending reminder email:', error.message || error);
    }
    return null;
  }
};

/**
 * Send 15-minute reminder email
 */
exports.send15MinuteReminder = async (user, appointment, service, staff) => {
  if (!transporter) {
    console.warn('Email service not configured. Skipping 15-minute reminder email.');
    return null;
  }

  try {
    const appointmentDate = new Date(appointment.startTime);
    const appointmentEnd = new Date(appointment.endTime);

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SENDER_EMAIL || `"Salon Booking" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@salon.com'}>`,
      to: user.email,
      subject: 'URGENT: Your Appointment is in 15 Minutes!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .details { background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border: 2px solid #dc2626; }
            .detail-row { margin: 10px 0; }
            .label { font-weight: bold; color: #4b5563; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .urgent { color: #dc2626; font-weight: bold; font-size: 1.1em; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⏰ Appointment Reminder - 15 Minutes!</h1>
            </div>
            <div class="content">
              <p class="urgent">Dear ${user.name},</p>
              <p class="urgent">Your appointment is starting in 15 minutes!</p>
              
              <div class="details">
                <div class="detail-row">
                  <span class="label">Service:</span> ${service.name}
                </div>
                <div class="detail-row">
                  <span class="label">Staff:</span> ${staff.name}
                </div>
                <div class="detail-row">
                  <span class="label">Time:</span> ${appointmentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${appointmentEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </div>
              </div>

              <p>Please arrive on time. We look forward to seeing you!</p>
            </div>
            <div class="footer">
              <p>This is an automated reminder. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('15-minute reminder email sent:', info.messageId);
    return info;
  } catch (error) {
    // Handle timeout errors more gracefully
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKETTIMEDOUT') {
      console.warn('Email service connection timeout. 15-minute reminder email not sent.');
      console.warn('   Gmail SMTP is often blocked on cloud platforms. Consider using SendGrid, Mailgun, or AWS SES.');
    } else if (error.code === 'EAUTH' || error.responseCode === 535) {
      console.warn('Email authentication failed. 15-minute reminder email not sent.');
      console.warn('   For Gmail, use an App Password (not your email address or regular password).');
      console.warn('   Get an App Password: https://support.google.com/accounts/answer/185833');
    } else {
      console.error('Error sending 15-minute reminder email:', error.message || error);
    }
    return null;
  }
};

/**
 * Send password reset email
 */
exports.sendPasswordResetEmail = async (user, resetToken) => {
  if (!transporter) {
    console.warn('Email service not configured. Skipping password reset email.');
    return null;
  }

  try {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SENDER_EMAIL || `"Salon Booking" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@salon.com'}>`,
      to: user.email,
      subject: 'Password Reset Request - Salon Booking',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #111827; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background: #111827; color: white; text-decoration: none; border-radius: 5px; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .warning { color: #dc2626; font-size: 0.9em; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Dear ${user.name},</p>
              <p>You requested to reset your password. Click the button below to reset it:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>

              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>

              <p class="warning">This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request
        
        Dear ${user.name},
        
        You requested to reset your password. Use this link to reset it:
        
        ${resetUrl}
        
        This link will expire in 1 hour. If you didn't request this, please ignore this email.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return info;
  } catch (error) {
    // Handle timeout errors more gracefully
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKETTIMEDOUT') {
      console.warn('Email service connection timeout. Password reset email not sent.');
      console.warn('   Gmail SMTP is often blocked on cloud platforms. Consider using SendGrid, Mailgun, or AWS SES.');
    } else if (error.code === 'EAUTH' || error.responseCode === 535) {
      console.warn('Email authentication failed. Password reset email not sent.');
      console.warn('   For Gmail, use an App Password (not your email address or regular password).');
      console.warn('   Get an App Password: https://support.google.com/accounts/answer/185833');
    } else {
      console.error('Error sending password reset email:', error.message || error);
    }
    return null;
  }
};

/**
 * Send payment verification email with invoice
 */
exports.sendPaymentInvoice = async (user, appointment, payment, services = null) => {
  if (!transporter) {
    console.warn('Email service not configured. Skipping payment invoice email.');
    return null;
  }

  try {
    const appointmentDate = new Date(appointment.startTime);
    const appointmentEnd = new Date(appointment.endTime);
    
    // Get services - use provided services array or fallback to single service
    const servicesList = services || (appointment.PrimaryService ? [{
      Service: appointment.PrimaryService,
      Staff: appointment.PrimaryStaff,
    }] : []);
    
    // Calculate totals
    const subtotal = servicesList.reduce((sum, svc) => sum + parseFloat(svc.Service?.price || 0), 0);
    const tax = subtotal * 0.18; // 18% GST
    const total = subtotal + tax;

    // Build services HTML
    let servicesHtml = '';
    if (servicesList.length > 0) {
      servicesHtml = servicesList.map((aptSvc, idx) => `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${idx + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${aptSvc.Service?.name || 'Service'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${aptSvc.Staff?.name || 'N/A'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹${parseFloat(aptSvc.Service?.price || 0).toFixed(2)}</td>
        </tr>
      `).join('');
    } else {
      servicesHtml = `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">1</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${appointment.PrimaryService?.name || 'Service'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${appointment.PrimaryStaff?.name || 'N/A'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">₹${parseFloat(appointment.PrimaryService?.price || 0).toFixed(2)}</td>
        </tr>
      `;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.SENDER_EMAIL || `"Salon Booking" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'noreply@salon.com'}>`,
      to: user.email,
      subject: 'Payment Verified - Invoice - Salon Booking',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #059669; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .invoice-box { background: white; padding: 20px; margin: 15px 0; border-radius: 5px; border: 2px solid #059669; }
            .invoice-header { border-bottom: 2px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 15px; }
            .invoice-title { font-size: 24px; font-weight: bold; color: #059669; margin: 0; }
            .invoice-number { color: #6b7280; font-size: 14px; margin-top: 5px; }
            .details { margin: 15px 0; }
            .detail-row { margin: 10px 0; }
            .label { font-weight: bold; color: #4b5563; display: inline-block; width: 120px; }
            .invoice-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .invoice-table th { background: #f3f4f6; padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb; font-weight: 600; }
            .invoice-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
            .invoice-totals { margin-top: 20px; padding-top: 15px; border-top: 2px solid #e5e7eb; }
            .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
            .total-row.final { font-size: 18px; font-weight: bold; color: #059669; border-top: 2px solid #059669; padding-top: 10px; margin-top: 10px; }
            .payment-info { background: #f0fdf4; padding: 15px; border-radius: 5px; border-left: 4px solid #059669; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .button { display: inline-block; padding: 10px 20px; background: #059669; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Verified ✓</h1>
            </div>
            <div class="content">
              <p>Dear ${user.name},</p>
              <p>Your payment has been successfully verified. Please find your invoice below:</p>
              
              <div class="invoice-box">
                <div class="invoice-header">
                  <div class="invoice-title">INVOICE</div>
                  <div class="invoice-number">Invoice #${appointment.id}-${payment.id}</div>
                  <div class="invoice-number">Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                </div>

                <div class="details">
                  <div class="detail-row">
                    <span class="label">Appointment Date:</span> ${appointmentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </div>
                  <div class="detail-row">
                    <span class="label">Appointment Time:</span> ${appointmentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} - ${appointmentEnd.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </div>
                </div>

                <table class="invoice-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Service</th>
                      <th>Staff</th>
                      <th style="text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${servicesHtml}
                  </tbody>
                </table>

                <div class="invoice-totals">
                  <div class="total-row">
                    <span>Subtotal:</span>
                    <span>₹${subtotal.toFixed(2)}</span>
                  </div>
                  <div class="total-row">
                    <span>GST (18%):</span>
                    <span>₹${tax.toFixed(2)}</span>
                  </div>
                  <div class="total-row final">
                    <span>Total Amount:</span>
                    <span>₹${total.toFixed(2)}</span>
                  </div>
                </div>

                <div class="payment-info">
                  <div class="detail-row">
                    <span class="label">Payment Status:</span> <strong style="color: #059669;">PAID</strong>
                  </div>
                  <div class="detail-row">
                    <span class="label">Payment Method:</span> ${payment.provider ? payment.provider.toUpperCase() : 'Online'}
                  </div>
                  <div class="detail-row">
                    <span class="label">Payment ID:</span> ${payment.providerPaymentId || payment.id}
                  </div>
                  <div class="detail-row">
                    <span class="label">Payment Date:</span> ${new Date(payment.updatedAt || payment.createdAt).toLocaleString('en-US')}
                  </div>
                </div>
              </div>

              <p>Thank you for your payment. Your appointment is confirmed!</p>
              
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" class="button">View My Appointments</a>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} Salon Booking System. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Payment Verified - Invoice
        
        Dear ${user.name},
        
        Your payment has been successfully verified.
        
        Invoice #${appointment.id}-${payment.id}
        Date: ${new Date().toLocaleDateString()}
        
        Appointment Date: ${appointmentDate.toLocaleDateString()}
        Appointment Time: ${appointmentDate.toLocaleTimeString()} - ${appointmentEnd.toLocaleTimeString()}
        
        Services:
        ${servicesList.map((svc, idx) => `${idx + 1}. ${svc.Service?.name || 'Service'} - ${svc.Staff?.name || 'N/A'} - ₹${parseFloat(svc.Service?.price || 0).toFixed(2)}`).join('\n')}
        
        Subtotal: ₹${subtotal.toFixed(2)}
        GST (18%): ₹${tax.toFixed(2)}
        Total: ₹${total.toFixed(2)}
        
        Payment Status: PAID
        Payment Method: ${payment.provider ? payment.provider.toUpperCase() : 'Online'}
        Payment ID: ${payment.providerPaymentId || payment.id}
        
        Thank you for your payment!
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Payment invoice email sent:', info.messageId);
    return info;
  } catch (error) {
    // Handle timeout errors more gracefully
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' || error.code === 'ESOCKETTIMEDOUT') {
      console.warn('Email service connection timeout. Payment invoice email not sent.');
      console.warn('   This is a non-critical error - payment verification was successful.');
      console.warn('   Gmail SMTP is often blocked on cloud platforms (Render, Heroku, etc.).');
      console.warn('   Consider using SendGrid, Mailgun, or AWS SES for better reliability.');
    } else if (error.code === 'EAUTH' || error.responseCode === 535) {
      console.warn('Email authentication failed. Payment invoice email not sent.');
      console.warn('   For Gmail, use an App Password (not your email address or regular password).');
      console.warn('   Get an App Password: https://support.google.com/accounts/answer/185833');
    } else {
      console.error('Error sending payment invoice email:', error.message || error);
    }
    return null;
  }
};

/**
 * Send SMS (placeholder - integrate with Twilio, AWS SNS, etc.)
 */
exports.sendSMS = async (phoneNumber, message) => {
  // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
  console.log(`SMS to ${phoneNumber}: ${message}`);
  // For now, just log it
  return { success: true, message: 'SMS logged (not sent - SMS service not configured)' };
};
