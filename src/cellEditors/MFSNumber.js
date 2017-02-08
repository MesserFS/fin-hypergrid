'use strict';

var Simple = require('./Simple');

/**
 * @constructor
 */
var MFSNumber = Simple.extend('MFSNumber', {

    /**
     * my lookup alias
     * @type {string}
     * @memberOf MFSNumber.prototype
     */
    alias: 'mfsNumber',

    template: function() {
        /*
            <input id="editor">
        */
    },

    bbgNumber: false,
    format: '0,0[.][00]',
    readyInit: function () {
        var self = this;
        this.super();
        var format = this.format;
        this.input.addEventListener('keydown', function (e) {
            if (!self.bbgNumber) {
                if (e && e.keyCode === 77) { // m
                    self.input.value = numeral(self.input.value).multiply(1000000).format(format);
                    e.preventDefault();
                } else if (e && e.keyCode === 75) { // k
                    self.input.value = numeral(self.input.value).multiply(1000).format(format);
                    e.preventDefault();
                }
            } else {
                if (e && e.keyCode === 77) { // m
                    self.input.value = numeral(self.input.value).multiply(1000).format(format);
                    e.preventDefault();
                }
            }

        });

    },
    getEditorValue: function () {
        var format = this.format;
        return numeral(this.input.value).format(format);
    },
    setEditorValue: function (value) {
        var format = this.format;
        this.input.value = numeral(value).format(format);
    },
    selectAll: function () {
        this.input.setSelectionRange(0, this.input.value.length);
    },

    /**
        * @function
        * @instance
        * @description
        save the new value into the behavior(model)
        */
    saveEditorValue: function () {
        var point = this.getEditorPoint();
        var value = this.getEditorValue();
        if (value === this.initialValue) {
            return; //data didn't change do nothing
        }
        this.grid.behavior.setValue(point.x, point.y, value);
        this.grid.fireAfterCellEdit(point, this.initialValue, value);
    }    

});

module.exports = MFSNumber;
