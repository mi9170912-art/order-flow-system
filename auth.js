const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SESSION_DAYS = 7;

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function getSessionExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + SESSION_DAYS);
  return date;
}

const ROLES = {
  admin: {
    name: "صاحب المؤسسة",
    permissions: ["*"]
  },

  sales: {
    name: "مدير المبيعات",
    permissions: [
      "orders.create",
      "orders.view",
      "customers.view",
      "customers.manage"
    ]
  },

  accounts: {
    name: "مدير الحسابات",
    permissions: [
      "orders.view",
      "orders.approve",
      "accounts.view",
      "accounts.manage",
      "customers.view"
    ]
  },

  warehouse: {
    name: "مدير المخازن",
    permissions: [
      "orders.view",
      "warehouse.view",
      "warehouse.release",
      "warehouse.manage"
    ]
  }
};

function hasPermission(user, permission) {
  if (!user) return false;

  if (user.role === "admin") {
    return true;
  }

  const role = ROLES[user.role];

  if (!role) {
    return false;
  }

  return role.permissions.includes(permission);
}

module.exports = {
  ROLES,
  createToken,
  hashPassword,
  verifyPassword,
  getSessionExpiry,
  hasPermission
};
