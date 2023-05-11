var express = require('express');
var router = express.Router();

let setup = require("../controllers/dbsetup");
let service = require("../controllers/service");

router.post("/create-get-user", cluvio.create_get_user_info);

module.exports = router;
