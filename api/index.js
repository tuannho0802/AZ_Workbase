// api/index.js

const { AppFactory } = require('../backend/src/AppFactory');

const { expressApp } = AppFactory.create();

module.exports = expressApp;