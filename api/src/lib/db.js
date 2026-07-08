const mysql = require('serverless-mysql')({
  config: {
    host: process.env.ENDPOINT,
    database: process.env.DATABASE,
    user: process.env.USERNAME,
    password: process.env.PASSWORD,
    // Serialize/parse DATETIME as UTC regardless of the process timezone, so
    // scheduled_at comparisons against the DB's NOW() are consistent from any
    // environment (Lambda already runs UTC; this protects local scripts).
    timezone: 'Z',
  },
});

module.exports = mysql;
