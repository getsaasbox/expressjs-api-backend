

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

// Cloud firestore key file.
let serviceAccount = require(config.firestoreSecretPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.firestoreDbAddr
});

const db = admin.firestore();
exports.db = db;

const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}

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
				s3BucketIAMPolicy: "",
				LambdaPermissionStatementId: ""
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

	try {
		await createNewUserDoc(req, res, next, user_info);

		return db.collection('users').doc(user_info.id).get().then(user => {
			res.status(200).send({
				status: user.get("install_status_code"), 
				aws_creds: {
					accessKeyId: user.get("accessKeyId"),
					accessKeySecret: user.get("accessKeySecret"),
					accountId: user.get("accountId"),
					s3BucketName: user.get("s3BucketName")
				},
				msg: user.get("install_status_msg") 
			})			
		});

	} catch(error) {
		console.log("Error querying setup state.\n");
		send_setup_errors(req, res, next, error);
	}

}

const { 
	createIAMRole, queryIAMRoleExists, 
	queryCreateAttachIAMPolicy, queryCreateAttachLambdaAssumeRolePolicy,
	queryAddPermissionToInvokeLambda, queryCreateObjectNotifyEvent
} = require("./install");

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

	try {
		await update_status(req, res, next, 1, "Pre-install checks complete.");	
	} catch (errors) {
		console.log("Errors during pre-install checks: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	try {
		await createUpdateUserDoc(req, res, next, user_info);
		await update_status(req, res, next, 2, "User created/updated.");
	} catch (errors) {
		send_setup_errors(req, res, next, error);
	}

	try {
		await queryCreateAssumedRole(req, res, next);
		await update_status(req, res, next, 3, "Assumed Role Created with Lambda Trust Policy");
	} catch (errors) {
		send_setup_errors(req, res, next, error);
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
		await queryAddPermissionToInvokeLambda(req, res, next);
		await update_status(req, res, next, 6, "Set cross-account permission to notify/invoke Lambda function.")
		
	} catch (errors) {
		console.log("Error setting up notifications on S3 bucket: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	try {
		await queryCreateObjectNotifyEvent(req, res, next);
		await update_status(req, res, next, 7, "Created notifications from S3 to Lambda. Setup is complete.")
		res.status(200).send({ msg: "Setup Complete." });
	} catch (errors) {
		console.log("Error setting up notifications on S3 bucket: ", errors);
		send_setup_errors(req, res, next, errors)
	}
}


const { 
	deleteIAMRole, 
	deleteIAMPolicy, deleteLambdaAssumeRolePolicy,
	deletePermissionToInvokeLambda, deleteObjectNotifyEvent
} = require("./install");

const cleanUserDoc = function(req, res, next) {
	return db.collection('users').doc(req.user_info.id).set({

	})
}

exports.uninstall_setup = async function(req, res, next) {
	let user_info = jwtTokenData(req, res, next);
	req.user_info = user_info;

	// Delete object notify event
	try {
		await deleteObjectNotifyEvent(req, res, next);
		await update_status(req, res, next, 6, "Deleted Object Notify event from S3 bucket");
	} catch (errors) {
		console.log("Error deleting object notify event from S3 bucket: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	// Delete Lambda invoke permission from lambda
	try {
		await deletePermissionToInvokeLambda(req, res, next);
		await update_status(req, res, next, 5, "Deleted Permission to invoke Lambda");
	} catch (errors) {
		console.log("Error deleting Permission to invoke Lambda: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	// Delete Assume Role policy from Lambda.
	try {
		await deleteLambdaAssumeRolePolicy(req, res, next);
		await update_status(req, res, next, 4, "Deleted Lambda Assume Role Policy");
	} catch (errors) {
		console.log("Error deleting Lambda Assume Role Policy: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	// Delete S3 IAM policy
	try {
		await deleteIAMPolicy(req, res, next);
		await update_status(req, res, next, 3, "Deleted IAM Policy.");
	} catch (errors) {
		console.log("Error deleting IAM Policy: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	// Delete Assumed role
	try {
		await deleteIAMRole(req, res, next);
		await update_status(req, res, next, 3, "Deleted Assumed Role for Lambda to access S3");
		await update_status(req, res, next, 2, "Uninstall complete. (All permissions/notifications regarding ImageFix are deleted from your account.");
	} catch (errors) {
		console.log("Error deleting Assumed Role for Lambda to access S3: ", errors);
		send_setup_errors(req, res, next, errors)
	}

	// Clean User Doc

	res.status(200).send({ msg: "Uninstall complete. (All permissions/notifications regarding ImageFix are deleted from your account." });
}

