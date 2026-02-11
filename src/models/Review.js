module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define('Review', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    appointmentId: { type: DataTypes.INTEGER, allowNull: true }, // Link to appointment (nullable for backward compatibility)
    serviceId: { type: DataTypes.INTEGER, allowNull: false }, // Specific service in the appointment
    staffId: { type: DataTypes.INTEGER, allowNull: true },
    rating: { type: DataTypes.INTEGER, allowNull: false },
    comment: DataTypes.TEXT,
    staffResponse: DataTypes.TEXT,
  });

  Review.associate = (models) => {
    Review.belongsTo(models.User, { foreignKey: 'userId' });
    Review.belongsTo(models.Appointment, { 
      foreignKey: 'appointmentId',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
    Review.belongsTo(models.Service, { foreignKey: 'serviceId' });
    Review.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return Review;
};

