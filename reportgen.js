const co = require('co');
const localCacheService = require('./localcache.service');
const moment = require('moment');

//TODO: Wrap this in an IIFE for safety
//(function () {

let providers = {};

function ReportGenException(message) {
    this.message = message;
}

// generate a date dimension where the rows are determined by a start date, end date and interval
function getDateDimension (dimension) {
    let dimDates = [];

    try {
        let i = 1;
        let now = moment(dimension.start);

        while (now <= moment(dimension.end)) {
            let date = {};
            date[dimension.name] = moment(now).format('YYYY-MM-DD');
            dimDates.push(date);

            now = moment(dimension.start).add(dimension.interval*i, dimension.intervalUnit);
            i++;
        }

        return Promise.resolve(dimDates);
    }
    catch (e) {
        console.log(e);
    }
}

// retrieve a data dimension by calling provider function
function getDataDimension (provider, providerCredential, dimension) {

    // get dimension ID from meta data
    let dimensionID = provider.dimensions.find(e => e.name === dimension.name).id;

    // get dimension field details from meta data
    let columns = provider.dimensionDetails
        .find(e => e.id = dimensionID)
        .columnElements.filter(function (col) {
            return dimension.fields.indexOf(col.name) != -1;
        });

    // construct a filter - just a random filter for now TODO: Implement this!
    let filters = [{
        columnId: columns[0].id,
        operatorId: provider.operators.find(e => e.description === 'is not equal to').id,
        value: ''
    }];

    // get rows for this data dimension - asyncronous
    return new Promise(function (fulfill, reject) {
        provider.getDimensionData(providerCredential, dimensionID, columns, filters)
            .then(data => fulfill(data))
            .catch(e => reject(e));
    });
}

// retrieve a single dimension, calling the appropriate function based on the type of dimension
function getDimension (provider, providerCredential, dimension) {
    if (dimension.type === 'data') return getDataDimension(provider, providerCredential, dimension);
    else if (dimension.type === 'dates') return getDateDimension(dimension);
    else throw new ReportGenException('Invalid dimension type found.');
}

// retrieve a dimension and combines it with the next dimension
// it calls itself recursively until all dimensions have been retrieved
function getDimensionsRecursive (provider, providerCredential, dimensions, dimIndex, maxDimIndex) {
    return new Promise (function (fulfill, reject) {

        co(function*() {
            let thisDimension = yield getDimension(provider, providerCredential, dimensions[dimIndex]);  // get rows for this dimension

            if (dimIndex === maxDimIndex) fulfill(thisDimension); // i am at the bottom of the tree, so just return this dimension

            // else, i am not at the bottom, so i need to combine rows for this dimension with rows for all the next dimensions
            // TODO: Add join/link logic here.

            let rowsToReturn = [];

            for (let row of thisDimension) {
                let childDimension = yield getDimensionsRecursive(provider, providerCredential, dimensions, dimIndex + 1, maxDimIndex);

                // for each child row, create a row that contains all of the attributes of the parent row and the child row
                for (let childRow of childDimension) {
                    let rowToAdd = {};
                    for (let attr in row) {
                        if (row.hasOwnProperty(attr)) rowToAdd[attr] = row[attr];
                    }
                    for (let attr in childRow) {
                        if (childRow.hasOwnProperty(attr)) rowToAdd[attr] = childRow[attr];
                    }

                    rowsToReturn.push(rowToAdd);
                }
            }

            fulfill(rowsToReturn);

        }).catch(function(err) {
            reject(err);
        });

    })
}

// add a provider, specify name and functions to load data and metadata
// TODO: Collapse dimensionMetaData and dimensionDetailMetaData into one structure; will require change to Voyanta service
module.exports.addProvider = function (name, metaDataVersion, dimensionMetaData, dimensionDetailMetaData, factMetaData, operatorMetaData, dimensionData, factData) {
    providers[name] = {};
    providers[name]['getMetaDataVersion'] = metaDataVersion;
    providers[name]['getDimensionMetaData'] = dimensionMetaData;
    providers[name]['getDimensionDetailMetaData'] = dimensionDetailMetaData;
    providers[name]['getFactMetaData'] = factMetaData;
    providers[name]['getOperatorMetaData'] = operatorMetaData;
    providers[name]['getDimensionData'] = dimensionData;
    providers[name]['getFactData'] = factData;
};

