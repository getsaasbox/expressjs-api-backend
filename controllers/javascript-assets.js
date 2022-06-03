

const env = process.env.NODE_ENV || "development";
const config = require('../config/cloud.js')[env];

const admin = require("firebase-admin");

const AWS = require('aws-sdk')


const { db } = require("./setup");

const {get_file_upload_url, get_file_read_url } = require('../helpers/fileurl');

const { invalidate_cdn_path, getInvalidationStatus } = require('../helpers/s3');

const jwt = require('jsonwebtoken');

const { doc, setDoc, collection, getDocs } = require("firebase/firestore");


const crypto = require("crypto");

const generateToken = function() {
  return new Promise((resolve, reject) => {
    crypto.randomBytes(18, function(err, buffer) { 
      if (err) {
        reject("Error generating token.");
      }
      resolve(buffer.toString("hex"));
    })
  });
}

// FIXME: add JWT secret.
const jwt_secret = process.env.jassets_app_jwt_secret;


const jwtTokenData = function(req, res, next) {
	const token = req.header('Authorization').replace('Bearer', '').trim();
  // console.log("Token:", token);

	// TODO: Call this async, e.g. by passing a callback, then wrapping in promise.
	const decoded = jwt.verify(token, jwt_secret);

	return decoded;
}


// Creates new user if it doesnt exist, returns user data.
const createNewUserDocReturnExisting = async function(req, res, next, user_info) {
  let is_admin = false;
  let user_data = {};
  return db.collection('js-asset-users').doc(user_info.id).get().then(user => {
    if (!user.exists) {
      return generateToken().then(token => {
        // Create the user as admin if that is true.
        if (user_info.is_admin == true) {
          is_admin = true;
        }
        return db.collection('js-asset-users').doc(user_info.id).set({
          domain: "",
          api_key: token,
          is_admin: is_admin,
        }).then(userRef => {
          // FIXME: Return latest deploy link here as well if it exists.

         return db.collection('js-asset-users').doc(user_info.id).get();

        }).catch(err => {
          return { error: "Failed to create user in Firestore.\n" + err }
        });
      });
    } else {
      return db.collection('js-asset-users').doc(user_info.id).get();
    }
  });
}

