


exports.development = {
	"firestoreSecretPath" : "../config/image-firestore-keys.json",
	"firestoreDbAddr" : ""
}

// You dont want to keep these in version control -> They can be moved to env vars.
exports.production = {
	"firestoreSecretPath" : "/etc/secrets/firestore-keys.json",
	"firestoreDbAddr" : "https://imagefix-8377c.firebaseio.com"
}