// initialize a provider by calling functions to retrieve meta data required to make future requests
module.exports.initProvider = function (providerName, providerCredential) {
    return new Promise (function (fulfill, reject) {

        if (!providers[providerName]) {
            throw new ReportGenException('Provider does not exist.');
        }

        let provider = providers[providerName];

        co(function*() {
            console.log(`Connecting to ${providerName} and checking metadata version.`);

            // check metadata version in DB
            // TODO: Update cache to handle multiple providers!!!
            let verCache = yield localCacheService.getMetaDataVersion();

            // check current metadata version
            let verProvider = yield provider['getMetaDataVersion'](providerCredential);

            if (verCache != verProvider) { // metadata is not up to date, so get from provider and save to DB cache
                console.log('New metadata available from provider.  Updating metadata...');

                // get operators
                let operators = yield provider.getOperatorMetaData(providerCredential);
                yield localCacheService.saveOperators(operators);

                // get dimensions
                let dimensions = yield provider.getDimensionMetaData(providerCredential);
                yield localCacheService.saveDimensions(dimensions);

                // get dimension details TODO: Combine this with dimension - will simplify things...
                let dimensionDetails = yield provider.getDimensionDetailMetaData(providerCredential, dimensions.types.map(e => e.id));
                yield localCacheService.saveDimensionDetails(dimensionDetails);

                // get facts
                let facts = yield provider.getFactMetaData(providerCredential);
                yield localCacheService.saveFacts(facts);

                // update version in database
                yield localCacheService.setMetaDataVersion(verProvider);

            }
            else {
                console.log('Metadata for provider is up to date.  Loading metadata from database cache...');
            }

            // load meta data from database cache
            provider['operators'] = yield localCacheService.loadOperators();
            provider['dimensions'] = yield localCacheService.loadDimensions();
            provider['dimensionDetails'] = yield localCacheService.loadDimensionDetails();
            provider['facts'] = yield localCacheService.loadFacts();

            console.log('... done.');
            fulfill();

        }).catch(function(err) {
            reject(err);
        });
    });
};

