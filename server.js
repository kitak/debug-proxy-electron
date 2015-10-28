var http = require('http');
var https = require('https');
var httpProxy = require('http-proxy');
var url = require('url');
var fs = require('fs');
var mime = require('mime');
var net = require('net');
var crypto = require('crypto');
var childProcess = require('child_process');

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

var getSecureContext = function(domain) {
  console.log(domain);
  return crypto.createCredentials({
    key: fs.readFileSync(__dirname+'/tmp/'+domain+'/'+domain+'.key'),
    cert: fs.readFileSync(__dirname+'/tmp/'+domain+'/'+domain+'.crt'),
    ca: [fs.readFileSync(__dirname+'/tmp/rootCA.pem')]
  }).context;
};

var certs = {};
var domains = fs.readdirSync(__dirname+'/tmp');
domains.forEach(function(domain) {
  if (domain.match(/^\./) == null && domain.match(/^rootCA/) == null) {
    certs[domain] = getSecureContext(domain);
  }
});

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
  var httpVersion = request.httpVersion;
  var hostAndPort = request.url.split(':');
  var host = hostAndPort[0];
  var port = hostAndPort[1];
  console.log('will connect to %s:%s', host, port);
  // set up TCP connection
  var proxySocket = new net.Socket();

  if (Object.keys(certs).indexOf(host) > -1 && port == 443) {
    host = 'localhost';
    port = 8444;
  }

  proxySocket.connect(port, host, function() {
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

proxy.on('proxyRes', function (proxyRes, req, res) {
  var targetHost = 'example.com';
  var targetName = '';
  var targetValue = '';
  if ((new RegExp(targetHost)).test(req.url)) {
    var originalSetHeader = res.setHeader.bind(res);
    res.setHeader = function (name, value) {
      console.log(name + " is " + value);
      if (name === targetName) {
        originalSetHeader(name, targetValue);
      } else {
        originalSetHeader(name, value);
      }
    };
  }
});

var server3 = https.createServer({
  SNICallback: function(domain, callback) {
    return callback(null, certs[domain]);
  }
}, function (req, res) {
  var servername = req.socket.servername;
  var host = servername;
  var url = 'https://'+servername+req.url;
  console.log("in local https server: "+servername);

  req.url = rewriteUrl(url);

  console.log(req.url);

  var localMappingRule = findLocalMapping(url);

  if (localMappingRule !== false) {
    console.log("apply local mapping");
    console.log(localMappingRule);
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
    proxy.web(req, res, {
      target: 'https://'+servername+'/',
      agent: https.globalAgent,
      headers: {
        host: servername
      },
      secure: true
    });
  }
});

//addLocalMapping("https://twitter.com/", __dirname+'/bundle.js');
addRewriteUrl("http://localhost:8000/abcde.js", /abcde\.js/, 'xyz.js');
//addRewriteUrl("https://twitter.com/kitak", /kitak/, 'kentaro');
addBreakPoint(/localhost\:8000\/abcde\.js/);

module.exports = {
  listen: function() {
    server.listen(8081);
    server2.listen(8443);
    server3.listen(8444);
  },
  addSslProxyTarget: function(domain) {
    console.log(domain)
    var prefix = __dirname+"/tmp/";
    var dirPath = __dirname+"/tmp/"+domain;
    try {
      fs.mkdirSync(dirPath);
      childProcess.execSync('openssl genrsa -out '+dirPath+'/'+domain+'.key 2048');
      childProcess.execSync('openssl req -new -key '+dirPath+'/'+domain+'.key -out '+dirPath+'/'+domain+'.csr -subj "/C=JP/ST=Tokyo/L=Shibuya/CN='+domain+'"');
      childProcess.execSync('openssl x509 -req -in '+dirPath+'/'+domain+'.csr -CA '+prefix+'rootCA.pem -CAkey '+prefix+'rootCA.key -CAcreateserial -out '+dirPath+'/'+domain+'.crt -days 500')
      certs[domain] = getSecureContext(domain);
    } catch (e) {
      console.error(e);
    }
  }
};