// It is plural as there may be multiple invalidation requests in a given time
// Even though most of the time it will be 1 or 2 in flight.
// 1. Queries status of all invalidations in database from AWS.
// 2. If they are done, deletes them from the database.
// 3. Returns all initially queried invalidations, to show them all (and completed ones one last time)
const queryInvalidations = function(invals) {
  let promises = []
  let deleteDone = []
  for (let i = 0; i < invals.length; i++) {
    promises.push(getInvalidationStatus(invals[i]));
  }
  // Get updated inval status
  return Promise.all(promises).then(updated_invals => {

    // If they are in "DONE" state, delete from the database, but return it for this time to show
    // their status.
    for (let i = 0; i < updated_invals.length; i++) {
      // If they are in "DONE" state, delete from the database, but return it for this time to show their status.
      if (updated_invals[i].status == "Completed") {
        deleteDone.push(db.collection("invalidations").doc(updated_invals[i].invalidationId).delete())
      }
    }
    // Delete all those invalidations who are now "Complete"
    return Promise.all(deleteDone).then(deleted => {
      // Still, return all the updated invals we found, so we show their "Complete" state one last time,
      // or they are still in pending state:
      return updated_invals;
    });
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
  return createNewUserDocReturnExisting(req, res, next, user_info).then(user => {
      console.log("User data:", user.data())
      let assets;
      let assetsRef;
      let invals;
      let invalsRef;

      // Populate admin specific data
      if (user.data().is_admin == true) {
        user_data.editor_contents = user.data().editor_contents;

      // Populate regular user data
      } else {
        user_data.domain = user.data().domain;
        user_data.api_key = user.data().api_key;
      }
      // Common to both admin and user:
      user_data.is_admin = user.data().is_admin;
      
      // Also fetch assets separately for admin user
      if (user.data().is_admin == true) {
        assetsRef = db.collection("assets");
        return assetsRef.get().then(assetsQuerySnapshot => {
          assets = assetsQuerySnapshot.docs.map(doc => {
            return doc.data();
          });
          // Also fetch any pending invalidations:
          invalsRef = db.collection("invalidations");
          return invalsRef.get().then(invalsQuerySnapshot => {
            invals = invalsQuerySnapshot.docs.map(doc => {
              return doc.data();
            });
            // Get latest status and store to database.
            return queryInvalidations(invals).then(updated_invals => {
              res.send({ user_data, assets, invals: updated_invals});
            });
          }) 
        })
      } else {
        res.send({ user_data, assets });
      }
  });
}

// Update regular user's domain info by processing the form.
const updateUserDomain = async function(req, res, next, user_info, domain) {
  return db.collection('js-asset-users').doc(user_info.id).set({
    domain: domain,
    }, { merge: true }).then(result => {
    return 0;
  }).catch(err => {
    return { error: "Failed saving user credentials.\n" + err };
  });
}

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

const getOneUserDoc = function(querySnapshot) {
  return querySnapshot.docs.map(docSnapshot => {
    return docSnapshot.data();
  });
}
const getOneUserDocId = function(querySnapshot) {
  return querySnapshot.docs.map(docSnapshot => {
    return docSnapshot.id;
  });
}

// Make an invalidation request for array of paths (currently just one)
// Then save the invalidation status in the database,
// Return the inval status as an AJAX reply so it can be displayed in an alert element.
exports.request_cdn_invalidate = function(req, res, next) {
   let user_info = jwtTokenData(req, res, next);
   let invalRef;
   if (user_info.is_admin != true) {
    res.status(403).send({error: "Insufficient privileges (not an admin) to request invalidation\n"});
   } else {
    // Pass path in an array:
    return invalidate_cdn_path([req.body.path]).then(req_status => {
      // req_status object:
      /*let req_data = {
        invalidationId: data.Invalidation.Id,
        callId: callId,
        distId: s3bucket.distributionId,
        paths: paths,
        status: data.Invalidation.Status
      };*/

      // Store status in firebase for page reload, and use invalidation Id as firebase ID.
      invalRef = db.collection("invalidations").doc(req_status.invalidationId);
      return invalRef.set(req_status).then(added =>{
        res.send({
          msg: "Successful invalidation request, not saved to track yet:",
          req_status: req_status
        });
      });
      // Get status of invalidation and save it to the database if not finished:
      /*return get_cdn_invalidate_status(req_data).then(req_status => {
        // Check status, if not compledte, save to db.collection("invalidations").add()
        // Query it on next page reload, 
        // keep in DB if status unchanged, switch to done if it is done. Delete it if it is found done.
      })*/
    });
   }
}

// Create new record when user uploads new asset.
const createAssetRecord = function(asset) {
  return db.collection('assets').add(asset);

  /*
  let usersRef = db.collection("js-asset-users");
  // FIXME check if true or "true" is used
  
  // FIXME: This must check for user id as well. not just admin
  let userQuery = usersRef.where("is_admin", "==", true);

  // Get admin
  return userQuery.get().then(userQuerySnapshot => {
    let userDocId = getOneUserDocId(userQuerySnapshot)[0];
    // Add assets
    return db.collection("js-asset-users").doc(userDocId).collection("assets").add(asset)
  });
  */
}

// Gets given asset at path for given user (i.e. admin)
// Hopefully this returns id as well, as it is needed later.
const getAssetByPath = function(fpath) {
  let assetsRef = db.collection("assets");
  let assetQuery = assetsRef.where("path", "==", fpath);
  let asset = null;
  return assetQuery.get().then(assetQuerySnapshot => {
    asset = getOneDoc(assetQuerySnapshot)[0];
    // If doc exists, get its id:
    if (getOneDocId(assetQuerySnapshot).length > 0)
      asset.id = getOneDocId(assetQuerySnapshot)[0];
    return asset;
  })
}

// Update asset for given id
const updateAsset = function(asset, id) {
  return db.collection('assets').doc(id).set(asset, { merge: true }).then(result => {
    return 0;
  }).catch(err => {
    return { error: "Failed saving asset. " + err };
  });
}

const getAssetById = function(id) {
  let assetsRef = db.collection("assets");
  let asset = null
  return assetsRef.doc(id).get().then(assetData => {
    asset = assetData.data();
    asset.id = id;
    console.log("Asset we got by id:", asset);

    return asset;
  });

}

// Called after successful s3 upload to make is_deletable: false
exports.declare_asset_valid = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);
  let asset = null;
  return getAssetById(req.body.id).then(asset => {
    console.log("Declare asset valid called for asset:", asset);
    asset.is_deletable = false;
    return updateAsset(asset, req.body.id).then(updated => {
      res.send({msg: "success setting assest as valid\n"});
    });
  });
  
}

