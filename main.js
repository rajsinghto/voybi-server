const assert = require('assert');
const co = require('co');

const express = require('express');
const app = express();

const bodyParser = require('body-parser');
app.use(bodyParser.json({limit: '50MB'}));

const serverConfig = require('./server-config.json');
const voyantaService = require('./voyanta.service');
const reportGen = require('./reportgen');


/***************************************
 * Set up server routes and APIs.      *
 ***************************************/
app.post('/api/login', function(request, response) {
    loginToVoyanta(request.body.email, request.body.password)
        .then(token=>response.json(token));
});

app.post('/api/asset/diversification', function(request, response) {
    try {
        // load report definition
        const report = require('./report3.json');

        // generate report data and return
        reportGen.generate('Voyanta', new VoyantaCred(request.body.sessionToken), report)
            .then(data=>response.json(data), err=> { throw err; });
    }
    catch(e) {
        console.log(e.stack);
    }
});


// Express Server
let server = null;

/****************************************
 * Startup sequence                     *
 ****************************************/
co(function*() {

    // add Voyanta provider to reportgen
    reportGen.addProvider('Voyanta',
        voyantaService.getMetaDataVersion,
        voyantaService.getDSTList,
        voyantaService.getDSTDetail,
        voyantaService.getFactList,
        voyantaService.getOperators,
        voyantaService.getDimension,
        voyantaService.getFact
    );

    // log into Voyanta
    let token = yield loginToVoyanta(serverConfig.credentials.email, serverConfig.credentials.password);

    // init Voyanta provider in reportgen
    yield reportGen.initProvider('Voyanta', new VoyantaCred(token));

    // start web server
    server = app.listen(3000);
    yield new Promise((res, rej) => {
        server.on('listening', res);
        server.on('error', rej);
    });
    console.log('Listening on port 3000.');

}).catch(function(err) {
    console.log(err.stack);
});



/***************************************
 * Handle graceful shutdown of server. *
 ***************************************/

// this function is called when you want the server to die gracefully
// i.e. wait for existing connections, close database connection, etc.
let gracefulShutdown = function() {
  console.log("Received kill signal, shutting down gracefully.");

  server.close(function() {
    console.log("Closed out remaining connections.");
    process.exit()
  });
  
   // if after 
   setTimeout(function() {
       console.error("Could not close connections in time, forcefully shutting down");
       process.exit()
  }, 10*1000);
};


// listen for TERM signal .e.g. kill 
process.on ('SIGTERM', gracefulShutdown);

// listen for INT signal e.g. Ctrl-C
process.on ('SIGINT', gracefulShutdown);



/***********************************************************
 * Functions that login to Voyanta and manage credentials. *
 ***********************************************************/

let sessions = [];  // array of client sessions

// log into Voyanta and add session to list
function loginToVoyanta (email, password) {
    return new Promise (function (fulfill, reject) {
        voyantaService.login(email, password).then (session => {
            session.email = email;
            sessions.push(session);

            fulfill(session.token);
        }).catch(e=>reject(e));
    });
}

// function constructor to create new Voyanta credential
function VoyantaCred (sessionToken, voyantaOrg) {
    let session = sessions.find(e=>e.token == sessionToken);
    this.token = sessionToken;
    this.email = session.email;
    this.org = session.organizations.find(e=>e.name == voyantaOrg || 'Demo Co.').id;
}