


const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];
const lambdaRoleARN = config.lambdaRoleARN;

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
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:GetObjectAcl",
                "s3:DeleteObject"
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

const deleteIAMPolicy_promise = function(req, res, next, iam, policyARN) {
    var params = {
        PolicyArn: policyARN
    };

    return new Promise((resolve, reject) => {
        iam.deletePolicy(params, function(err, data) {
            if (err) {
                console.log("Error deleting IAM policy. Error: ", err); // an error occurred
                reject(err)
            }
            else {
                console.log("Success deleting IAM policy. ", data);           // successful response
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
            console.log("Policy:", policy)
            return true
        } else {
            return false;
        }
    })
}

const createAttachIAMPolicy = function(req, res, next, userRef) {
    let user_info = req.user_info;

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
        let policy = result.Policy;
        console.log("Created the policy with ARN:", policy.Arn);
        return db.collection('users').doc(user_info.id).set({
            s3BucketIAMPolicy: policy.Arn,
            }, { merge: true 
        }).then(result => {
            return attachRolePolicy(req, res, next, policy.Arn, iam, roleName).then(result => {
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

exports.deleteIAMPolicy = async function(req, res, next) {
    let user_info = req.user_info;

    let iam = new AWS.IAM({
        accessKeyId: userRef.get('accessKeyId'),
        secretAccessKey: userRef.get('accessKeySecret')
    });
    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let policy = userRef.get("s3BucketIAMPolicy");
        return detachRolePolicy(req, res, next, policy, iam, roleName).then(detachedResult => {
            return deleteIAMPolicy_promise(req, res, next, iam, policy);
        });
    });
}

/*
 * Check database if policy ARN exists,
 * If it doesn't create the policy and attach to IAM role.
 */
exports.queryCreateAttachIAMPolicy = async function(req, res, next) {
    let user_info = req.user_info;

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        return queryIAMPolicyExists(req, res, next).then(exists => {
            if (exists) {
                console.log("IAM policy exists for this bucket");
                return 0;
            } else {
                 console.log("IAM policy does not exist, creating it.")
                 return createAttachIAMPolicy(req, res, next, userRef)
            }
        });
    })
}

const attachRolePolicy = function(req, res, next, ARN, iam, role) {
    let params = {
        PolicyArn: ARN,
        RoleName: role
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

const detachRolePolicy = function(req, res, next, ARN, iam, role) {
    let params = {
        PolicyArn: ARN,
        RoleName: role
    };

    return new Promise((resolve, reject) => {
        iam.detachRolePolicy(params, function(err, data) {
            if (err) {
                console.log("Error detaching policy from Role. Error:" + err, err.stack); // an error occurred
                reject(err)
            }
            else {
                console.log("Detach policy success:" + data);           // successful response
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

const deleteIAMRole_promise = function(req, res, next, params, iam) {
    return new Promise((resolve, reject) => {
        iam.deleteRole(params, function(err, data) {
            if (err) {
                console.log("Error deleting IAM Role. Error:", err, err.stack); // an error occurred
                reject(err)
            }
            else {
                console.log("Delete IAM role success:", data);           // successful response
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
                    "AWS": "${lambdaRoleARN}"
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

// Deletes the Role created on customer account that Lambda execution role can assume to execute image optimizations
exports.deleteIAMRole = function(req, res, next) {
    let params = {
        RoleName: roleName
    };
    let iam = new AWS.IAM({
        accessKeyId: userRef.get('accessKeyId'),
        secretAccessKey: userRef.get('accessKeySecret')
    });
    return deleteIAMRole_promise(req, res, next, params, iam);
}

exports.queryIAMRoleExists = function(req, res, next) {
    let user_info = req.user_info;

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let iam = new AWS.IAM({
            accessKeyId: userRef.get('accessKeyId'),
            secretAccessKey: userRef.get('accessKeySecret')
        });

        let params = {
            RoleName: roleName
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

const queryLambdaAssumeRolePolicyExists = function(req, res, next) {
    let user_info = req.user_info;

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let policy = userRef.get("LambdaAssumeRolePolicy")
        if (policy) {
            console.log("Policy:", policy)
            return true
        } else {
            return false;
        }
    })
}



const getLambdaAssumeRolePolicy = function(customerAccountId) {
    let lambdaAssumeRolePolicy =
`{
    "Version": "2012-10-17",
    "Statement": {
        "Effect": "Allow",
        "Action": "sts:AssumeRole",
        "Resource": "arn:aws:iam::${customerAccountId}:role/${roleName}"
    }
}`
    return lambdaAssumeRolePolicy;

}

/* Create policy in our service account to let our Lambda to assume the role in customer account */
const createAttachLambdaAssumeRolePolicy = function(req, res, next, userRef) {
    let user_info = req.user_info;

    let iam = new AWS.IAM({
        accessKeyId: config.awsLambdaAssumeRoleAccessKeyId,
        secretAccessKey: config.awsLambdaAssumeRoleSecret
    });

    let params = {
        PolicyDocument: getLambdaAssumeRolePolicy(userRef.get("accountId")),
        PolicyName: 'LambdaAssumeCrossAccountRole'+"-"+ userRef.get("accountId"), /* required */
        Description: 'For executing image optimizations on cross-account S3 buckets',
        Path: '/',
    };
    return createIAMPolicy_promise(req, res, next, params, iam).then(result => {
        console.log("Created the policy with ARN:", result.Policy.Arn);
        let policy = result.Policy;
        return db.collection('users').doc(user_info.id).set({
            LambdaAssumeRolePolicy: policy.Arn,
            }, { merge: true 
        }).then(result => {
            console.log("Attaching policy: " + policy.Arn + " to lambda role: ", config.lambdaRole)
            return attachRolePolicy(req, res, next, policy.Arn, iam, config.lambdaRole).then(result => {
                console.log("Attached policy: " + policy.Arn + " to lambda role: ", config.lambdaRole)
                return 0;
            }).catch(err => {
                console.log("Failed attaching the policy to Lambda role.")
                return err;
            })
        }).catch(err => {
            console.log("Failed saving Lambda Policy ARN to firestore. Error: ", err)
            return { error: "Failed saving Lambda Policy ARN to firestore. Error: " + err };
        });
    }).catch(err => {
        console.log("Failed to create/attach IAM policy:,", err);
        return err;
    })
}

const deleteLambdaAssumeRolePolicy_promise = function(req, res, next, iam, policyARN) {
    var params = {
        PolicyArn: policyARN
    };

    return new Promise((resolve, reject) => {
        iam.deletePolicy(params, function(err, data) {
            if (err) {
                console.log("Error deleting Lambda assume role policy. Error: ", err); // an error occurred
                reject(err)
            }
            else {
                console.log("Success deleting Lambda assume role policy. ", data);           // successful response
                resolve(data);
            }
        });     
    });
}

exports.queryCreateAttachLambdaAssumeRolePolicy = async function(req, res, next) {
    let user_info = req.user_info;

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        return queryLambdaAssumeRolePolicyExists(req, res, next).then(exists => {
            if (exists) {
                console.log("Lambda Assume Role policy exists for this account");
                return 0;
            } else {
                 console.log("Lambda Assume role policy does not exist, creating it.")
                 return createAttachLambdaAssumeRolePolicy(req, res, next, userRef)
            }
        });
    });
}

// FIXME: You may have to first list policy versions, and then delete all versions, before deleting this one.
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/IAM.html#listPolicyVersions-property
// https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/IAM.html#deletePolicyVersion-property
exports.deleteLambdaAssumeRolePolicy = async function(req, res, next) {
    let user_info = req.user_info;

    let iam = new AWS.IAM({
        accessKeyId: config.awsLambdaAssumeRoleAccessKeyId,
        secretAccessKey: config.awsLambdaAssumeRoleSecret
    });

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let policy = userRef.get("LambdaAssumeRolePolicy");
        // We need a detach role policy first from config.LambdaRole
        return detachRolePolicy(req, res, next, policy, iam, config.lambdaRole).then(detachedResult => {
            return deleteLambdaAssumeRolePolicy_promise(req, res, next, iam, policy);
        })
    });
}


const addPermissionToInvokeLambda_promise = function(req, res, next, lambda, bucket, account, statementId) {
    /* This example adds a permission for an S3 bucket to invoke a Lambda function. */
    var params = {
        Action: "lambda:InvokeFunction", 
        FunctionName: functionName, 
        Principal: "s3.amazonaws.com", 
        SourceAccount: account, 
        // Warning: docs say use bucket/* but this doesn't work, correct way is to use just bucket
        SourceArn: `arn:aws:s3:::${bucket}`, 
        StatementId: statementId
    };
    return new Promise((resolve, reject) => {
        lambda.addPermission(params, function(err, data) {
            if (err) {
                console.log("Could not add permission to Lambda to be invoked by S3 bucket", err, err.stack); // an error occurred
                reject(err)    
            } else {
                console.log("Added permission to Lambda to be invoked by S3 Bucket.", data)
                resolve(data);
            }
        })
    });
}

const deletePermissionToInvokeLambda_promise = function(req, res, next, lambda, params) {
    return new Promise((resolve, reject) => {
        lambda.removePermission(params, function(err, data) {
            if (err) {
                console.log("Error, Could not remove permission from Lambda that lets invokations from S3 bucket. Error: ", err, err.stack); // an error occurred
                reject(err)    
            } else {
                console.log("Successfully removed permission from Lambda that let it to be invoked by S3 Bucket.", data)
                resolve(data);
            }
        })
    });
}

const functionName = "ImageFix";

const permissionToInvokeLambdaStatementExists = function(req, res, next, userRef, statement) {
    let statementId = userRef.get("LambdaPermissionStatementId");
        // This statememt was previously added, for this account andb bucket.
    if (statementId == statement)
        return true;
    else 
        return false;
}

// TODO: Check permission does not exist.
exports.queryAddPermissionToInvokeLambda = async function(req, res, next) {
    let user_info = req.user_info;

    let lambda = new AWS.Lambda({
        accessKeyId: config.awsLambdaAssumeRoleAccessKeyId,
        secretAccessKey: config.awsLambdaAssumeRoleSecret,
        region: "us-west-1"
    });

    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let bucket = userRef.get("s3BucketName");
        let account = userRef.get("accountId");
        let statementId = account + "-" + bucket;

        if (permissionToInvokeLambdaStatementExists(req, res, next, userRef, statementId)) {
            console.log("Lambda Invoke Permission already exists for this S3 bucket/account. StatementId: ", statementId);
            return 0;
        } else {
            return addPermissionToInvokeLambda_promise(req, res, next, lambda, bucket, account, statementId).then(result => {
                console.log("Success adding permission to invoke lambda from S3 bucket");
                return db.collection('users').doc(user_info.id).set({
                    LambdaPermissionStatementId : statementId,
                    LambdaPermissionStatement: result.Statement
                }, { merge: true });
            }).catch(err => {
                console.log("Error adding permission to invoke lambda from s3. Error: ", err);
                return err;
            })
        }
    });
}

exports.deletePermissionToInvokeLambda = async function(req, res, next) {
    let lambda = new AWS.Lambda({
        accessKeyId: config.awsLambdaAssumeRoleAccessKeyId,
        secretAccessKey: config.awsLambdaAssumeRoleSecret,
        region: "us-west-1"
    });

    let user_info = req.user_info;
    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let statementId = userRef.get("LambdaPermissionStatementId");
        let params = {
            FunctionName: functionName,
            StatementId: statementId
        };
        return deletePermissionToInvokeLambda_promise(req, res, next, lambda, params);
    });
}

const createObjectNotifyEvent_promise = function(req, res, next, s3, bucketName) {
    var params = {
        Bucket: bucketName, 
        NotificationConfiguration: {
            LambdaFunctionConfigurations: [{
                Id: functionName + "-png",
                Events: [ /* required */
                    "s3:ObjectCreated:*",
                ],
                LambdaFunctionArn: config.lambdaARN, /* required */
                Filter: {
                    Key: {
                        FilterRules: [{
                            Name: "suffix",
                            Value: 'png'
                        }]
                    }
                },
            },{
                Id: functionName + "-jpg",
                Events: [ /* required */
                    "s3:ObjectCreated:*",
                ],
                LambdaFunctionArn: config.lambdaARN, /* required */
                Filter: {
                    Key: {
                        FilterRules: [{
                            Name: "suffix",
                            Value: 'jpg'
                        }]
                    }
                },
            },{
                Id: functionName + "-jpeg",
                Events: [ /* required */
                    "s3:ObjectCreated:*",
                ],
                LambdaFunctionArn: config.lambdaARN, /* required */
                Filter: {
                    Key: {
                        FilterRules: [{
                            Name: "suffix",
                            Value: 'jpeg'
                        }]
                    }
                },
            }],
        }
    };

    return new Promise((resolve, reject) => {
        s3.putBucketNotificationConfiguration(params, function(err, data) {
            if (err) {
                console.log("Error setting up notification from S3 to Lambda. Error: ", err);
                reject(err)
            } else {
                console.log("Success setting up notification from S3 to Lambda.");
                console.log(data);
                resolve(data);
            }
        });
    });
}

const getBucketNotificationConfig_promise = function(req, res, next, s3, bucketName) {
    let params = {
        Bucket: bucketName
    };
    return new Promise((resolve, reject) => {
        s3.getBucketNotificationConfiguration(params, function(err, data) {
            if (err) {
                console.log("Error getting notification configuration of S3 bucket. Error: ", err);
                reject(err)
            } else {
                console.log("Success getting notification configuration of S3 bucket.");
                console.log(data);
                resolve(data);
            }
        });
    });

}

// This is a read-modify-write operation. Deletes our Lambda function notify events from a notify event array.
// It does it by reading the existing config and modifying it, so we don't delete other events. ATM you can't individually delete notify events.
const deleteObjectNotifyEvent_promise = function(req, res, next, s3, bucketName) {
    return getBucketNotificationConfig_promise(req, res, next, s3, bucketName).then(bucketNotifyConfig => {
        // Find the ids to be deleted: 
        let LFConfigs = bucketNotifyConfig.LambdaFunctionConfigurations.map(lfconfig => {
            if (!lfconfig.Id.startsWith(functionName)) {
                return lfconfig;
            }
        });

        // Filtered out the configs notifying our Lambdas.
        bucketNotifyConfig.LambdaFunctionConfigurations = LFConfigs;

        console.log("Updated bucket notify config with Imagefix lambda notify configs deleted:", bucketNotifyConfig);
        let params = {
            Bucket: bucketName,
            NotificationConfiguration: bucketNotifyConfig
        }

        return new Promise((resolve, reject) => {
            s3.putBucketNotificationConfiguration(params, function(err, data) {
                if (err) {
                    console.log("Error setting bucket notification configuration with Imagefix lambda notifications removed. Error: ", err);
                    reject(err)
                } else {
                    console.log("Success setting bucket notification configuration with Imagefix lambda notifications removed.");
                    console.log(data);
                    resolve(data);
                }
            });
        });
    });
}

// TODO: Check notify event does not exist.
exports.queryCreateObjectNotifyEvent = async function(req, res, next) {
    let user_info = req.user_info;
    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let s3 = new AWS.S3({
            accessKeyId: userRef.get('accessKeyId'),
            secretAccessKey: userRef.get('accessKeySecret'),
        });
        return createObjectNotifyEvent_promise(req, res, next, s3, userRef.get("s3BucketName"));
    });
}


exports.deleteObjectNotifyEvent = async function(req, res, next) {
    let user_info = req.user_info;
    return db.collection('users').doc(user_info.id).get().then(userRef => {
        let s3 = new AWS.S3({
            accessKeyId: userRef.get('accessKeyId'),
            secretAccessKey: userRef.get('accessKeySecret'),
        });
        return deleteObjectNotifyEvent_promise(req, res, next, s3, userRef.get("s3BucketName"));
    });
}

