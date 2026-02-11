const app = require('./app');
const { sequelize, User } = require('./models');
const { startReminderJob } = require('./jobs/reminderJob');
require('dotenv').config();

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    // Sync database - alter: true will add missing columns without dropping data
    try {
      await sequelize.sync({ alter: true });
      console.log('Database tables synchronized');
    } catch (syncError) {
      console.error('\n❌ Database synchronization error:', syncError.message);
      console.error('Please check your database configuration and ensure the database exists.');
      console.error('For schema changes, you may need to manually update your database.\n');
      throw syncError;
    }

    // Create default admin user if none exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@salon.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const existingAdmin = await User.findOne({ where: { role: 'admin' } });
    if (!existingAdmin) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await User.create({
        name: 'Default Admin',
        email: adminEmail,
        passwordHash,
        role: 'admin',
      });
      console.log(`Default admin created: ${adminEmail} / ${adminPassword}`);
    }

    // Start appointment reminder cron job
    startReminderJob();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Unable to start server', err);
    process.exit(1);
  }
}

start();

