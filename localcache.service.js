const co = require('co');
const serverConfig = require('./server-config.json');
const MongoClient = require('mongodb').MongoClient;

module.exports.getMetaDataVersion = function() {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('ver');
            let doc = yield col.findOne();

            db.close();

            fulfill(doc['metadataVersion']);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.setMetaDataVersion = function(newVersion) {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('ver');
            let doc = yield col.updateOne({}, {$set: {metadataVersion:newVersion}});

            db.close();

            fulfill(doc['metadataVersion']);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.saveOperators = function(operators) {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('operators');

            yield col.deleteMany({});
            yield col.insertOne(operators);

            db.close();

            fulfill(operators);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.loadOperators = function() {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('operators');
            let operators = yield col.findOne();

            db.close();

            fulfill(operators.operators);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.saveDimensions = function(dsts) {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('dsts');

            yield col.deleteMany({});
            yield col.insertOne(dsts);

            db.close();

            fulfill(dsts);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.loadDimensions = function() {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('dsts');
            let dsts = yield col.findOne();

            db.close();

            fulfill(dsts.types);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.saveDimensionDetails = function(dstDetails) {

    return new Promise (function (fulfill, reject) {

        co(function*() {

            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('dstDetails');
            yield col.deleteMany({});

            // I need to do this in order to skip over column sets for entities that relate to parents/grandparents/etc.
            // The column sets I want are the ones with a sequence number of 0 or undefined
            for (let n = 0; n < dstDetails.columns.length; n++) {
                let types = dstDetails.columns[n].types.find(e=>!e['sequenceNumber']);
                yield col.insertOne(types);
            }

            db.close();

            fulfill('OK');

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.loadDimensionDetails = function() {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('dstDetails');
            let dstDetails = yield col.find().toArray();

            db.close();

            fulfill(dstDetails);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.saveFacts = function(facts) {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('facts');

            yield col.deleteMany({});

            for (let n = 0; n < facts.facts.length; n++) {
                yield col.insertOne(facts.facts[n]);
            };

            db.close();

            fulfill(facts);

        }).catch(function(err) {
            reject(err);
        });

    });
};

module.exports.loadFacts = function() {

    return new Promise (function (fulfill, reject) {

        co(function*() {
            let db = yield MongoClient.connect(serverConfig.dbURL);
            let col = db.collection('facts');
            let facts = yield col.find().toArray();

            db.close();

            fulfill(facts);

        }).catch(function(err) {
            reject(err);
        });

    });
};
