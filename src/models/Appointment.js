module.exports = (sequelize, DataTypes) => {
  const Appointment = sequelize.define('Appointment', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    // Keep serviceId and staffId for backward compatibility (primary service/staff)
    serviceId: { type: DataTypes.INTEGER, allowNull: true }, // Optional now (can have multiple services)
    staffId: { type: DataTypes.INTEGER, allowNull: true }, // Optional now (each service can have different staff)
    startTime: { type: DataTypes.DATE, allowNull: false },
    endTime: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'),
      defaultValue: 'pending',
    },
    notes: DataTypes.TEXT,
  });

  Appointment.associate = (models) => {
    Appointment.belongsTo(models.User, { foreignKey: 'userId' });
    // Optional primary service/staff - use SET NULL on delete since they're nullable
    Appointment.belongsTo(models.Service, { 
      foreignKey: 'serviceId', 
      as: 'PrimaryService',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
    Appointment.belongsTo(models.Staff, { 
      foreignKey: 'staffId', 
      as: 'PrimaryStaff',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
    Appointment.hasOne(models.Payment, { foreignKey: 'appointmentId' });
    // Many-to-many relationship with services
    Appointment.belongsToMany(models.Service, {
      through: models.AppointmentService,
      foreignKey: 'appointmentId',
      otherKey: 'serviceId',
      as: 'Services',
    });
    Appointment.hasMany(models.AppointmentService, { foreignKey: 'appointmentId', as: 'AppointmentServices' });
  };

  return Appointment;
};

