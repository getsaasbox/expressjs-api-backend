

/* This API is used to set up the SaaS */


const rp = require('request-promise');
const env = process.env.NODE_ENV || "development";

const { isEmpty } = require('lodash');
const validator = require('validator');
const config = require('../config/cloud.js')[env];

const AWS = require('aws-sdk')

const jwt = require('jsonwebtoken');

const jwt_secret = config.jwt_secret;



const admin = require("firebase-admin");


let serviceAccount;

// Cloud firestore key file.
if (process.env.NODE_ENV == "production")
	serviceAccount = require("/etc/secrets/imagefix-firestore-keys.json");
else if (process.env.NODE_ENV == "development")
	serviceAccount = require("../config/imagefix-firestore-keys.json");


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://imagefix-8377c.firebaseio.com"
});

const db = admin.firestore();


const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}


/* Setup states:
 
 0 - Install not started,

 1 - Credentials received, installing.

 1.1 Create assumed role

 1.2 Create trust policy

 1.3 Attaching IAM policy to server

 1.4 Enable notifications from S3 bucket

 2 - Install complete, system operational

 3 - Uninstall Starting...

 4 - Uninstall Complete -> Going back to 0 Install Not Started.
 */

const setup_state = {
	"0" : "Install not started.",
	"1" : "Credentials received, installing.",
	"2" : "Created Assumed Role.",
	"3" : "Created Trust Policy.",
	"4" : "Attached Lambda Policy to server function.",
	"5" : "Creating Notifications from AWS S3.",
	"6" : "Install Complete."
}

/* A user document: 
{
	accessKeyId: "",
	accessKeySecret: "",
	accountId: "",
	install_status_code: "",
	install_status_msg" ""
	quota: "",
	s3BucketName: ""
}
*/

const getOrCreateNewUserDoc = function(req, res, next, user_info) {
	return db.collection('users').doc(user_info.id).get().then(user => {
		if (!user.exists) {
			return db.collection('users').doc(user_info.id).set({
				accessKeyId: "",
				accessKeySecret: "",
				accountId: "",
				s3BucketName: "",
				install_status_code: 0,
				install_status_msg: "Install Not Started"
			}).then(userRef => {
				return userRef;
			});
		} else {
			return db.collection('users').doc(user_info.id)
		}
	})
}

// Query state of setup

exports.query_setup_state = function(req, res, next) {

	// Verify JWT token:
	let user_info = jwtTokenData(req, res, next);

	console.log("User info on token:", user_info);

	return getOrCreateNewUserDoc(req, res, next, user_info).then(user => {

		res.status(200).send({
			state: user.get("install_status_code"), 
			user: user_info, 
			msg: user.get("install_status_msg") 
		})	
	})
}


exports.setup_serverless_complete = function(req, res, next) {
	// Fetch Customer Account ID, Access Key ID, and Secret

	// Query Assumed Role Exists
	// No -> Create Assumed Role

	// --- Update Status --- 

	// Query Assumed Role has S3 access.
	// No -> Add S3 access to Assumed Role

	// --- Update Status --- 

	// Query Trust Policy exists, pointing at Lambda ARN
	// No -> Create Trust Policy in assumed Role.

	// --- Update Status --- 

	// Fetch Service Account ID, Access Key ID, and Secret

	// --- Update Status --- 

	// Attach IAM policy to Lambda execution role
	// - Include Customer account ID and assumed role.

	// --- Update Status --- 

	// Query target S3 bucket exists on customer account.

	// --- Update Status --- 

	// Create object notification event on target S3 bucket
	// - Include Service Account Lambda ARN on request.

	// --- Update Status --- 
}


const send_setup_errors = function(req, res, next, errors) {
	res.status(200).send({ errors });
}

const emptyField = function(str) {
	return (!str || 0 === str.length)
}
const validate_setup = function(req, res, next) {
	let aws_creds = req.body;
	console.log("aws_creds", aws_creds)
	let errors = {};

	if (emptyField(aws_creds.accessKeyId)) {
		console.log("accessKeyId: ", aws_creds.accessKeyId)
		errors.accessKeyId = "Invalid or empty Access Key ID"
	}
	if (emptyField(aws_creds.accessKeySecret)) {
		errors.accessKeySecret = "Invalid or empty Access Key Secret"
	}
	if (emptyField(aws_creds.accountId)) {
		errors.accountId = "Invalid or empty Root Account ID"
	}
	if (emptyField(aws_creds.s3BucketName)) {
		errors.s3BucketName = "Invalid or empty S3 Bucket Name"
	}
	req.aws_creds = aws_creds;
	return errors;
}


