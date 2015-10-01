var http = require('http');
var httpProxy = require('http-proxy');
var url = require('url');

var proxy = httpProxy.createProxyServer({});

proxy.on('error', function (err, req, res) {
  res.writeHead(500, {
    'Content-Type': 'text/plain'
  });
  res.end('Something wrong: '+err);
});

var server = http.createServer(function(req, res) {
  var parsedUrl = url.parse(req.url);
  var protocol = parsedUrl.protocol;
  var host = parsedUrl.host;
  console.log(req.url);
  proxy.web(req, res, { target: parsedUrl.protocol+'//'+parsedUrl.host+'/' });
});

server.listen(8080);
