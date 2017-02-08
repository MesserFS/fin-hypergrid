'use strict';

module.exports = {
    DataModel: require('./DataModel'), // abstract base class
    JSON: require('./JSON'),
    HeaderSubgrid: require('./HeaderSubgrid'),
    FilterSubgrid: require('./FilterSubgrid'),
    SummarySubgrid: require('./SummarySubgrid'),
    MFSDatamodel: require('./MFS/mfsDataModel'),
    MFSFilterSubgrid: require('./MFS/mfsFilterSubgrid')
};
