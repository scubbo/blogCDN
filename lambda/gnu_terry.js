// http://www.gnuterrypratchett.com
const key = 'X-Clacks-Overhead'
const value = 'GNU Terry Pratchett'

exports.handler = (event, context, callback) => {
    let response = event.Records[0].cf.response;
    response.headers[key] = [{key: key.toLowerCase(), value: value}];
    callback(null, response);
}
