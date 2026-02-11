module.exports = (sequelize, DataTypes) => {
  const Staff = sequelize.define('Staff', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    bio: DataTypes.TEXT,
    specialization: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  });

  Staff.associate = (models) => {
    Staff.belongsToMany(models.Service, {
      through: models.StaffService,
      foreignKey: 'staffId',
    });
    Staff.hasMany(models.Appointment, { foreignKey: 'staffId' });
    Staff.hasMany(models.StaffAvailability, { foreignKey: 'staffId' });
    Staff.hasMany(models.Review, { foreignKey: 'staffId' });
  };

  return Staff;
};

