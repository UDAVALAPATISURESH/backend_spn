module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define('Payment', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    appointmentId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING, defaultValue: 'INR' },
    provider: { type: DataTypes.ENUM('stripe', 'razorpay', 'cashfree'), allowNull: false },
    providerPaymentId: DataTypes.STRING,
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'refunded'),
      defaultValue: 'pending',
    },
    invoiceUrl: DataTypes.STRING,
  });

  Payment.associate = (models) => {
    Payment.belongsTo(models.Appointment, { foreignKey: 'appointmentId' });
  };

  return Payment;
};

