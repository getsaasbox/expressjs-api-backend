#!/usr/bin/node

'use strict';

var OptionParser = require('option-parser');
var parser = new OptionParser();
var requiredValue = null;

parser.addOption('r', 'required', 'Specify a required option')
	.argument('OPTION')
	.action(function (v) {
		// Can handle callbacks
		requiredValue = v;
		console.log("Required value:  " + v);
	});

/* Method 2 for handling options - save a reference to the object */
var optional = parser.addOption('o', 'optional', 'Add an optional value')
	.argument('VALUE', false);  // Parse these by hand later

/* Method 3 for handling options - name the option */
parser.addOption('f', 'filter', 'Turn on some flag', 'filter').argument('short')
parser.addOption('d', 'dashboard', null, 'dashboard').argument('short');  // Hidden option
parser.addOption('e', 'expiration', null, 'expiration').argument('short');  // Hidden option
parser.addOption('t', 'token', null, 'token').argument('short');  // Hidden option
parser.addOption('s', 'secret', null, 'secret').argument('short');  // Hidden option

try {
	let dashboard, sharingToken, secret, expiration, filters;
	let hash = {};
	let sharing_secret;

	let url;

	let filter_name, filter_values;
	//let args = ["--filter", "5"];
	var unparsed = parser.parse();

	/* Second part of "Method 2" */
	optional.values().forEach(function (value) {
		console.log("Optional value:  " + JSON.stringify(value));
	});

	dashboard = parser.dashboard.value();
	sharingToken = parser.token.value();
	expiration = parser.expiration.value();
	secret = parser.secret.value();
	filters = parser.getOpt().filter;

	if (!dashboard || !sharingToken || !secret) {
		console.log("Required parameter missing: dashboard, sharingToken or secret.")
	}
	hash.sharing_token = sharingToken;
	//FIXME: Test this:
	hash.exp = Date.now() + expiration
	hash.fixed_parameters = {};

	for (let i = 0; i < filters.length; i++) {
		filter_name = filters[i].split(":")[0];
		// Create a value array of not these options
		if (filter_name != "aggregation" && filter_name != "timerange")
			filter_values = filters[i].split(":")[1].split(",");
		else
			// Use value directly if aggregation or timerange
			filter_values = filters[i].split(":")[1];
		// Save filter into hash as part of fixed_parameters object.
		hash.fixed_parameters.filter_name = filter_values;
	}

	// Hash is ready, now let's encode:
	sharing_secret = JWT.encode(hash, secret);
	url = "https://dashboards.cluvio.com/dashboards/" + dashboard + 
	"/shared?sharingToken=" + sharing_token + "&sharingSecret=" + sharing_secret;

	/* Second part of "Method 3" */
	console.log("Times the --filter was specified:  " + parser.filter.count().toString());
	console.log("");
	console.log("Filter value:", parser.filter.value());
	/* Add some diagnostic information */
	console.log("getopt:");
	console.log(parser.getopt());
	console.log("");
	console.log("Unparsed:");
	console.log(unparsed);
} catch (e) {
	console.log('Exception caught:');
	console.log(e);
	throw e;
}

