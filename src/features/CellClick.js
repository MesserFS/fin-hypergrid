'use strict';

var Feature = require('./Feature');

/**
 * @constructor
 * @extends Feature
 */
var CellClick = Feature.extend('CellClick', {

    /**
     * @memberOf CellClick.prototype
     * @param {Hypergrid} grid
     * @param {Object} event - the event details
     */
    handleClick: function(grid, event) {
        var consumed;

        if (
            event.gridCell.y >= grid.behavior.getHeaderRowCount() &&
            event.gridCell.x >= 0
        ) {
            consumed = grid.cellClicked(event);
        }

        if (!consumed && this.next) {
            this.next.handleClick(grid, event);
        }
    }
});

module.exports = CellClick;
