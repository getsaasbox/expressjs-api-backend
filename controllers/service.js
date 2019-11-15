

const env = process.env.NODE_ENV || "development";
const { isEmpty, merge } = require('lodash');
const validator = require('validator');
const config = require('../config/cloud.js')[env];

const AWS = require('aws-sdk')

const jwt = require('jsonwebtoken');

const jwt_secret = config.jwt_secret;

const { db } = require("./setup");

const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}


exports.fetch_optimization_records = function(req, res, next) {
	let user_info = jwtTokenData(req, res, next);

	return db.collection('users').doc(user_info.id).collection('history').get().then(historyRef => {
		//let histories = historyRef.orderBy('createdAt', 'desc').limit(10).get();

		let histories = historyRef.limit(10).get();

		let opRecords = [];


		histories.forEach(snap => {
			opRecords.push(snap.data());
		})
		console.log("Last few operational records:", opRecords);
		res.status(200).send({opRecords});
	}).catch(err => {
		console.log("Error fetching image optimization op records. Error: \n", err);
	});
}