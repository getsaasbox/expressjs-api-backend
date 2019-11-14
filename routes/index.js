var express = require('express');
var router = express.Router();

let setup = require("../controllers/setup");


router.get("/query-setup-state", setup.query_setup_state)
router.post("/submit-setup", setup.submit_setup)

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;
