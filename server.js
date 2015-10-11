var http = require('http');
var httpProxy = require('http-proxy');
var url = require('url');
var fs = require('fs');
var mime = require('mime');

var proxy = httpProxy.createProxyServer({});

proxy.on('error', function (err, req, res) {
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  });
  res.end('Something wrong: '+err);
});

var localMappings = [];

var addLocalMapping = function(location, filePath) {
  localMappings.push({location: location, filePath: filePath});
};

var findLocalMapping = function(location) {
  var i;
  for (i=0; i < localMappings.length; i++) {
    if (localMappings[i].location === location) {
      return localMappings[i];
    };
  }
  return false;
};

var server = http.createServer(function(req, res) {
  var parsedUrl = url.parse(req.url);
  var protocol = parsedUrl.protocol;
  var host = parsedUrl.host;
  var rule = findLocalMapping(req.url);

  console.log(req.url);

  if (rule !== false) {
    var s = fs.createReadStream(rule.filePath, {encoding: 'utf-8'});
    res.writeHead(200, {
      'Content-Type': mime.lookup(rule.filePath)
    });
    s.on('data', function(data) {
      res.write(data);
    });
    s.on('end', function() {
      res.end();
    });
  } else {
    proxy.web(req, res, { target: parsedUrl.protocol+'//'+parsedUrl.host+'/' });
  }
});

//addLocalMapping("http://example.com/bundle.js", __dirname+'/bundle.js');

module.exports = function() {
  server.listen(8081);
};
