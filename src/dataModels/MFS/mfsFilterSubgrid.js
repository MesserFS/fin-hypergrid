'use strict';

var images = require('../../../images');

function MFSFilterRow(grid) {
    this.grid = grid;
    this.behavior = grid.behavior;
    this.dataRow = {}; // for meta data (__HEIGHT)
}

MFSFilterRow.prototype = {
    constructor: MFSFilterRow.prototype.constructor,

    type: 'filter',

    getRowCount: function() {
        return this.grid.isShowFilterRow() ? 1 : 0;
    },

    getValue: function(x, y) {
        checkForColumnFilters.call(this);

        var column = this.behavior.getColumn(x),
            result = column.properties.filter;
        if (result == null) {
            result = '';
        }

        result = [null, result, result ? images['filter-on'] : null];

        return result;
    },

    setValue: function(x, y, value) {
        checkForColumnFilters.call(this);

        var column = this.behavior.getColumn(x);
        this.behavior.filter.setColumnFilterState(column.name, value);
    },

    getRow: function(y) {
        return this.dataRow;
    }
};

function checkForColumnFilters() {
    // [MFS]
    /*
    if (!this.behavior.filter.getColumnFilterState) {
        throw new this.behavior.HypergridError('Column filters not available.');
    }
    */
}

module.exports = MFSFilterRow;
