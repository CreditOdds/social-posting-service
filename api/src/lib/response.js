const headers = {
  'Access-Control-Allow-Headers':
    'Content-Type,X-Amz-Date,X-Amz-Security-Token,x-api-key,Authorization,Origin,Host,X-Requested-With,Accept,Access-Control-Allow-Methods,Access-Control-Allow-Origin,Access-Control-Allow-Headers',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT',
  'X-Requested-With': '*',
};

function success(body) {
  return { statusCode: 200, headers, body: JSON.stringify(body) };
}

function error(statusCode, message) {
  return { statusCode, headers, body: JSON.stringify({ error: message }) };
}

function options() {
  return { statusCode: 200, headers, body: JSON.stringify({ statusText: 'OK' }) };
}

module.exports = { headers, success, error, options };
