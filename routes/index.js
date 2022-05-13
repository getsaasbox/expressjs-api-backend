var express = require('express');
var router = express.Router();

let setup = require("../controllers/setup");
let service = require("../controllers/service");
let quicksight = require("../controllers/quicksight");
let jsassets = require("../controllers/javascript-assets");

router.get("/query-setup-state", setup.query_setup_state)
router.post("/submit-setup", setup.submit_setup)
router.post("/uninstall-setup", setup.uninstall_setup)
router.get("/fetch-optimization-records", service.fetch_optimization_records)
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get("/get-embed-url", quicksight.get_anon_embed_url);


// Get history of javascript file deploys to display in a table.
router.get("/fetch-deploy-records", jsassets.fetch_deploy_records);

// Add submitted CDN asset to database
router.post("/create-asset", jsassets.create_asset);
router.post("/declare-asset-valid", jsassets.declare_asset_valid);
// For this customer, autogenerate their key if it doesnt exist and return
// For this customer, return their submitted domain.
// For this customer, return the latest deploy link.
router.post("/create-get-user", jsassets.create_get_user_info);

// Get domain for customer.
router.post("/post-customer-info", jsassets.post_customer_info);
router.post("/save-script-template", jsassets.save_script_template);
// Check customer license
router.post("/check-customer-license", jsassets.check_customer_license);

module.exports = router;
