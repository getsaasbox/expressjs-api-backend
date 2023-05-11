


exports.development = {
	"firestoreSecretPath" : "../config/expressjs-api-example-firestore-keys.json",
}
// You dont want to keep these in version control -> They can be moved to env vars.
exports.production = {
	"firestoreSecretPath" : "/etc/secrets/firestore-keys.json",
}
