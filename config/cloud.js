


exports.development = {
	"firestoreSecretPath" : "../config/image-firestore-keys.json",
	"firestoreDbAddr" : ""
}

exports.production = {
	"firestoreSecretPath" : "/etc/secrets/imagefix-firestore-keys.json",
	"firestoreDbAddr" : "https://imagefix-8377c.firebaseio.com"
}
