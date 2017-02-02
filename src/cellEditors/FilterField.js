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

    realBeginEditAt: function (point) {
        if (!this.isAdded) {
            this.isAdded = true;
            this.attachEditor();
        }

        this.setEditorPoint(point);
        const model = this.grid.behavior;
        const value = model.getFilterValue(point.x);
        const proceed = this.grid.fireBeforeCellEdit(point, value);
        if (!proceed) {
            //we were cancelled
            return;
        }
        this.initialValue = value;
        this.setEditorValue(value);
        this.isEditing = true;
        this.setCheckEditorPositionFlag();
        this.checkEditor();
    },
    saveEditorValue: function () {
        const model = this.grid.behavior;
        const point = this.getEditorPoint();
        const value = this.getEditorValue();
        model._updateLocalFilter(point.x, value);
    }
});

module.exports = FilterField;
