

/* This API is used to set up the SaaS */


const rp = require('request-promise');
const env = process.env.NODE_ENV || "development";

const { isEmpty, merge } = require('lodash');
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
exports.db = db;

const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
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
const createNewUserDoc = async function(req, res, next, user_info) {
	return db.collection('users').doc(user_info.id).get().then(user => {
		if (!user.exists) {
			return db.collection('users').doc(user_info.id).set({
				accessKeyId: "",
				accessKeySecret: "",
				accountId: "",
				s3BucketName: "",
				install_status_code: 0,
				install_status_msg: "Install Not Started",
				LambdaAssumeRolePolicy: "",
				s3BucketIAMPolicy: ""
			}).then(userRef => {
				return 0;
			}).catch(err => {
				return { error: "Failed to create user in Firestore.\n" + err }
			});
		} else {
			return 0;
		}
	});
}

const createUpdateUserDoc = async function(req, res, next, user_info) {
	return db.collection('users').doc(user_info.id).set({
		accessKeyId: req.body.accessKeyId,
		accessKeySecret: req.body.accessKeySecret,
		accountId: req.body.accountId,
		s3BucketName: req.body.s3BucketName
		}, { merge: true }).then(result => {
		return 0;
	}).catch(err => {
		return { error: "Failed saving user credentials.\n" + err };
	});
}

// Query state of setup
exports.query_setup_state = async function(req, res, next) {

	// Verify JWT token:
	let user_info = jwtTokenData(req, res, next);

	let error = await createNewUserDoc(req, res, next, user_info);
	
	if (error) {
		send_setup_errors(req, res, next, error);
	}

	return db.collection('users').doc(user_info.id).get().then(user => {
		res.status(200).send({
			status: user.get("install_status_code"), 
			user: user_info, 
			msg: user.get("install_status_msg") 
		})			
	});
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

const { 
	createIAMRole, queryIAMRoleExists, 
	queryCreateAttachIAMPolicy, queryCreateAttachLambdaAssumeRolePolicy,
	queryAddPermissionToInvokeLambda, queryCreateObjectNotifyEvent
} = require("./awsCreateRole");

const queryCreateAssumedRole = async function(req, res, next) {
	return queryIAMRoleExists(req, res, next).then(result => {
		console.log("QueryIAMRoleExists success");
		return 0;
	}).catch(err => {
		console.log("QueryIAMRoleExists exception")
		return createIAMRole(req, res, next).then(result => {
			console.log("IAM Role created:", result)
			return 0;
		}).catch(err => {
			console.log("Failed to create IAM role:", err);
			return { error: "Failed to create IAM role:" + err }
		})
	});
}

/** Attach Lambda Policy **/
const queryLambdaPolicyAttached = function(req, res, next) {

}

/** Lambda Policy **/
const attachLambdaPolicy = function(req, res, next) {
	let errors = {}
	// Call AWS to create assumed role.

	update_status({ status: 1, msg: "Lambda Policy Attached."});
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

	update_status({ status: 12, msg: "S3 Object Create Notify Event Created"});
	return 0;
}


const queryCreateObjectNotifyEvent = function(req, res, next) {

	if (queryObjectNotifyEventExists(req, res, next)) {
		return 0;
	} else {
		return createObjectNotifyEvent(req, res, next);
	}
}

const s3headBucket_promise = function(req, res, next) {
	let s3 = new AWS.S3({
		accessKeyId: req.body.accessKeyId,
		secretAccessKey: req.body.accessKeySecret
	});

	let params = {
		Bucket: req.body.s3BucketName
	};

	return new Promise((resolve, reject) => {
		return s3.headBucket(params, function(err, data) {
	  		if (err) {
	  			console.log(err, err.stack);
	  			reject(err);
	  		}
	  		else {
				console.log(data);
				resolve(data);
			}
		});
	});
}


const bucketExists = function(req, res, next) {
	return s3headBucket_promise(req, res, next).then(success => {
		return true;
	}).catch(error => {
		return false;
	})
}

const update_status = async function (req, res, next, code, msg) {
	let user_info = req.user_info;
	return db.collection('users').doc(user_info.id).set({
			install_status_code: code,
			install_status_msg: msg
	}, { merge: true });
}


// Check if s3 bucket exists
const pre_install_check = async function(req, res, next) {
	return bucketExists(req, res, next, req.body.s3BucketName).then(exists => {
		return {};
	}).catch(err => {
		let errors = {};
		errors.bucketNotExists = "Bucket does not exist. Please enter the name of an existing bucket.";
		return errors;
	})
}


const send_setup_errors = function(req, res, next, errors) {
	res.status(200).send({ errors });
}

const emptyField = function(str) {
	return (!str || 0 === str.length)
}

const validate_setup = async function(req, res, next) {
	let aws_creds = req.body;
	let errors = {};

	if (emptyField(aws_creds.accessKeyId)) {
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
	
	let pre_install_errors = await pre_install_check(req, res, next);

	errors = merge(errors, pre_install_errors);

	if (!isEmpty(errors)) {
		return errors;
	} else {
		return 0;
	}
}


const setup_state = {
	"0" : "Install not started.",
	"1" : "Pre-install checks complete.",
	"2" : "User found or created.",
	"3" : "Created Assumed Role with Lambda Trust Policy.",
	"4" : "Created and Attached Policy for S3 access.",
	"5" : "Attached Policy to Lambda to let it switch to Assumed Role.",
	"6" : "Creating Notifications from AWS S3.",
	"7" : "Install Complete."
}

exports.submit_setup = async function(req, res, next) {
	let user_info = jwtTokenData(req, res, next);
	req.user_info = user_info;

	let errors = await validate_setup(req, res, next);
	if (!isEmpty(errors)) {
		send_setup_errors(req, res, next, errors)
	}
	await update_status(req, res, next, 1, "Pre-install checks complete.");

	let error = await createUpdateUserDoc(req, res, next, user_info)
	if (error) {
		send_setup_errors(req, res, next, error);
	}
	await update_status(req, res, next, 2, "User created/updated.");

	error = await queryCreateAssumedRole(req, res, next);

	if (error) {
		send_setup_errors(req, res, next, error);
	} else {
		await update_status(req, res, next, 3, "Assumed Role Created with Lambda Trust Policy");
	}

	try {
		await queryCreateAttachIAMPolicy(req, res, next);
		await update_status(req, res, next, 4, "Created and Attached Policy for S3 Access");
	} catch (error) {
		send_setup_errors(req, res, next, error)
	}

	try {
		await queryCreateAttachLambdaAssumeRolePolicy(req, res, next);
		await update_status(req, res, next, 5, "Attached Policy to Lambda to let it switch to Assumed role");
	} catch (errors) {
		console.log("Error query/create/attach/ Lambda policy to assume role: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	try {
		await queryCreateObjectNotifyEvent(req, res, next);
		await update_status(req, res, next, 6, "Created notifications from S3 to Lambda")
	} catch (errors) {
		console.log("Error setting up notifications on S3 bucket: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	try {
		await queryAddPermissionToInvokeLambda(req, res, next);
		await update_status(req, res, next, 7, "Set cross-account permission to notify/invoke Lambda function")
		res.status(200).send({ msg: "Setup Complete." });

	} catch (errors) {
		console.log("Error setting up notifications on S3 bucket: ", errors);
		send_setup_errors(req, res, next, errors)
	}
}

exports.uninstall_setup = function(req, res, next) {
	
}

