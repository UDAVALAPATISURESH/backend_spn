module.exports = (sequelize, DataTypes) => {
  const StaffService = sequelize.define('StaffService', {
    staffId: { type: DataTypes.INTEGER, primaryKey: true },
    serviceId: { type: DataTypes.INTEGER, primaryKey: true },
  });

  return StaffService;
};

