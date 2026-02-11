const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const UserModel = require('./User');
const ServiceModel = require('./Service');
const StaffModel = require('./Staff');
const StaffServiceModel = require('./StaffService');
const StaffAvailabilityModel = require('./StaffAvailability');
const AppointmentModel = require('./Appointment');
const AppointmentServiceModel = require('./AppointmentService');
const PaymentModel = require('./Payment');
const ReviewModel = require('./Review');

const User = UserModel(sequelize, DataTypes);
const Service = ServiceModel(sequelize, DataTypes);
const Staff = StaffModel(sequelize, DataTypes);
const StaffService = StaffServiceModel(sequelize, DataTypes);
const StaffAvailability = StaffAvailabilityModel(sequelize, DataTypes);
const Appointment = AppointmentModel(sequelize, DataTypes);
const AppointmentService = AppointmentServiceModel(sequelize, DataTypes);
const Payment = PaymentModel(sequelize, DataTypes);
const Review = ReviewModel(sequelize, DataTypes);

const db = {
  sequelize,
  User,
  Service,
  Staff,
  StaffService,
  StaffAvailability,
  Appointment,
  AppointmentService,
  Payment,
  Review,
};

Object.values(db)
  .filter((model) => typeof model.associate === 'function')
  .forEach((model) => model.associate(db));

module.exports = db;

