'use strict';

var DataSourceOrigin = require('./DataSourceOrigin');

/**
 * See {@link MFSDataSourceOrigin#initialize} for constructor parameters.
 * @constructor
 */
var MFSDataSourceOrigin = DataSourceOrigin.extend('MFSDataSourceOrigin',  {

    /**
     * Currently a synonym for {@link DataSourceOrigin#setData} (see).
     */
    initialize: function(data, schema, grid) {
        delete this.dataSource; // added by DataSourceBase#initialize but we don't want here
        this.setData.call(this, data, schema || []);
        this.grid = grid;
        this.behavior = this.grid.behavior;
    },   

    /**
     * @memberOf DataSourceOrigin#
     * @param x
     * @param y
     * @returns {*}
     */
    getValue: function(columnX, rowY) {
        "use strict";
        if (this.isTotalRowNumber(rowY)) {
            return null;
        }

        var fields = this.getFields();
        if (fields[columnX].substring(0, 1) === '@') {
            return this.getMagicValue(this.getDataItem(rowY), fields[columnX].substring(1));
        } else {
            return this.getFormattedProperty(this.getDataItem(rowY), this.getColumns()[columnX]);
        }
    },

    setData: function(data, schema) {
        /**
         * @summary The array of uniform data objects.
         * @name schema
         * @type {columnSchemaObject[]}
         * @memberOf DataSourceOrigin#
         */
        this.data = data || [];

        if (schema) {
            this.setSchema(schema);
        }
    },

    isTotalRowNumber: function (rowY) {
        return this.behavior.isTotalRowNumber(rowY);
    },

    getDataItem: function(rowY) {
        return this.behavior.getDataItem(rowY);
    },

    getColumns: function() {
        return this.behavior.getColumns();
    },

    // [MFS]
    /**
    * Obtain value according to the data and map settings in parameter column.
    *
    * @method getFormattedProperty
    * @return {object} The corresponding value
    * @param {object} The object to retrieve value from
    * @param {column} The column definition. Must contains data; may contains map.
    */
    getFormattedProperty: function(obj, column) {
        return this.behavior.getFormattedProperty(obj, column);
    },

    getMagicValue: function(item, attr) {
        return this.behavior.getMagicValue(item, attr);
    },

    setProperty: function(obj, fieldRef, value) {
        return this.behavior.setProperty(obj, fieldRef, value);
    },

    fire: function(type, detail, onNode, bubbles, cancelable) {
        return this.behavior.fire(type, detail, onNode, bubbles, cancelable);
    }
    
});

module.exports = MFSDataSourceOrigin;