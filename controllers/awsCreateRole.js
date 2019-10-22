


const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];
const lambdaARN = config.lambdaARN;

const admin = require("firebase-admin");

const AWS = require('aws-sdk')
let serviceAccount;

const { db } = require("./setup");

const getCrossAccountTrustPolicy = function(policy) {
	let crossAccountTrustPolicy = `{
	    "Version": "2012-10-17",
	    "Statement": [
	        {
	            "Effect": "Allow",
	            "Principal": {
	                "AWS": '${lambdaARN}'
	            },
	            "Action": "sts:AssumeRole"
	        }
	    ]
	}`
	console.log("TrustPolicy:", crossAccountTrustPolicy)
    return crossAccountTrustPolicy;
}

const updateIAMRoleTrustPolicy_promise = function(req, res, next, params, iam) {
	return new Promise((resolve, reject) => {
		iam.updateAssumeRolePolicy(params, function(err, data) {
  			if (err) {
  				console.log(err, err.stack); // an error occurred
  				reject(err)
  			}
  			else {
  				console.log(data);           // successful response
  				resolve(data);
  			}
		});		
	});
}


// We have an existing local IAM Role just created for Lambda to access,
// Here we modify it's trust policy to allow Lambda function's role as its principal.
exports.updateIAMRoleTrustPolicy = function(req, res, next) {
	let user_info = req.user_info;
	return db.collection('users').doc(user_info.id).get().then(userRef => {
		let iam = new AWS.IAM({
			accessKeyId: userRef.get('accessKeyId'),
			secretAccessKey: userRef.get('accessKeySecret')
		});
		let params = {
			PolicyDocument: getCrossAccountTrustPolicy(crossAccountTrustPolicy),	/* Policy adds Lambda role as principal */
			RoleName: 'ImageFix-Lambda-S3-Accessor' /* Customer local IAM role */ 
		}
		return updateIAMRoleTrustPolicy_promise(req, res, next, params, iam);
	});
}

const createIAMRole_promise = function(req, res, next, params, iam) {
	return new Promise((resolve, reject) => {
		iam.createRole(params, function(err, data) {
  			if (err) {
  				console.log("Error creating IAM Role:" + err, err.stack); // an error occurred
  				reject(err)
  			}
  			else {
  				console.log("Create role success:" + data);           // successful response
  				resolve(data);
  			}
		});		
	});
}

// Add s3Bucketname to policy template and return the JSON string.
const getIAMPolicyGrantS3Access = function(bucketName) {
	let IAMPolicyGrantS3Access = `{
		"Version": "2012-10-17",
		"Statement": [
			{
				"Action": [
					"s3:ListAllMyBuckets"
				],
				"Effect": "Allow",
				"Resource": [
					"arn:aws:s3:::*"
				]
			},
			{
				"Action": [
					"s3:ListBucket",
					"s3:GetBucketLocation"
				],
				"Effect": "Allow",
				"Resource": "arn:aws:s3:::${bucketName}"
			},
			{
				"Effect": "Allow",
				"Action": [
					"s3:GetObject",
					"s3:PutObject"
				],
				"Resource": "arn:aws:s3:::${bucketName}/*"
			},
		]
	}`;
	console.log("Policy:", IAMPolicyGrantS3Access)
	return IAMPolicyGrantS3Access; 
}

exports.createIAMRole = function(req, res, next) {
	let user_info = req.user_info;
	console.log("Creating the IAM role.")
	return db.collection('users').doc(user_info.id).get().then(userRef => {
		let params = {
		 	AssumeRolePolicyDocument: getIAMPolicyGrantS3Access(userRef.get("s3BucketName")),
		 	RoleName: 'ImageFix-Lambda-S3-Accessor', /* required */
		 	Description: 'Executes Image optimizations on your S3 buckets',
		 	MaxSessionDuration: '43200',
		 	Path: '/',
		 	//PermissionsBoundary: 'STRING_VALUE',
		 	Tags: [
		 		{
					Key: 'ImageFix', /* required */
					Value: 'ImageFix' /* required */
				}
		 	]
		};
		let iam = new AWS.IAM({
			accessKeyId: userRef.get('accessKeyId'),
			secretAccessKey: userRef.get('accessKeySecret')
		});
		return createIAMRole_promise(req, res, next, params, iam)
	}).catch(err => {
		console.log("Firestore error fetching user", err);
		return err;
	})
}

exports.queryIAMRoleExists = function(req, res, next) {
	let user_info = req.user_info;

	return db.collection('users').doc(user_info.id).get().then(userRef => {
		let iam = new AWS.IAM({
			accessKeyId: userRef.get('accessKeyId'),
			secretAccessKey: userRef.get('accessKeySecret')
		});

		let params = {
			RoleName: 'ImageFix-Lambda-S3-Accessor'
		}

		return new Promise((resolve, reject) => {
			iam.getRole(params, function(err, data) {
				if (err) {
					reject(err)
				}
				if (data) {
					resolve(data)
				}
			});
		});
	})
}



