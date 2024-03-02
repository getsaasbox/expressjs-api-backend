# Sample API backend with firebase for SaaSBox
Use Firebase as your database for your APIs
Includes sample code to parse JWT passed from SaaSBox to extract user, plan information and privileges to use during API calls.

# environment setup
Make sure to populate config/cloud.js with your firebase admin keys json file path.
Make sure to set saasbox_jwt_secret environment variable with your JWT token secret (available in SaaSBox admin)