// TODO: providerCredentials should be a collection and providerName should be read from the report definition
// TODO: There could be more than one provider within an existing report.
module.exports.generate = function (providerName, providerCredential, report) {
    return new Promise (function (fulfill, reject) {

        if (!providers[providerName]) {
            throw new ReportGenException('Provider does not exist.');
        }

        let provider = providers[providerName];
        co(function*() {

            // **********************************
            // Get dimensions                   *
            // **********************************
            let rptDimensions = yield getDimensionsRecursive(provider, providerCredential, report.data.dimensions, 0, report.data.dimensions.length-1);

            // **********************************
            // Get facts, attach to dimensions  *
            // **********************************
            if (report.data.hasOwnProperty('facts')) {
                for (let fact of report.data.facts) {   // for each fact...
                    let factParamList = [];

                    // ... get value for each row of dimension data.

                    for (let row of rptDimensions) {   // for each row...

                        // ... set the fact parameters
                        let factParams = {};

                        for (let parameter of fact.parameters) {
                            factParams[parameter.name] = (parameter.type === 'link') ? row[parameter.field]
                                : (parameter.type === 'set') ? parameter.value
                                    : null;
                        }
                        factParamList.push(factParams);
                    }

                    // get the fact values from the provider
                    let factValues = yield provider.getFactData(providerCredential, provider.facts.find(e => e.name === fact.name).id, factParamList);

                    // finally, append the values to the dimension set
                    // TODO: replace this with requestID for much easier/faster match
                    for (let factValue of factValues) {               // for each fact value
                        rptDimensions.find(function(element) {        // find the matching dimension row, i.e. the one where...
                            let match = true;
                            for (let linkParam of fact.parameters.filter(e=>e.type==='link'))   // all the link fields match, so find all link parameters
                                if (factValue.request[linkParam.name] !== element[linkParam.field]) match = false; // and if any of them don't match the values on this dimension row, then it's not a match
                            return match;
                        })[fact.friendlyName] = factValue.value;    // add the fact value to the dimension row
                    }
                }
            }

            // **********************************
            // Create aggregation groups        *
            // **********************************
            let groupTotalSet = [];
            if (report.data.hasOwnProperty('groups')) {

                for (let group of report.data.groups) {                     // for each group in the report...
                    let thisGroup = [];                                     // create an array to hold aggregations

                    for (let aggregateField of group.aggregateFields) {     // for each aggregation field...
                        let groupTotals = {};                               // create a set of totals per value of groupByField

                        for (let row of rptDimensions) {                    // loop through data rows and compute totals
                            if (!groupTotals[row[group.groupByField]])      // if a total does not exist for a given value of groupByField...
                                groupTotals[row[group.groupByField]] = Number(row[aggregateField]);     // create it and set the total
                            else
                                groupTotals[row[group.groupByField]] += Number(row[aggregateField]);    // otherwise, increment the total
                        }
                        thisGroup.push({aggregate: aggregateField, totals: groupTotals});   // add the aggregate to the group
                    }
                    groupTotalSet.push({group: group, aggregations: thisGroup});    // add the group to the set of groups
                }
            }

            // **********************************
            // Create output                    *
            // **********************************

            let reportData = [];

            /*  This will always be a multi-dimensional array:
                1st Dimension: Table
                2nd Dimension: Row
                3rd Dimension: Value

                If grouping, each grouping (ex. Sector) will be in a separate table, each row will be a group (ex. Office) and each value
                will be aggregate (ex. Value, Area, etc.)

                If not grouping, a single table will be returned, with a row for each record, each row containing multiple values

                The first row in any table will contain the field names for the values contained in that table
            */

            // TODO: Create ability to return nested aggregations (i.e. value by sector, by date)

            // Create grouped output
            if (report.data.hasOwnProperty('groups')) {
                for (let thisGroup of groupTotalSet) {  // for each group...
                    let titleRow = [];                  // create an array to hold title (field names)
                    let table = [];                     // create an array to hold the table rows (groups and totals)

                    // create title row
                    titleRow.push(thisGroup.group.groupByField);
                    for (let aggregateField of thisGroup.group.aggregateFields)
                        titleRow.push(aggregateField);

                    // add groups rows
                    for (let aggregation of thisGroup.aggregations) {  // for each aggregation field..
                        for (let group in aggregation.totals) {        // for each value of the aggregation field...
                            if (!table.find(e => e[0] === group)) {    // if a row doesn't exist in the summary table..
                                table.push([group]);                   // add it
                            }
                        }
                    }

                    // add total columns to the table
                    for (let aggregation of thisGroup.aggregations) {   // for each aggregation...
                        table.forEach(function (element) {              // look for a total for each row in the summary table...
                            if (!aggregation.totals[element[0]]) element.push(0);   // if one doesn't exist, push 0...
                            else element.push(aggregation.totals[element[0]]);      // otherwise, push the value
                        })
                    }

                    table.splice(0,0,titleRow); // add title row
                    reportData.push(table);
                }
            }

            // Create tabular output
            else {
                let titleRow = [];
                let table = [];

                for (let attr in rptDimensions[0])
                    titleRow.push(attr);

                table.push(titleRow);

                for (let row of rptDimensions) {
                    let row = [];
                    for (let attr in row) {
                        row.push(row[attr]);
                    }
                    table.push(row);
                }

                reportData.push(table);
            }

            // return report data
            fulfill(reportData);

        }).catch(function(err) {
            console.log(err);
            reject(err);
        });
    });
};

//}());   // IIFE execution
