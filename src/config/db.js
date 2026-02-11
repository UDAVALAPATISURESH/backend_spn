const { Sequelize } = require('sequelize');
require('dotenv').config();

const DB_DIALECT = process.env.DB_DIALECT || 'mysql';

let sequelize;

if (DB_DIALECT === 'sqlite') {
  const DB_STORAGE = process.env.DB_STORAGE || 'salon.sqlite';
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: DB_STORAGE,
    logging: false,
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      dialect: DB_DIALECT,
      logging: false,
    }
  );
}

module.exports = { sequelize };

