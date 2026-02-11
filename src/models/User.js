module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { 
      type: DataTypes.STRING, 
      allowNull: false,
      unique: 'email_unique', // Named unique constraint to avoid duplicates
    },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: {
      type: DataTypes.ENUM('customer', 'staff', 'admin'),
      defaultValue: 'customer',
    },
    phone: DataTypes.STRING,
    preferences: DataTypes.JSON,
    resetToken: DataTypes.STRING,
    resetTokenExpiry: DataTypes.DATE,
  }, {
    indexes: [
      {
        unique: true,
        fields: ['email'],
        name: 'email_unique',
      },
    ],
  });

  User.associate = (models) => {
    User.hasMany(models.Appointment, { foreignKey: 'userId' });
    User.hasMany(models.Review, { foreignKey: 'userId' });
  };

  return User;
};

