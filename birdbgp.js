var util = require('util');
var EventEmitter = require('events').EventEmitter;
var net = require('net');
var fs = require('fs');

module.exports = BirdBGP;

util.inherits(BirdBGP, EventEmitter);

function BirdBGP (options, callback) {

  EventEmitter.call(this);

  this._config = {
    'path': '/usr/local/var/run/bird.ctl',
    'autoconnect': true,
    'restrict': true
  };

  // handle options here

  this._socket = null;
  this._connected = false;
  this._ready = false;
  this._restricted = false;
  this._code = null;
  this._busy = false;
  this._buffer = "";
  this._end_sent = false;
  this._debug = false;
  
  if (callback && typeof(callback) !== 'function') {
    err = 'Callback is not a function';
    if (!this.emit(this._config.autoconnect == true ? 'connect' : 'open', new Error(err))) {
      throw new Error(err);
    }
    return;
  }

  if (!fs.existsSync(this._config.path)) {
    err = 'Bird socket does not exist at path: ' + this._config.path;
    if (callback) {
      callback(new Error(err));
    } else if (!this.emit(this._config.autoconnect == true ? 'connect' : 'open', new Error(err))) {
      throw new Error(err);
    }
    return;
  }

  var stat = fs.statSync(this._config.path);
  if (!stat || !stat.isSocket()) {
    err = 'Bird socket is not a socket at: ' + this._config.path;
    if (callback) {
      callback(new Error(err));
    } else if (!this.emit(this._config.autoconnect == true ? 'connect' : 'open', new Error(err))) {
      throw new Error(err);
    }
    return;
  }

  if (this._config.autoconnect == false) {
    if (callback) {
      callback(null);
    } else {
      self.emit('open', null);
    }
    return;
  } else {  
    this._connect(this._config.path, callback);
  }

}

BirdBGP.prototype._connect = function (path, callback) {
  var self = this;  
  self._socket = new net.Socket();
  self._socket.connect(path, function (err) {
    if (err) {
      self._socket = null;
    }
    if (callback) {
      callback(err);
    } else if (!self.emit('connect', err)) {
      if (err) {
	    throw err;
	  }
    }
	if (!err) {
	  self._connected = true;
	  self._handleSocket();
	}
  });
}

BirdBGP.prototype._removeTailNewline = function (d) {
  var i = d.length;
  if (d[i-1] == '\n') {
    i--;
	if (d[i-1] == '\r') {
	  i--;
	}
  }
  return d.substr(0, i);
}

BirdBGP.prototype._handleSocket = function () {
  var self = this;
  var socket = self._socket;
  if (!self._connected) {
    err = new Error('handleSocket: Socket is not connected');
	if (!self.emit('error', err)) {
	  throw err;
	}
    return;
  }
  socket.on('data', function (data) {
	if (typeof(data) !== 'string') {
	  if (data.toString === 'undefined') {
	    err = new Error('handleSocket: Unsupported data type: ' + typeof(data) + '\tno toString() method');
	    if (!self.emit('error', err)) {
	      throw err;
	    }
	    return;
	  } else {
	    data = data.toString();
	  }
	}
	
	//data = self._removeTailNewline(data);
	if (self._debug) console.log('handleSocket << ' + data);
	
    if (Number.isInteger(parseInt(data[0]))) {

      var code = data.substr(0,4); // 4 digit response code
      var marker = data[4] // if '-' response will continue, else if ' ' end of response
      var data = self._removeTailNewline(data.substr(5)); // remove '\r\n' from tail

      if (code == '0000') {
        // ok response (data will be empty)
        if (!self._ready) return; // nothing to do here if not ready
        if (!self._end_sent) {
		  // end has not been sent, and 0000 marks the end of something
          self.emit('end');
          self._code = null;
          self._busy = false;
          self._end_sent = false;
          // emit 'ready' again so another command can be processed?
        }
        return;
      } else if (code == '0001') {
        // welcome response
        if (self._config.restrict == true) {
		  self._socket.write('restrict\n');
          return;
        } else {
          self._ready = true;
          self._birdv = data.split(" ")[2];
          self.emit('ready');
        }
        return;
      } else if (code == '0016') {
        // access restricted response
        self._restricted = true;
        if (self._config.restrict == true && !self._ready) {
          self._ready = true;
          self.emit('ready');
          return;
        } else {
          self.emit('data', null, code, data);
        }
        return;
      } else if (marker == ' ') {
        // ' ' means this response is the last, so emit data and end
        self.emit('data', null, code, data);
        self._code = null;
        self._busy = false;
        self._end_sent = true;
		self.emit('end');
        return;
      } else if (marker == '-') {
        // - means response will continue, save the code and emit data
        self._code = code; // store this code for the wrap response
        self._buffer += data;
  	//console.log("Got data (-): " + data);
	self._buffer.split("\r\n").forEach(function(line) {
          if (line.substr(-1) == "\}") {
           self.emit('data', null, code, line);
          } else {
            self._buffer = line;
            return;
          }
        });
        //self.emit('data', null, code, data);
        return;
      }
	  // end of numeric code processing
    } else if (data[0] == ' ') {
      // ' ' at start of data means its a wrap line from a - marker response so use stored code
      // we should get a '0000' response to mark the end if a wrap is the last response
      //self._buffer += data.substr(1);
      //console.log("Got data ( ): " + data.substr(1));
      self._buffer += data.substr(1);
      self._buffer.split("\r\n").forEach(function(line) {
        if (line.slice(-1) == "\}") {
         self.emit('data', null, code, line);
        } else {
          self._buffer = line;
	  return;
        }
      });
      //self.emit('data', null, self._code, data);
      //self._buffer = "";
      self._end_sent = false; // make sure '0000' will emit end if this is last wrap response
      return;
    } else if (data[0] == '+') {
      // + as start of data means its a CLI_ASYNC_CODE (10000) response
      self.emit('data', null, 10000, data.substr(1));
      // looking at codebase, seems this is a single response with no '0000' tailing it, so end it here
      self.emit('end');
      self._code = null;
      self._busy = false;
      self._end_sent = false;
    }
  });
  socket.on('error', function (err) {
    if (!self.emit('error', err)) {
	  throw err;
	}
  });
  socket.on('close', function () {
    self.emit('close');
  });
}

BirdBGP.prototype.write = function (msg) {
  var self = this;
  msg = self._removeTailNewline(msg)
  if (self._debug) console.log('>> ' + msg);
  self._socket.write(msg + '\n');
}

BirdBGP.prototype.dump = function () {
  var self = this;
  console.log('Config: ' + self._config + '\n');
  console.log('Socket: ' + self._socket + '\n');
  console.log('Connected:' + self._connected + '\n');
  console.log('Ready: ' + self._ready + '\n');
  console.log('Restricted: ' + self._restricted + '\n');
  console.log('Code: ' + self._code + '\n');
  console.log('Buffer: ' + self._buffer.toString() + '\n');
  console.log('Busy: ' + self._busy + '\n');
  console.log('End: ' + self._end_sent + '\n');
}
