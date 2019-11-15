var express = require('express');
var router = express.Router();

let setup = require("../controllers/setup");
let service = require("../controllers/service");

router.get("/query-setup-state", setup.query_setup_state)
router.post("/submit-setup", setup.submit_setup)
router.post("/uninstall-setup", setup.uninstall_setup)
router.get("/fetch-optimization-records", service.fetch_optimization_records)
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
