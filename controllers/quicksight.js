

/* This is a separate application with a separate rest API point */

const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];


const AWS = require('aws-sdk')

AWS.config.update({region: 'us-east-1'});

let quicksight = new AWS.QuickSight({
  accessKeyId: process.env.quicksightUserAccessKeyId, 
  secretAccessKey: process.env.quicksightUserSecret
});

const jwt = require('jsonwebtoken');

const jwt_secret = config.quicksight_jwt_secret;


var params = {
  AuthorizedResourceArns: [ /* required */
    "arn:aws:quicksight:us-east-1:452769287049:dashboard/0795a3498-45fd-44e6-9748-e2fdf085415c",
    /* more items */
  ],
  AwsAccountId: '452769287049', /* required */
  ExperienceConfiguration: { /* required */
    Dashboard: {
      InitialDashboardId: '795a3498-45fd-44e6-9748-e2fdf085415c' /* required */
    }
  },
  Namespace: 'default', /* required */
  SessionLifetimeInMinutes: '15',
};

const quicksightEmbedGenPromise = function(req, res, next) {
  return new Promise((resolve, reject) => {
    quicksight.generateEmbedUrlForAnonymousUser(params, function(err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
        reject(err)
      } else {
        console.log(data);           // successful response
        resolve(data);
      }
    });
  })
}


const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}


exports.get_anon_embed_url = function(req, res, next) {
	//let user_info = jwtTokenData(req, res, next);

  return quicksightEmbedGenPromise(req, res, next).then(embed_url => {
      console.log("Embed URL:", embed_url);
      if (embed_url) {
        return res.send({ embed_url: embed_url })
      } else {
        return res.send({ error: "Could not create embed url"})
      }
  }).catch(err => { console.log("Error:", err); res.send({ error: err })});
}




