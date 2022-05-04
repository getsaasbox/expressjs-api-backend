

const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];

const admin = require("firebase-admin");

const AWS = require('aws-sdk')


const { db } = require("./setup");



const jwt = require('jsonwebtoken');


const crypto = require("crypto");

const generateToken = function() {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(18, function(err, buffer) { 
      if (err) {
        reject("Error generating token.");
      }
      resolve(buffer.toString("hex"));
    })
  });
}

    

// FIXME: add JWT secret.
const jwt_secret = process.env.jassets_app_jwt_secret;


const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
  console.log("Token:", token);

	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}


// Creates new user if it doesnt exist, returns user data.
const createNewUserDocReturnExisting = async function(req, res, next, user_info) {
  let is_admin = false;

  return db.collection('js-asset-users').doc(user_info.id).get().then(user => {
    if (!user.exists) {
      return generateToken().then(token => {
        // Create the user as admin if that is true.
        if (user.is_admin == true) {
          is_admin = true;
        }
        return db.collection('js-asset-users').doc(user_info.id).set({
          domain: "",
          api_key: token,
          is_admin: is_admin,
        }).then(userRef => {
          // FIXME: Return latest deploy link here as well if it exists.
          return userRef;
        }).catch(err => {
          return { error: "Failed to create user in Firestore.\n" + err }
        });
      });
    } else {
      return db.collection('js-asset-users').doc(user_info.id).get();
    }
  });
}

//
// On page load for admin or regular user
// creates the user if it didnt exist.
// returns new user.
//
exports.create_get_user_info = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);
  return createNewUserDocReturnExisting(req, res, next, user_info).then(created => {
    res.send({ created });
  })
}

// Update regular user's domain info by processing the form.
const updateUserDoc = async function(req, res, next, user_info, domain) {
  return db.collection('js-asset-users').doc(user_info.id).set({
    domain: domain,
    }, { merge: true }).then(result => {
    return 0;
  }).catch(err => {
    return { error: "Failed saving user credentials.\n" + err };
  });
}

// Fetch records that admin has created
exports.fetch_deploy_records = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);

  if (user_info.is_admin == false) {
    res.status(200).send({error: "Not an admin user"});
  } else {
    let historiesRef = db.collection('js-asset-users').doc(user_info.id).collection('history');
    //return historiesRef.orderBy('createdAt', 'desc').limit(10).get()
    return historiesRef.limit(10).get().then(histories => {

      let opRecords = [];

      histories.forEach(snap => {
        opRecords.push(snap.data());
      })
      //console.log("Last few operational records:", opRecords);
      res.status(200).send({opRecords});
    }).catch(err => {
      console.log("Error fetching image optimization op records. Error: \n", err);
    });
  }
}


const getOneUserDoc = function(querySnapshot) {
  return querySnapshot.docs.map(docSnapshot => {
    return docSnapshot.data();
  });
}
const getOneUserDocId = function(querySnapshot) {
  return querySnapshot.docs.map(docSnapshot => {
    return docSnapshot.id;
  });
}


// Create new record when user uploads new asset.
const createOperationRecord = function(opRecord) {
  let usersRef = db.collection("js-asset-users");
  // FIXME check if true or "true" is used
  let userQuery = usersRef.where("is_admin", "==", true);

  return userQuery.get().then(userQuerySnapshot => {
    let userDocId = getOneUserDocId(userQuerySnapshot)[0];
    return db.collection("js-asset-users").doc(userDocId).collection("history").add(opRecord)
  });
}

// FIXME: Add CDN URL INstead, add timestamp.
exports.declare_asset_valid = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);

  // FIXME fix these fields:
  if (user_info.is_admin == true) {
        opRecord.bucket = bucket;
        opRecord.path = key;
        opRecord.view_url = "https://" + bucket + ".s3.amazonaws.com/" + key;
        return createOperationRecord(opRecord).then(done => {
          res.send({ msg: "Success creating asset record"})
        });
  } else {
     res.send({ error: "Failed to create asset record, not an admin user."})
  }
}

// Domain
exports.post_customer_info = function(req, res, next) {
let user_info = jwtTokenData(req, res, next);
  console.log("User Info:", user_info);
  if (!req.body.domain) {
    res.send({ error: "Please enter a valid domain value."});
  } else {
    return updateUserDoc(req, res, next, user_info, req.body.domain).then(updated => {
      res.send({ message: "User domain updated successfully."})
    })
  }
}

// TODO/FIXME: Can be added later.
exports.check_customer_license = function(req, res, next) {
let user_info = jwtTokenData(req, res, next);
  
  console.log("User Info:", user_info);
}