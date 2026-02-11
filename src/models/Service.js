module.exports = (sequelize, DataTypes) => {
  const Service = sequelize.define('Service', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: DataTypes.TEXT,
    durationMinutes: { type: DataTypes.INTEGER, allowNull: false },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  });

  Service.associate = (models) => {
    Service.belongsToMany(models.Staff, {
      through: models.StaffService,
      foreignKey: 'serviceId',
    });
    Service.hasMany(models.Appointment, { foreignKey: 'serviceId' });
    Service.hasMany(models.Review, { foreignKey: 'serviceId' });
  };

  return Service;
};

