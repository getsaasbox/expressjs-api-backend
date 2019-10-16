

/* This API is used to set up the SaaS */


const rp = require('request-promise');
const env = process.env.NODE_ENV || "development";

const config = require('../config/cloud.js')[env];

const AWS = require('aws-sdk')

const jwt = require('jsonwebtoken');

const jwt_secret = config.jwt_secret;


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

const jwtTokenData = function(token) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}

// Query state of setup
exports.query_setup_state = function(req, res, next) {

	// Verify JWT token:
	let user_data = jwtTokenData(req.body.token);

	res.status(200).send({ state: 0, user: user_data, msg: "Install Not Started."})
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


// Send Serverless behavior settings in JSON, e.g.

/* Delete original, replace original, and so on and so forth */

exports.show_settings = function(req, res, next) {


}

exports.set_settings = function(req, res, next) {

}