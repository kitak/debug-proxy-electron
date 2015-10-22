var http = require('http');
var https = require('https');
var httpProxy = require('http-proxy');
var url = require('url');
var fs = require('fs');
var mime = require('mime');
var net = require('net');

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

var breakPoints = [];
var addBreakPoint = function(regexp) {
  breakPoints.push(regexp);
};

var detectBreakPoint = function(location) {
  var i;
  for (i=0; i < breakPoints.length; i++) {
    if (breakPoints[i].test(location)) {
      return true;
    };
  }
  return false;
};

var server = http.createServer(function(req, res) {
  var parsedUrl = url.parse(req.url);
  var protocol = parsedUrl.protocol;
  var host = parsedUrl.host;
  var localMappingRule = findLocalMapping(req.url);

  if (detectBreakPoint(req.url)) {
    // TODO: move to global variables
    setTimeout(function () {
      proxy.web(req, res, { target: parsedUrl.protocol+'//'+parsedUrl.host+'/' });
    }, 3000);
  } else {
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
  }
});

var server2 = http.createServer(function () {});

server2.addListener('connect', function(request, socketRequest, bodyhead){
  var url = request.url;
  var httpVersion = request.httpVersion;
  var parsedUrl = url.parse(request.url);
  console.log('will connect to %s:%s', parsedUrl.host, parsedUrl.port);
  // set up TCP connection
  var proxySocket = new net.Socket();
  proxySocket.connect(8444, 'localhost', function() {
    proxySocket.write(bodyhead);
    socketRequest.write("HTTP/" + httpVersion + " 200 Connection established\r\n\r\n");
  });
  proxySocket.on('data', function(chunk) {
    socketRequest.write(chunk);
  });
  proxySocket.on('end', function() {
    socketRequest.end();
  });
  socketRequest.on('data', function(chunk){
    proxySocket.write(chunk);
  });
  socketRequest.on('end', function(){
    proxySocket.end();
  });
  proxySocket.on('error', function(err){
    socketRequest.write("HTTP/" + httpVersion + " 500 Connection error\r\n\r\n");
    socketRequest.end();
  });
  socketRequest.on('error', function(err){
    proxySocket.end();
  });
});

// certificate dynamic?
var server3 = https.createServer({
  key: fs.readFileSync('/Users/kitak/ssl_key_and_cerf/server.key'),
  cert: fs.readFileSync('/Users/kitak/ssl_key_and_cerf/server.crt')
}, function (req, res) {
  var parsedUrl = url.parse(req.url);
  console.log(req.url);

  proxy.web(req, res, {
    target: parsedUrl.protocol+'//'+parsedUrl.host+'/',
    agent: https.globalAgent,
    headers: {
      host: parsedUrl.host
    },
    secure: true
  });
});

//addLocalMapping("http://example.com/bundle.js", __dirname+'/bundle.js');
addRewriteUrl("http://localhost:8000/abcde.js", /abcde\.js/, 'xyz.js');
addBreakPoint(/localhost\:8000\/abcde\.js/);

module.exports = function() {
  server.listen(8081);
  server2.listen(8443);
  server3.listen(8444);
};
