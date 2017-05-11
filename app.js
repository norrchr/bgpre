var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var net = require('net');
var BirdBGP = require('birdbgp');
var bird_control_socket = "/usr/local/var/run/bird.ctl";
var cidrv4 = require('cidr-regex').cidrv4

app.set('views', './views');
app.set('view engine', 'jade');

app.use(express.static('public'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', function(req, res) {
	res.render("bootstrap", { title: "BGP.re - Homepage" });
});

app.post('/', function(req, res) {
	resource = req.body.resource;
	if (net.isIP(resource) > 0 || cidrv4.test(resource)) {
		res.status(200).redirect('/ip/' + resource);
	} else if (resource.match(/^[0-9]{1,6}$/) != null) {
		res.status(200).redirect('/asn/' + resource);
	} else {
		res.render("bootstrap", { title: "BGP.re - Homepage", error: "invalid resource" });
	}
});

app.get('/asn/:asn', function(req, res) {
	asn = req.params.asn;
	var BirdBGP = require('birdbgp');
	var bird = new BirdBGP();
	bird.on ('open', function (err) {
		if (err) {
			res.render("bootstrap", { title: "BGP.re - ASN Resource Error", error: err.toString() });
			return;
		}
	});
	bird.on ('ready', function (err) {
		if (err) {
			res.render("bootstrap", { title: "BGP.re - ASN Resource Error", error: err.toString() });
			return;
		}
        	// show route where bgp_path ~ [= * " + asn + " =]
		bird.command("show route as " + asn, function (err, code, data) {
			if (err) {
				res.render("bootstrap", { title: "BGP.re - ASN Resource Error", error: err.toString() });
				return;
			}
			data = "[" + data.toString().substring(0, data.length - 1).replace(/\n/gi, ", ") + "]";	
			res.render("asn", { resource: asn, objects: JSON.parse(data) });
			return;
		});
		bird.on ('error', function (err) {
			if (err) {
				res.render("bootstrap", { title: "BGP.re - ASN Resource Error", error: err.toString() });
				return;
			}
		});
		bird.on ('close', function (err) {
			if (err) {
				res.render("bootstrap", { title: "BGP.re - ASN Resource Error", error: err.toString() });
				return;
			}
		});
	});
	bird.open();
});

app.get('/ip/:ip/:cidr', function(req, res) {
	ip = req.params.ip + "/" + req.params.cidr;
	req.params.ip = ip; 
	return showip(req, res);
});

app.get('/ip/:ip', function(req, res) {
	return showip(req, res);
});

function showip(req, res) {
	ip = req.params.ip;
	var BirdBGP = require('birdbgp');
	var bird = new BirdBGP();
	bird.on ('open', function (err) {
       		if (err) {
			res.render("bootstrap", { title: "BGP.re - IP Resource Error", error: err.toString() });
               		return;
       		}
	});
	bird.on ('ready', function (err) {
       		if (err) {
			res.render("bootstrap", { title: "BGP.re - IP Resource Error", error: err.toString() });
               		return;
       		}
       		// show route for ip 
		bird.command("show route for " + ip, function (err, code, data) {
        		if (err) {
                		res.render("bootstrap", { title: "BGP.re - IP Resource Error", error: err.toString() });
                		return;
        		}
			data = "[" + data.toString().substring(0, data.length - 1).replace(/\n/gi, ", ") + "]";
        		res.render("ip", { resource: ip, objects: JSON.parse(data) });
        		return;
		});
		bird.on ('error', function (err) {
        		if (err) {
	        		res.render("bootstrap", { title: "BGP.re - IP Resource Error", error: err.toString() });
                		return;
        		}
		});
		bird.on ('close', function (err) {
        		if (err) {
				res.render("bootstrap", { title: "BGP.re - IP Resource Error", error: err.toString() });
                		return;
        		}
		});
	});
	bird.open();
};

app.use(function(err, req, res, next) {
	console.log(err.stack);
        res.status(500).send(err.stack);
});

app.use(function(req, res, next) {
	res.status(404).redirect('/');
});

app.listen(8080, function () {
	console.log('BGP.re web app running and listening for connections');
});
