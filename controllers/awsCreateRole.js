


const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];
const lambdaARN = config.lambdaARN;

const admin = require("firebase-admin");

const AWS = require('aws-sdk')
let serviceAccount;

const { db } = require("./setup");

/*
 * Understanding policies and IAM roles:
 *
 * You can create an IAM role with a trust policy, or use updateAssumeRolePolicy to modify the trust policy.
 * Trust policy defines who can assume this role.
 *
 * To add permissions to an IAM role, you attach a policy. You can do this after creating the IAM role.
 * e.g. access to S3 buckets.
 *
 * The way it works is you first create the policy, then attach it referencing it via its ARN.
 */
const roleName = "ImageFix-Lambda-S3-Accessor"

// Add s3Bucketname to policy template and return the JSON string.
const getIAMPolicyGrantS3Access = function(bucketName) {
    let IAMPolicyGrantS3Access =
`{
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
        }
    ]
}`;
    console.log("Policy:", IAMPolicyGrantS3Access)
    return IAMPolicyGrantS3Access;
}

const createIAMPolicy_promise = function(req, res, next, params, iam) {
    
    return new Promise((resolve, reject) => {
        iam.createPolicy(params, function(err, data) {
            if (err) {
                console.log("Error creating policy: " + err); // an error occurred
                reject(err)
            }
            else {
                console.log("Create policy success:" + data);           // successful response
                resolve(data);
            }
        });     
    });
}
 
const queryIAMPolicyExists = function(req, res, next) {
    let user_info = req.user_info;

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let policy = userRef.get("s3BucketIAMPolicy")
        if (policy) {
            return true
        } else {
            return false;
        }
    })
}

/*
 * Check database if policy ARN exists,
 * If it doesn't create the policy and attach to IAM role.
 */
exports.queryCreateAttachIAMPolicy = async function(req, res, next) {
    let user_info = req.user_info;

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        if (queryIAMPolicyExists(req, res, next)) {
            console.log("IAM policy exists for this bucket");
            return 0;
        } else {
            console.log("IAM policy does not exist, creating it.")
            let iam = new AWS.IAM({
                accessKeyId: userRef.get('accessKeyId'),
                secretAccessKey: userRef.get('accessKeySecret')
            });

            let params = {
                PolicyDocument: getIAMPolicyGrantS3Access(userRef.get("s3BucketName")),
                PolicyName: 'GrantS3AccessForImageFixRole'+"-"+ userRef.get("s3BucketName"), /* required */
                Description: 'For executing image optimizations on given S3 buckets',
                Path: '/',
            };
            return createIAMPolicy_promise(req, res, next, params, iam).then(result => {
                console.log("Created the policy with ARN:", result.Policy.Arn);
                return db.collection('users').doc(user_info.id).set({
                    s3BucketIAMPolicy: result.Policy.Arn,
                    }, { merge: true 
                }).then(result => {
                    return attachRolePolicy(req, res, next, result.Policy.Arn, iam).then(result => {
                        return 0;
                    }).catch(err => {
                        console.log("Failed attaching the policy to IAM user.")
                        return err;
                    })
                }).catch(err => {
                    return { error: "Failed saving user credentials.\n" + err };
                });
            }).catch(err => {
                console.log("Failed to create/attach IAM policy:,", err);
                return err;
            })
        }
    })
}

const attachRolePolicy = function(req, res, next, ARN, iam) {
    let params = {
        PolicyArn: ARN,
        RoleName: roleName
    }
    return new Promise((resolve, reject) => {
        iam.attachRolePolicy(params, function(err, data) {
            if (err) {
                console.log("Error attaching policy to Role:" + err, err.stack); // an error occurred
                reject(err)
            }
            else {
                console.log("Attach policy success:" + data);           // successful response
                resolve(data);
            }
        });     
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


// Says this new role can be assumed by Lambda Execution ARN
const getIAMTrustPolicy = function() {
    return `{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "AWS": "${lambdaARN}"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }`;
}

exports.createIAMRole = function(req, res, next) {
    let user_info = req.user_info;
    console.log("Creating the IAM role.")
    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let params = {
            AssumeRolePolicyDocument: getIAMTrustPolicy(),
            RoleName: roleName, /* required */
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
        console.log("Creating IAM role failed.", err);
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



