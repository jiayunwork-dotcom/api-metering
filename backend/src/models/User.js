import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  role: {
    type: DataTypes.ENUM('admin', 'operator', 'finance'),
    defaultValue: 'operator',
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('active', 'disabled'),
    defaultValue: 'active',
    allowNull: false,
  },
}, {
  tableName: 'users',
  timestamps: true,
  paranoid: true,
  indexes: [
    {
      name: 'idx_user_username',
      unique: true,
      fields: ['username'],
    },
    {
      name: 'idx_user_email',
      unique: true,
      fields: ['email'],
    },
  ],
});

export default User;
