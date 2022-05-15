
const env = process.env.NODE_ENV || "development";

const config = require('../config/cloud.js')[env];

const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config()

let s3bucket = {
	"url" : "saasbox-files",
	"access_key" : process.env.s3_accessKey,
	"secret" : process.env.s3_secret,
	/* In case we need private files as signed, currently not used. */
	"cdn_url" : "https://d29bo6oqg7ttoq.cloudfront.net",
	"public_url": "saasbox-files-public",
	/* To serve public files */
	"cdn_public_url": "https://d1vtdwko5kmvv8.cloudfront.net",
	"distributionId": "d1vtdwko5kmvv8" // CDN distribution id for cache invalidation.
};


/* 
 * For when we use CF to serve private files. Currently requires global cf key
 * so we disable it. Solution (TODO:)
 * - Send S3 username, access key id, secret and path to our microservice.
 * - Microservice checks this user/creds have indeed access to this s3 path
 * - Microservice signs and returns the url.
 */
if (process.env.cf_signedUrlEnabled == "true") {
	s3bucket.cf_accessKeyId = process.env.cf_accessKeyId;
	s3bucket.cf_privateKey = fs.readFileSync(path.resolve(__dirname, process.env.cf_privateKeyPath)).toString("ascii");
	const signer = new AWS.CloudFront.Signer(s3bucket.cf_accessKeyId, s3bucket.cf_privateKey);
	const twoDays = 2*24*60*60*1000
}

//
// S3: Signed urls for photos
//
const s3 = new AWS.S3({
  accessKeyId: s3bucket.access_key,
  secretAccessKey: s3bucket.secret,
});

const cloudfront = new AWS.CloudFront({
  accessKeyId: s3bucket.access_key,
  secretAccessKey: s3bucket.secret,
});

exports.get_invalidate_cdn_status = function(request_data) {

}

// Takes an array of paths. Path can be a wildcard, e.g. politepopup/*
exports.invalidate_cdn_path = function(paths) {
	let callId = Date.now().toString();

	let params = {
  	DistributionId: s3bucket.distributionId, /* required */
  	InvalidationBatch: { /* required */
    	CallerReference: callId, /* required */
    	Paths: { /* required */
   	    Quantity: paths.length, /* required */
   	    Items: paths
  	  }
  	}
	};

	return new Promise(function(resolve, reject) {
		cloudfront.createInvalidation(params, function(err, data) {
		  if (err) {
		  	console.log(err, err.stack); // an error occurred
		  	reject(err);
		  } else {
		  	console.log("Success requesting invalidation with aws request obj:", data);           // successful response

		  	// Return invalidation data:
		  	let req_data = {
		  		invalidationId: data.id,
		  		callId: callId,
		  		distId: s3bucket.distributionId,
		  		paths: paths
		  	};
		    
				console.log("Req details:", req_data);
				resolve(req_data);
			}
		});
	});
}

/* S3 signed url for uploading private files */
exports.get_file_upload_private_presigned_url = function(fpath, ftype) {
	console.log("fpath: %s, ContentType: %s", fpath, ftype)

	// console.log("s3bucket.url:", s3bucket.url)
	const url = s3.getSignedUrl('putObject', {
		Bucket: s3bucket.url,
		Key: fpath,
		ACL: 'authenticated-read',
		ContentType: ftype
	});
	return url;
}

/* S3 signed url for uploading public files */
exports.get_file_upload_public_presigned_url = function(fpath, ftype) {
	console.log("fpath: %s, ContentType: %s", fpath, ftype)
	// console.log("s3bucket.url:", s3bucket.public_url)
	const url = s3.getSignedUrl('putObject', {
		Bucket: s3bucket.public_url,
		Key: fpath,
		ACL: 'authenticated-read',
		ContentType: ftype
	});
	return url;
}

/* Cloudfront url for reading public file, not pre-signed. */
exports.get_file_read_public_url = function(fpath, ftype ) {
	return s3bucket.cdn_public_url + "/" + fpath
}

/* Cloudfront signed url for reading private file */
/*
exports.get_file_read_presigned_url = function(fpath, ftype ) {
	const signedUrl = signer.getSignedUrl({
  		url: s3bucket.cdn_url + "/" + fpath,
  		expires: Math.floor((Date.now() + twoDays)/1000), // Unix UTC timestamp for now + 2 days
	})
	return signedUrl;
}
*/


/* S3 signed url for reading private files */
exports.get_file_read_private_presigned_url = function(fpath, ftype) {
	const url = s3.getSignedUrl('getObject', {
		Bucket: s3bucket.url,
		Key: fpath,
		ResponseContentType: ftype
	});
	return url;
}


exports.deleteObject = function(key) {
	s3.deleteObject({
		Bucket: s3bucket.url,
		Key: key,
	}, function(err, data) {
		if(err) {
			console.log("Error deleting object: ", err);
		} else {
			console.log("Delete object success: ", data);
		}
	});
}

exports.deleteObject_Promise = function (key) {
	let bucket_url = s3bucket.url;
	/*if (is_private == true) {
		bucket_url = s3bucket.url;
	} else if (is_private == false) {
		bucket_url = s3bucket.public_url;
	}*/
	return new Promise(function(resolve, reject) {
		// console.log("Deleting:", key);
		const res = s3.deleteObject({
			Bucket: bucket_url,
			Key: key,
		}, function(err, data) {
			if (err) {
				console.log("Error deleting object: ", err);
				reject(err);
			} else {
				// console.log("Success deleting object: ", key, data);
				resolve(data);
			}
		});
	});
}

exports.uploadObject = (mimetype, fileBuffer, fpath) => {
	return new Promise((resolve, reject) => {
	  s3.putObject({
		ACL: 'public-read',
		Bucket: s3bucket.url,
		Key: fpath,
		Body: fileBuffer,
		ContentType: mimetype
	  }, ((err, response) => {
		if(err) {
		  console.log({err});
		  reject({err});
		}
		resolve({response});
	  }));
	});
  }


exports.copyObject = function(destKey, srcKey, is_private) {
	let bucket_url;
	if (is_private == true) {
		bucket_url = s3bucket.url;
	} else if (is_private == false) {
		bucket_url = s3bucket.public_url;
	}
	return new Promise((resolve, reject) => {
		// console.log("Bucket:", bucket_url)
		s3.copyObject({
			Bucket: bucket_url,
			CopySource: bucket_url + "/" + srcKey,
			Key: destKey
		}, ((err, response) => {
			if (err) {
				console.log({err});
				reject({err});
			}
			resolve({response});
		}));
	});
}

/*
exports.moveObject = function(from, to) {
	return new Promise(function(resolve, reject) {

		s3.copyObject({
			Bucket: photo_bucket,
			CopySource: from,
			Key: to,

		});
		s3.deleteObject({
			Bucket: photo_bucket,
			Key: from,
		});
		resolve();
	});
}
*/

/* From AWS Docs:
 var params = {
  Bucket: "examplebucket", 
  Key: "objectkey.jpg"
 };
 s3.deleteObject(params, function(err, data) {
   if (err) console.log(err, err.stack); // an error occurred
   else     console.log(data);           // successful response

   data = {
   }
 });
*/