exports.create_asset = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);
  const file_meta = req.body.file_meta
  const ftype = file_meta.type;
  const privacy = file_meta.privacy;
  let pflag = true;
  let fpath = null;
  
  if (privacy == "private") {
    pflag = true;
  } else if (privacy == "public") {
    pflag = false;
  }

  if (user_info.is_admin != true || ftype == false || ftype == "false") {
    if (user_info.is_admin != true) {
      res.send({error: "Insufficient privileges (not an admin) to create an asset\n"});
    } else {
      res.send({error: "Invalid file type: " + ftype });
    }
  } else {
    fpath = req.body.file_prefix + "/" + file_meta.natural_path;
    // See if there is existing asset at this path:
    console.log("Fpath:", fpath);
    console.log("Ftype:", ftype);
    console.log("Flag:", pflag);
    return getAssetByPath(fpath).then(exists => {
      let asset = {
          is_deletable: true,
          is_private: pflag,
          type: ftype,
          path: fpath,
        };
      const upload = get_file_upload_url(fpath, ftype, pflag);
      const read = get_file_read_url(fpath, ftype, pflag);
      
      // Create new asset or update existing.
      if (!exists) {
        // Create new asset
        return createAssetRecord(asset).then(created => {
          
          // FIXME: Find out how to get firebase item's id
          res.send({ msg: "success creating asset record\n", id: created.id, upload_url: upload, read_url: read });
        })
      } else {
        // Update exists with new data in asset;
        return updateAsset(asset, exists.id).then(updated => {
          res.send({ msg: "success updating asset record\n", id: exists.id, upload_url: upload, read_url: read });
        })
      }
    })
  }
}

// Update regular user's admin script text from the editor.
const updateAdminScript = async function(req, res, next, user_info, editor_contents) {
  return db.collection('js-asset-users').doc(user_info.id).set({
    editor_contents: editor_contents,
    }, { merge: true }).then(result => {
    return 0;
  }).catch(err => {
    return { error: "Failed saving user credentials.\n" + err };
  });
}

//
// Saves the javascript template code for the admin. The template is then used
// to generate the final code that the user should copy & paste to their website.
//
exports.save_script_template = function(req, res, next) {
  let user_info = jwtTokenData(req, res, next);
  if (user_info.is_admin == true) {
    return updateAdminScript(req, res, next, user_info, req.body.editor_contents).then(updated => {
      res.send({ msg: "Success updating editor contents\n" });
    })
  } else {
      res.send({ error: "Permission denied, this user is not an admin\n"});
  }
}

// Domain
exports.post_customer_info = function(req, res, next) {
let user_info = jwtTokenData(req, res, next);
  console.log("User Info:", user_info);
  if (!req.body.domain) {
    res.send({ error: "Please enter a valid domain value."});
  } else {
    return updateUserDomain(req, res, next, user_info, req.body.domain).then(updated => {
      res.send({ message: "User domain updated successfully."})
    })
  }
}

// TODO/FIXME: Can be added later.
exports.check_customer_license = function(req, res, next) {
let user_info = jwtTokenData(req, res, next);
  
  console.log("User Info:", user_info);
}