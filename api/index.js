// Vercel invokes this function for API routes. The shared handler also powers
// the local Node server, so both environments use identical MongoDB logic.
module.exports = require("../server");
