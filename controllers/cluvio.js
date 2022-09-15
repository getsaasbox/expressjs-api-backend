
const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];

const admin = require("firebase-admin");

const AWS = require('aws-sdk')

const { db } = require("./setup");

const jwt = require('jsonwebtoken');

const { doc, setDoc, collection, getDocs } = require("firebase/firestore");

const crypto = require("crypto");

// FIXME: add JWT secret.
const jwt_secret = process.env.cluvio_app_jwt_secret;

const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
  // console.log("Token:", token);

	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}

let tldparser = require('tld-extract');

const getUserEmailDomain = function(email) {
  console.log("Email:", email)
  const address = email.split('@')[1];
  return address;
  //const domain = tldparser(address).domain;
  //return domain;
}

let OptionParser = require('option-parser');


// Takes parsed options, generates url with JWT signed/encrypted sharingToken
const optionsToUrl = function(dashboard, sharingToken, expiration, secret, filters) {
  let hash = {};
  let sharingSecret;
  let url = "";
  let filter_name, filter_values;
  let splitkv;
  let optToUrl = { url: null, error: null}
  if (!dashboard || !sharingToken || !expiration || !secret) {
    console.log("Required parameter missing: dashboard, sharingToken or secret.");
    optToUrl.error = "Required parameter missing: dashboard, sharingToken or secret.";
    return optToUrl;
  }

  hash.sharing_token = sharingToken;
  
  // FIXME: Test this:
  //hash.exp = Number(expiration);
  hash.fixed_parameters = {};

  console.log("Filters:", filters)
  for (let i = 0; i < filters.length; i++) {
    console.log("filters status:", filters[i])
    // Create a value array if not these options
    if (!filters[i].startsWith("aggregation") && !filters[i].startsWith("timerange")) {
      console.log("Doesnt start with aggregration or timerange")
      splitkv = filters[i].split(":");
      filter_name = splitkv[0];
      filter_values = splitkv[1].split(",");
    } else {
      splitkv = filters[i].split(":");
      filter_name = splitkv[0];
      // Use value directly if aggregation or timerange
      filter_values = splitkv[1];
    }
    // Save filter into hash as part of fixed_parameters object.
    hash.fixed_parameters[filter_name] = filter_values;
  }

  // Hash is ready, now let's sign it: (Ruby code uses jwt.encode, I expect below is equivalent)
  sharingSecret = jwt.sign(hash, secret, { expiresIn: '1h'});
  url = "https://dashboards.cluvio.com/dashboards/" + dashboard + 
  "/shared?sharingToken=" + sharingToken + "&sharingSecret=" + sharingSecret;
  console.log("url:", url);
  optToUrl.url = url;
  console.log("decoded secret:", jwt.decode(sharingSecret, secret));
  return optToUrl;
}

// Middleware to enforce user has admin privileges by checking the JWT token.
exports.hasAdmin = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);
  if (user_info.is_admin != true) {
    res.status(403).send({ error: "Error: Forbidden. Not an admin."})
  } else {
    // add user info:
    req.user_info = user_info;
    next();
  }
}

// Parse commandline options to generate cluvio url.
const cluvioCommandToUrl = function(cmdlineOptions) {
  let dashboard, sharingToken, secret, expiration, filters;

  let url;

  let filter_name, filter_values;
  //let args = ["--filter", "5"];

  // Create new parser every time.
  let parser = new OptionParser();

  parser.addOption('f', 'filter', null, 'filter').argument('short')
  parser.addOption('d', 'dashboard', null, 'dashboard').argument('short');
  parser.addOption('e', 'expiration', null, 'expiration').argument('short');
  parser.addOption('t', 'token', null, 'token').argument('short');
  parser.addOption('s', 'secret', null, 'secret').argument('short');

  let hash = {};
  let sharing_secret;

  //var unparsed = parser.parse();

  let args = cmdlineOptions.split(" ");
  var unparsed = parser.parse(args);
  dashboard = parser.dashboard.value();
  sharingToken = parser.token.value();
  expiration = parser.expiration.value();
  secret = parser.secret.value();
  filters = parser.getopt().filter;
  console.log("dashboard:", dashboard);
  console.log("sharingToken:", sharingToken);
  console.log("expiration:", expiration);
  console.log("secret:", secret);
  console.log("filters:", filters);
  return optionsToUrl(dashboard, sharingToken, expiration, secret, filters);
}


