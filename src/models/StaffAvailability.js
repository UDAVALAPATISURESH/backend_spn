module.exports = (sequelize, DataTypes) => {
  const StaffAvailability = sequelize.define('StaffAvailability', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    staffId: { type: DataTypes.INTEGER, allowNull: false },
    dayOfWeek: { type: DataTypes.INTEGER, allowNull: false },
    startTime: { type: DataTypes.TIME, allowNull: false },
    endTime: { type: DataTypes.TIME, allowNull: false },
  });

  StaffAvailability.associate = (models) => {
    StaffAvailability.belongsTo(models.Staff, { foreignKey: 'staffId' });
  };

  return StaffAvailability;
};

