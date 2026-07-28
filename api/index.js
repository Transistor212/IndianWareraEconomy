// Vercel serverless entry point — imports the Express app from server/
// Vercel auto-detects files in api/ and runs npm install for them.
module.exports = require('../server/index.js');
