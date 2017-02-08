/* eslint-env browser */

'use strict';

// ReSharper disable once InconsistentNaming
const TextField = require('./Textfield.js');

/**
 * @constructor
 */
// ReSharper disable once InconsistentNaming
const FilterField = TextField.extend('FilterField', {

    /**
     * my main input control
     * @type {Element}
     * @default null
     * @memberOf CellEditor.prototype
     */
    input: null,

    /**
     * my lookup alias
     * @type {string}
     * @memberOf FilterField.prototype
     */
    alias: 'filterfield',

    realBeginEditing: function (point) {
        if (!this.isAdded) {
            this.isAdded = true;
            this.attachEditor();
        }

        if (this.grid.fireRequestCellEdit(this.event.gridCell, this.initialValue)) {
            this.checkEditorPositionFlag = true;
            this.checkEditor();
        }
    },
    saveEditorValue: function (value) {
        const save = !(value && value === this.initialValue) && // data changed
        this.grid.fireBeforeCellEdit(this.event.gridCell, this.initialValue, value, this); // proceed

        if (save) {
            this.grid.behavior._updateLocalFilter(this.event.gridCell.x, value);
            this.grid.fireAfterCellEdit(this.event.gridCell, this.initialValue, value, this);
        }
        
    }
});

module.exports = FilterField;
