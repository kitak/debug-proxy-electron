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
      console.log('"'+location+'" is local mapped.');
      return localMappings[i];
    };
  }
  return false;
};

var rewriteUrls = [];

var addRewriteUrl = function(location, regexp, newSubStr) {
  rewriteUrls.push({location: location, regexp: regexp, newSubStr: newSubStr});
};

var rewriteUrl = function(location) {
  var i;
  var rule;
  var rewritedUrl;
  for (i=0; i < rewriteUrls.length; i++) {
    if (rewriteUrls[i].location === location) {
      rule = rewriteUrls[i];
      rewritedUrl = location.replace(rule.regexp, rule.newSubStr);
      console.log('"'+location+'" is rewrited to '+'"'+rewritedUrl+'"');
      return rewritedUrl;
    };
  }
  return location;
};

var server = http.createServer(function(req, res) {
  var parsedUrl = url.parse(req.url);
  var protocol = parsedUrl.protocol;
  var host = parsedUrl.host;
  var localMappingRule = findLocalMapping(req.url);

  req.url = rewriteUrl(req.url);

  console.log(req.url);

  if (localMappingRule !== false) {
    var s = fs.createReadStream(localMappingRule.filePath, {encoding: 'utf-8'});
    res.writeHead(200, {
      'Content-Type': mime.lookup(localMappingRule.filePath)
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
addRewriteUrl("http://localhost:8000/abcde.js", /abcde\.js/, 'xyz.js');

module.exports = function() {
  server.listen(8081);
};
