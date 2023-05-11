

/* This API is used to set up the SaaS */
const env = process.env.NODE_ENV || "development";

const config = require('../config/cloud.js')[env];

const admin = require("firebase-admin");

// Cloud firestore key file.
let serviceAccount = require(config.firestoreSecretPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
exports.db = db;