/** Create Assumed Role **/
const queryAssumedRoleExists = function(req, res, next) {

}

const createAssumedRole = function(req, res, next) {
	let errors = {}
	// Call AWS to create assumed role.
	updateStatus({ status: 1, msg: "Assumed Role Created."});
	return 0;
}

const queryCreateAssumedRole = function(req, res, next) {

	if (queryAssumedRoleExists(req, res, next)) {
		return 0;
	} else {
		return createAssumedRole(req, res, next);
	}
}

const queryTrustPolicyExists = function(req, res, next) {

}

/** Create Trust Policy **/
const createTrustPolicy = function(req, res, next) {
	let errors = {}
	// Call AWS to create assumed role.

	updateStatus({ status: 1, msg: "Trust Policy Created"});
	return 0;
}

const queryCreateTrustPolicy = function(req, res, next) {

	if (queryTrustPolicyExists(req, res, next)) {
		return 0;
	} else {
		return createTrustPolicy(req, res, next);
	}
}

/** Attach Lambda Policy **/
const queryLambdaPolicyAttached = function(req, res, next) {

}

/** Lambda Policy **/
const attachLambdaPolicy = function(req, res, next) {
	let errors = {}
	// Call AWS to create assumed role.

	updateStatus({ status: 1, msg: "Lambda Policy Attached."});
	return 0;
}

const queryAttachLambdaPolicy = function(req, res, next) {

	if (queryLambdaPolicyExists(req, res, next)) {
		return 0;
	} else {
		return attachLambdaPolicy(req, res, next);
	}
}

/** Set up S3 bucket to Lambda notification **/
const queryObjectNotifyEventExists = function(req, res, next) {

}

/** Lambda Policy **/
const createObjectNotifyEvent = function(req, res, next) {
	let errors = {}
	// Call AWS to create assumed role.

	updateStatus({ status: 12, msg: "S3 Object Create Notify Event Created"});
	return 0;
}


const queryCreateObjectNotifyEvent = function(req, res, next) {

	if (queryObjectNotifyEventExists(req, res, next)) {
		return 0;
	} else {
		return createObjectNotifyEvent(req, res, next);
	}
}

// Check if s3 bucket exists
const pre_install_check = function(req, res, next) {

}

const setUserAwsCreds = function(req, res, next, user) {
	return user.set({
		accessKeyId: req.aws_creds.accessKeyId,
		accessKeySecret: req.aws_creds.accessKeySecret,
		accountId: req.aws_creds.accountId,
		s3BucketName: req.aws_creds.s3BucketName
		//install_status_code: 0,
		//install_status_msg: "Install Not Started"
	})
}

exports.submit_setup = function(req, res, next) {

	let user_info = jwtTokenData(req, res, next);

	let errors = validate_setup(req, res, next);

	if (!isEmpty(errors)) {
		send_setup_errors(req, res, next, errors)
	} else {
		return getOrCreateNewUserDoc(req, res, next, user_info).then(userRef => {
			console.log("aws_creds:", req.aws_creds);
			return setUserAwsCreds(req, res, next, userRef).then(user => {
				/*
				// TODO: Save credentials / Entry point with saved credentials.
				// TODO: Check S3 bucket exists.
				errors = pre_install_check(req, res, next);

				if (errors) {
					send_setup_errors(req, res, next, errors)
				}
				errors = queryCreateAssumedRole(req, res, next);
				if (errors) {
					send_setup_errors(req, res, next, errors)
				}
				errors = queryCreateTrustPolicy(req, res, next);
				if (errors) {
					send_setup_errors(req, res, next, errors)
				}
				errors = queryAttachLambdaPolicy(req, res, next);
				if (errors) {
					send_setup_errors(req, res, next, errors)
				}
				errors = queryCreateObjectNotifyEvent(req, res, next);
				if (errors) {
					send_setup_errors(req, res, next, errors)
				}
				*/
			});
		});
	}
}

exports.uninstall_setup = function(req, res, next) {
	
}

