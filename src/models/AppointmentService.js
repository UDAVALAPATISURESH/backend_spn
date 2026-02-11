/**
 * Join table for Appointment and Service (many-to-many)
 * Tracks individual service completion status within an appointment
 */
module.exports = (sequelize, DataTypes) => {
  const AppointmentService = sequelize.define('AppointmentService', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    appointmentId: { type: DataTypes.INTEGER, allowNull: false },
    serviceId: { type: DataTypes.INTEGER, allowNull: false },
    staffId: { type: DataTypes.INTEGER, allowNull: false }, // Staff assigned to this specific service
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed'),
      defaultValue: 'pending',
    },
    startTime: { type: DataTypes.DATE, allowNull: false }, // When this service starts
    endTime: { type: DataTypes.DATE, allowNull: false }, // When this service ends
  });

  AppointmentService.associate = (models) => {
    AppointmentService.belongsTo(models.Appointment, { foreignKey: 'appointmentId' });
    AppointmentService.belongsTo(models.Service, { foreignKey: 'serviceId' });
    AppointmentService.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return AppointmentService;
};