//
// For each new user, add them to the right Organization by their email ending.
//
const createUsersOrg = function(req, res, next, user_info) {
  // Get user email domain
  let domain = getUserEmailDomain(user_info.email);

  // Query all organizations by domain
  return getOrgByDomain(domain).then(org => {
    //console.log("Org retrieved:", org);
    // If no organization with this domain
    if (!org) {
      // Create new org
      return createOrg({ domain });
    } else {
      // FIXME: Return empty promise.
      return new Promise((resolve,reject) => { resolve(0); });
    }
  })
}

// Creates new user if it doesnt exist, returns user data.
const createNewUserDocReturnExisting = async function(req, res, next, user_info) {
  let is_admin = false;
  let user_data = {};
  return db.collection('daco-users').doc(user_info.id).get().then(user => {
    if (!user.exists) {
      return createUsersOrg(req, res, next, user_info).then(created => {
        // Create the user as admin if that is true.
        if (user_info.is_admin == true) {
          is_admin = true;
        }
        return db.collection('daco-users').doc(user_info.id).set({
          email: user_info.email,
          is_admin: is_admin,
        }).then(userRef => {
         return db.collection('daco-users').doc(user_info.id).get();
        }).catch(err => {
          return { error: "Failed to create user in Firestore.\n" + err }
        });
      });
    } else {
      return db.collection('daco-users').doc(user_info.id).get();
    }
  });
}

//
// On page load for admin or regular user
// creates the user if it didnt exist.
// returns new user.
//
exports.create_get_user_info = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);
  let user_data = {};
  let orgs;
  let orgsRef;

  //console.log("JWT user info: ", user_info);
  return createNewUserDocReturnExisting(req, res, next, user_info).then(user => {
      //console.log("User data:", user.data())

      // Common to both admin and user:
      user_data.is_admin = user.data().is_admin;
      user_data.email = user.data().email;
      // Also fetch per-client-domain specific dashboard data for admin user
      if (user.data().is_admin == true) {
        orgsRef = db.collection("orgs");
        return orgsRef.get().then(orgsQuerySnapshot => {
          orgs = orgsQuerySnapshot.docs.map(doc => {
            let data = doc.data();
            data.id = doc.id;
            return data;
          });
          // Admin gets an array of orgs data
          res.send({ user_data, orgs});
        })
      } else {
          // FIXME: Get the current org from orgs:
          return getOrgByDomain(getUserEmailDomain(user_data.email)).then(org => {
            if (!org) {
              res.send({error: "Internal server error. Org had to exist even if empty, but could not be found\n"});
            } else {
              // Regular user only gets his/her own org data.
              res.send({ user_data, org });
            }
          })
      }
  });
}

// Create new org, with / without dashboard params
const createOrg = function(org) {
  console.log("creating new organization:", org);
  return db.collection("orgs").add(org).then(orgRef => {
   return db.collection("orgs").doc(orgRef.id).get();
  }).catch(err => {
    return new Promise((resolve,reject) => { 
      resolve({ error: "Failed to create user in Firestore.\n" + err });
    });
  });
}
exports.createOrg = createOrg;


const getOneDoc = function(querySnapshot) {
  return querySnapshot.docs.map(docSnapshot => {
    return docSnapshot.data();
  });
}
const getOneDocId = function(querySnapshot) {
  return querySnapshot.docs.map(docSnapshot => {
    return docSnapshot.id;
  });
}

// Unused: Get org by given email domain. We use domain as id so this is not needed.
const getOrgByDomain = function(domain) {
  let orgsRef = db.collection("orgs");
  let orgQuery = orgsRef.where("domain", "==", domain);
  let org = null;
  return orgQuery.get().then(orgQuerySnapshot => {
    //console.log("orgQuery.get:", org);
    org = getOneDoc(orgQuerySnapshot)[0];
    // If doc exists, get its id:
    if (getOneDocId(orgQuerySnapshot).length > 0) {
      org.id = getOneDocId(orgQuerySnapshot)[0];
      console.log("adding organization id to org:", org)

      return org;
    } else {
      return null;
    }
  })
}

