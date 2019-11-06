


exports.development = {
	"jwt_secret" : "67c93071e063adead11bec4fde30110139c9",
	"lambdaARN" : "arn:aws:iam::317925744813:role/service-role/ImageFix-role-yh8a5jhs",
	"lambdaRole": "ImageFix-role-yh8a5jhs",
	/* For adding new assume role policies to our lambda function IAM */
	"awsLambdaAssumeRoleAccessKeyId": process.env.awsLambdaAssumeRoleAccessKeyId,
	"awsLambdaAssumeRoleSecret" : process.env.awsLambdaAssumeRoleSecret,
}

exports.production = {
	"jwt_secret" : "67c93071e063adead11bec4fde30110139c9",
	"lambdaARN" : "arn:aws:iam::317925744813:role/service-role/ImageFix-role-yh8a5jhs",
	"lambdaRole": "ImageFix-role-yh8a5jhs",
	/* For adding new assume role policies to our lambda function IAM */
	"awsLambdaAssumeRoleAccessKeyId": process.env.awsLambdaAssumeRoleAccessKeyId,
	"awsLambdaAssumeRoleSecret" : process.env.awsLambdaAssumeRoleSecret,
}
