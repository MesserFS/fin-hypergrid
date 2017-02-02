/* eslint-env browser */

'use strict';

var Simple = require('./Simple');
var Formatters = require('../lib/Formatters');

function parseDate(input) {
    var parts = input.match(/(\d+)/g);
    // new Date(year, month [, date [, hours[, minutes[, seconds[, ms]]]]])
    // return new window.Date(parts[0], parts[1] - 1, parts[2]); // months are 0-based
    // [MFS] Use UTC
    return new window.Date(`${input}T00:00:00Z`);  
}

/**
 * @constructor
 */
var Date = Simple.extend('Date', {

    /**
     * my lookup alias
     * @type {string}
     * @memberOf Date.prototype
     */
    alias: 'date',

    template: function() {
        /*
            <input id="editor" type="date">
        */
    },

    setEditorValue: function(value) {
        if (value != null && value.constructor.name === 'Date') {
            value = Formatters.date(value);
        }
        this.getInput().value = value + '';
    },

    getEditorValue: function() {
        var value = this.getInput().value;
        // [MFS]
        if (value === "") {
            return "";
        }

        value = parseDate(value);
        return value;
    },

});

module.exports = Date;
