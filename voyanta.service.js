//TODO: Add better error handling / detection to these functions or it will be really tough to debug apps that use these

const uuid = require('node-uuid');
const https = require('https');
const co = require('co');
const serverConfig = require('./server-config.json');

// function constructor to build HTTP request options
function RequestOptions(method, api, session) {

    this.host = serverConfig.voyantaUrl;
    this.path = serverConfig.voyantaAPIBasePath + api;
    this.method = method;
    this.headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Voyanta-Locale': 'en-gb',
        'Voyanta-TimeZone': 'Europe/London',
    };

    if (session) {
        this.headers['Voyanta-Token'] = session.token;
        this.headers['Voyanta-Email'] = session.email;
        this.headers['Voyanta-Organization'] = session.org;
    }
};

// Login to Voyanta API Server and return session info (Promise)
module.exports.login = function(email, password) {
	return new Promise (function(fulfill, reject) {
        let extServerOptionsPost = new RequestOptions('POST', 'session');
        let payload = {
            email: email,
            password: password,
            featureId: 6
        };

        let reqPost = https.request(extServerOptionsPost, function (res) {
            let responseData = '';
            res.on('data', function(data) {
                responseData += data;
            });
            res.on('end', function () {
                fulfill(JSON.parse(responseData));
            });
        });

        reqPost.write(JSON.stringify(payload));
        reqPost.end();
        reqPost.on('error', function (e) {
            reject(e);
        });
    });
};

// Get Voyanta API meta data version (Promise)
module.exports.getMetaDataVersion = function (session) {
    return new Promise(function (fulfill, reject) {
        let extServerOptions = new RequestOptions('GET','metadata/version', session);
        let request = https.request(extServerOptions, function (res) {
            res.on('data', function (data) {
                fulfill(JSON.parse(data).version);
            });
        });

        request.end();
        request.on('error', function (e) {
            reject(e);
        });
    });
};

// Get list of Voyanta DSTs (Promise)
module.exports.getDSTList = function (session) {
	return new Promise(function (fulfill, reject) {
	    let extServerOptions = new RequestOptions('GET','metadata/types', session);
        let request = https.request(extServerOptions, function (res) {
            let responseData = '';
            res.on('data', function(data) {
                responseData += data;
            });
            res.on('end', function () {
                fulfill(JSON.parse(responseData));
            });
        });

        request.end();
        request.on('error', function (e) {
            console.error(e);
            reject(e);
        });
    });
};

// Get detailed meta data for a specified set of Voyanta DSTs
module.exports.getDSTDetail = function(session, dstTypeIDs) {
    return new Promise(function (fulfill, reject) {
        let extServerOptions = new RequestOptions('POST','metadata/columns', session);

        // build payload
        let payload = {
            batchId: uuid.v4(),
            columnRequests: []
        };

        for (let dstTypeID of dstTypeIDs)
            payload.columnRequests.push({requestId: uuid.v4(), dstTypeId:dstTypeID})

        // make API request
        let request = https.request(extServerOptions, function (res) {

            let responseData = '';
            res.on('data', function(data) {
                responseData += data;
            });

            res.on('end', function () {
                fulfill(JSON.parse(responseData));
            });
        });

        request.write(JSON.stringify(payload));
        request.end();
        request.on('error', function (e) {
            reject(e);
        });
    });
};

// Get list of Voyanta Facts (Promise)
module.exports.getFactList = function (session) {
    return new Promise(function (fulfill, reject) {
        let extServerOptions = new RequestOptions('GET','metadata/facts', session);
        let request = https.request(extServerOptions, function (res) {
            let responseData = '';
            res.on('data', function(data) {
                responseData += data;
            });
            res.on('end', function () {
                fulfill(JSON.parse(responseData));
            });
        });

        request.end();
        request.on('error', function (e) {
            console.error(e);
            reject(e);
        });
    });
};

// Get list of Voyanta Operators (Promise)
module.exports.getOperators = function (session) {
    return new Promise(function (fulfill, reject) {
        let extServerOptions = new RequestOptions('GET','metadata/filters/operators', session);
        let request = https.request(extServerOptions, function (res) {

            let responseData = '';
            res.on('data', function(data) {
                responseData += data;
            });

            res.on('end', function () {
                fulfill(JSON.parse(responseData));
            });
        });

        request.end();
        request.on('error', function (e) {
            console.error(e);
            reject(e);
        });
    })

};

// Get records of a specified dimension, satisfying a specified set of filter criteria
module.exports.getDimension = function(session, dimension, columns, filters) {
    // TODO: Refactor this so that it can take only column names, not column objects
    // TODO: Refactor this so that filters work on column names, not IDs
    return new Promise(function(fulfill, reject){
        let extServerOptions = new RequestOptions('POST', 'dimension', session);

        // build payload
        let payload = {
            batchId: uuid.v4(),
            dimensionRequests: [
                {
                    columnIds : [],
                    dstTypeId: dimension,
                    filters:
                        {
                            type: "ALL",
                            values: []
                        },
                    requestId: 1
                }
            ]
        };

        for (let column of columns)
            payload.dimensionRequests[0].columnIds.push(column.id);

        // implement filters
        for (let filter of filters)
            payload.dimensionRequests[0].filters.values.push(filter);

        // make API request
        let request = https.request(extServerOptions, function (res) {

            let responseData = '';

            res.on('data', function(data) {
                responseData += data;
            });

            res.on('end', function () {

                let data = JSON.parse(responseData);
                let results = [];

                for (let fields of data.results[0].values) {
                    let result = {};
                    for (let field of fields) {
                        if (field.columnId > 0) {
                            let key = columns.find(e=>e.id===field.columnId).name;
                            result[key] = field.value;
                        }
                    }
                    results.push(result);
                }

                fulfill(results);
            });
        });

        request.write(JSON.stringify(payload));
        request.end();
        request.on('error', function (e) {
            console.error(e);
            reject(e);
        });


    });

};

// Get records of a specified dimension, satisfying a specified set of filter criteria
module.exports.getFact = function(session, fact, requestParamList) {
    return new Promise(function(fulfill, reject){

        let extServerOptions = new RequestOptions('POST', 'fact', session);

        // build payload
        let payload = {
            batchId: uuid.v4(),
            facts: []
        };

        for (let requestParams of requestParamList) {
            let factRequest = {};
            factRequest['version'] = 1;
            factRequest['factId'] = fact;
            factRequest['requestId'] = uuid.v4();

            for (let requestParam in requestParams) {
                factRequest[requestParam] = requestParams[requestParam];
            }

            payload.facts.push(factRequest);
        }

        // make API request
        let request = https.request(extServerOptions, function (res) {

            let responseData = '';

            res.on('data', function(data) {
                responseData += data;
            });

            res.on('end', function () {

                // attach request objects to response objects to make things easier to join up later
                let responseObj = JSON.parse(responseData).results;

                let requestMap = {};
                payload.facts.forEach(function(fact){
                    requestMap[fact.requestId] = fact;
                });

                responseObj.forEach(function(obj) {
                   obj.request = requestMap[obj.requestId]; // TODO: Clean this up a bit - not sure 'request' is the best name for this parameter
                });

                fulfill(responseObj);
            });
        });

        request.write(JSON.stringify(payload));
        request.end();
        request.on('error', function (e) {
            console.error(e);
            reject(e);
        });
    });

};