var net      = require('net')
  , path     = require('path')
  , fs       = require('fs')
  , carrier  = require('carrier')
  , mongoose = require('mongoose')
  , spawn    = require('child_process').spawn
  , emitter  = require('events').EventEmitter
  ;

var mongoProcess;
var mongoDir = path.join(__dirname, 'mongodata');

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

function bootstrapMongo(callback) {
  path.exists(mongoDir, function (exists) {
    if (!exists) {
      fs.mkdir(mongoDir, '0700', function (err) {
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
  isOpen('localhost', 27017, function (err, mongoStarted) {
    if (err) {
      console.error('startup error:', err);
      return callback(err);
    }

    if (!mongoStarted) {
      console.log('starting up service-specific mongod instance');

      var mongoOptions = ['--dbpath', mongoDir,
                          '--nohttpinterface',
                          '--bind_ip', 'localhost'];

      mongoProcess = spawn('mongod', mongoOptions);

      var mongoStdout = carrier.carry(mongoProcess.stdout);
      var waiting = true;
      mongoStdout.on('line', function (line) {
        console.log('[mongod] ' + line);

        if (waiting && line.indexOf("[initandlisten] waiting for connections on port 27017") >= 0) {
          console.log('mongod up and ready');

          // register a handler to help ensure mongod is shut down cleanly
          process.on('exit', function () {
            if (mongoProcess) mongoProcess.kill();
          });

          waiting = false;
          return callback();
        }
      });

      var mongoStderr = carrier.carry(mongoProcess.stderr);
      mongoStderr.on('line', function (line) {
        console.error('[mongod] ' + line);
      });

      mongoProcess.on('exit', function (code, signal) {
        mongoProcess = null;
        console.error('mongod exited with code', code, 'and signal', signal);
      });
    }
    else if (mongoProcess) {
      return callback(new Error('tried to start mongod twice'));
    }
    else {
      console.log('using already-running mongod instance.');
      return callback();
    }
  });
}

bootstrapMongo(function (err) {
  if (err) {
    console.error('error starting mongod:', err);
    return emitter.emit('error', err);
  }

  mongoose.connect('mongodb://localhost/sample_db');
});
