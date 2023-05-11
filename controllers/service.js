

const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];

const jwt = require('jsonwebtoken');

const jwt_secret = config.jwt_secret;

const { db } = require("./setup");

// Middleware to enforce user has admin privileges by checking the JWT token.
exports.hasAdmin = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);
  if (user_info.is_admin != true) {
    res.status(403).send({ error: "Error: Forbidden. Not an admin."})
  } else {
    // add user info:
    req.user_info = user_info;
    next();
  }
}

const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}

// Creates new user if it doesnt exist, returns user data.
const createNewUserDocReturnExisting = async function(req, res, next, user_info) {
  let is_admin = false;
  let user_data = {};

  return db.collection('daco-users').doc(user_info.id).get().then(user => {
    if (!user.exists) {
	  // Create the user as admin if that is true.
	  if (user_info.is_admin == true) {
	    is_admin = true;
	  }
	  return db.collection('users').doc(user_info.id).set({
	    email: user_info.email,
	    is_admin: is_admin,
	  }).then(userRef => {
	    return db.collection('users').doc(user_info.id).get();
	  }).catch(err => {
	    return { error: "Failed to create user in Firestore.\n" + err }
	  });
    } else {
      // User exists, but update if any fields have changed (e.g. admin status)
      return db.collection('users').doc(user_info.id).get().then(user=> {
        if (user.data().is_admin != user_info.is_admin) {
          // Sync user status in database:
          return db.collection('users').doc(user_info.id).set({
            email: user_info.email,
            is_admin: user_info.is_admin,
          }, { merge: true }).then(userRef => {
            // Return updated user
            return db.collection('users').doc(user_info.id).get();
          }).catch(err => {
            return { error: "Failed to update user in Firestore.\n" + err }
          });
        } else {
          // no changes, return user as is:
          return user;
        }
      });
    }
  });
}
