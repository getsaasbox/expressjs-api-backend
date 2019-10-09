

/* This API is used to set up the SaaS */


const rp = require('request-promise');
const env = process.env.NODE_ENV || "development";

const config = require('../config/cloud.js')[env];

const AWS = require('aws-sdk')


exports.setup_serverless_status = function(req, res, next) {

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
// replace_original, delete_original
let settings = {
	"replace_original"
}

exports.get_settings = function(req, res, next) {

}

exports.set_settings = function(req, res, next) {

}
