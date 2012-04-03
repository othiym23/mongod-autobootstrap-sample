var net      = require('net')
  , path     = require('path')
  , fs       = require('fs')
  , carrier  = require('carrier')
  , mongoose = require('mongoose')
  , spawn    = require('child_process').spawn
  , events   = require('events')
  , emitter  = events.EventEmitter
  ;

var mongoProcess;
var mongoDir = path.join(__dirname, 'mongodata');

function bootstrapMongo(callback) {
  path.exists(mongoDir, function (exists) {
    if (!exists) {
      fs.mkdir(mongoDir, '0755', function (err) {
        if (err) return callback(err);

        return startMongo(callback);
      });
    }
    else {
      return startMongo(callback);
    }
  });
}

function startMongo(callback) {
  var mongoOptions = ['--dbpath', mongoDir,
                      '--nohttpinterface',
                      '--bind_ip', 'localhost'];

  mongoProcess = spawn('mongod', mongoOptions);

  var mongoStdout = carrier.carry(mongoProcess.stdout);
  var waiting = true;
  mongoStdout.on('line', function (line) {
    if (waiting && line.indexOf("[initandlisten] waiting for connections on port 27017") >= 0) {
      waiting = false;
      return callback();
    }
  });

  mongoProcess.on('exit', function (code, signal) {
    mongoProcess = null;
    console.error('mongod exited with code', code, 'and signal', signal);
  });
}

function isOpen(host, port, callback) {
    var isOpened = false;

    var conn = net.createConnection(port, host);

    var timeoutId = setTimeout(function () { onClose(); }, 250);
    var onClose = function () {
      clearTimeout(timeoutId);
      return callback(null, isOpened);
    };

    conn.on('error', function (err) {
      if (err.code !== 'ECONNREFUSED') console.error('unexpected error:', err);
    });

    conn.on('connect', function () {
      isOpened = true;
      conn.end();
    });

    conn.on('close', onClose);
}

process.on('exit', function () {
  if (mongoProcess) {
    mongoProcess.kill();
  }
});

isOpen('localhost', 27017, function (err, mongoStarted) {
  console.error('err is', err, 'mongoStarted is', mongoStarted);
  if (err) return console.error('startup error:', err);

  if (!mongoStarted) {
    bootstrapMongo(function (err) {
      if (err) {
        console.error('error starting mongod:', err);
        emitter.emit('error', err);
        return;
      }

      mongoose.connect('mongodb://localhost/sample_db');
    });
  }
  else {
    mongoose.connect('mongodb://localhost/sample_db');
  }
});