// Update org for given id
const updateOrg = function(id, org) {
  return db.collection('orgs').doc(id).set(org, { merge: true }).then(result => {
    return 0;
  }).catch(err => {
    return new Promise((resolve, reject) => { reject({error: "Failed to update org\n"}); });
  });
}

exports.edit_org = function(req, res, next) {
    let user_info = jwtTokenData(req, res, next);
    let user_data = {};
    let dashboards = req.body.dashboards;

    // Array of name / cmdline pairs:
    let org = null

    // Generate the url for all dashboards.
    for (let i = 0; i < dashboards.length; i++) {
      dashboards[i].url = cluvioCommandToUrl(dashboards[i].cmdline);
    }

    org = { dashboards };

    if (user_info.is_admin != true) {
      res.send({ error: "Error: Forbidden. Not an admin."})
    } else {
      return updateOrg(req.params.orgId, org).then(updated => {
        res.send({ msg: "Successfully saved organization with new url"});
      }).catch(err => {
        res.send(err);
      })
    }
}

/* 
 * Refresh the url of a single dashboard. The use case is
 * Right before it is displayed this shows the dashboard url
 */
exports.refreshDashboardUrl = function(req, res, next) {
  let orgId = req.body.orgId;
  let dashSlug = req.body.dashname;

  console.log("Refresh url called\n")
  return getOrgById(orgId).then(org => {
    if (!org) {
      res.status(404).send({ error: "No such organization found. " });
    } else {
      for (let i = 0; i < org.dashboards.length; i++) {
        if (org.dashboards[i].name == dashSlug) {
          let urlOrError = cluvioCommandToUrl(org.dashboards[i].cmdline);
          if (urlOrError.url) {
            org.dashboards[i].url = urlOrError.url;
            return updateOrg(org.id, org).then(updated => {
              // Success scenario
              res.send({ url: org.dashboards[i].url });
            }).catch(err => {
              res.status(500).send({ error: "Dashboard found and URL refreshed, but failed updating the organization. Please try again.\n"});
            });
          } else {
            console.log("Error:", urlOrError.error);
            res.status(500).send({ error: "Dashboard found, but error refreshing the url for dashboard: " + urlOrError.error })
            break;
          }
        }
      }
      res.status(404).send({ error: "No such dashboard found. "});
    }
  });
}

exports.edit_org_all_dashboards = function(req, res, next) {
    let user_info = jwtTokenData(req, res, next);
    let user_data = {};
    let dashboards = req.body.dashboards;
    let commandToUrlRes = {
      url: null,
      error: null,
    }
    let err;

    // Array of name / cmdline pairs:
    let org = null

    if (dashboards.length == 0) {
      res.send({ error: "No dashboards found in the payload to save."});
    }

    // Generate the url for all dashboards.
    for (let i = 0; i < dashboards.length; i++) {
      if (!dashboards[i].name || !dashboards[i].cmdline) {
        err = "One or more dashboards don't have a name or commandline string. Update or remove those entries and try again.";
        break;
      }

      commandToUrlRes = cluvioCommandToUrl(dashboards[i].cmdline);
      if (commandToUrlRes.error) {
        err = commandToUrlRes.error;
      } else {
        dashboards[i].url = commandToUrlRes.url;
      }
    }

    if (err) {
      res.status(421).send({ error: err })
    } else {
      org = { dashboards };

      if (user_info.is_admin != true) {
        res.status(403).send({ error: "Error: Forbidden. Not an admin."})
      } else {
        return updateOrg(req.params.orgId, org).then(updated => {
          res.send({ msg: "Successfully saved organization with new url"});
        }).catch(err => {
          res.status(421).send(err);
        })
      }
    }
    
}

const getOrgById = function(id) {
  let orgsRef = db.collection("orgs");
  let org = null
  return orgsRef.doc(id).get().then(orgData => {
    org = orgData.data();
    org.id = id;
    console.log("Organization we got by id:", org);
    return org;
  });
}
