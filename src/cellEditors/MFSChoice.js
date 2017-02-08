'use strict';

var Simple = require('./Simple');
var Map = require('../lib/Mappy');

/**
 * @constructor
 */
var Choice = Simple.extend('MFSChoice', {

    /**
     * my lookup alias
     * @type {string}
     * @memberOf Choice.prototype
     */
    alias: 'mfsChoice',

    /**
     * the list of items to pick from
     * @type {Array}
     * @memberOf Choice.prototype
     */
    items: [],

    itemsPromise: null,

    template: function() {
        /*
                <select id="editor">
                    {{#items}}
                        <option value="{{Value}}">{{DisplayValue}}</option>
                    {{/items}}
                </select>
        */
    },

    //no events are fired while the dropdown is open
    //see http://jsfiddle.net/m4tndtu4/6/

    autopopulate: function () {
        var behavior = this.grid.behavior;
        var point = this.getEditorPoint();
        var colProps = this.grid.getColumnProperties(point.x);
        if (!colProps.autopopulateEditor) {
            return;
        }
        var headerCount = this.grid.getHeaderRowCount();
        var rowCount = this.grid.getUnfilteredRowCount() - headerCount;
        var column = point.x;
        var map = new Map();
        for (var r = 0; r < rowCount; r++) {
            var each = behavior.getUnfilteredValue(column, r);
            map.set(each, each);
        }
        var values = map.values;
        values.sort();

        if (values.length > 0 && values[0].length > 0) {
            values.unshift('');
        }

        this.setItems(values);
    },

    /**
     * @memberOf Choice.prototype
     */
    showEditor: function() {
        var self = this;
        this.input.style.display = 'inline';
        setTimeout(function() {
            self.showDropdown(self.input);
        }, 50);
    },

    preShowEditorNotification: function() {
        this.autopopulate(this.initialValue);
        this.setEditorValue(this.initialValue);
    },

    /**
     * @memberOf Choice.prototype
     * @param items
     */
    setItems: function (items) {
        this.items = items;
        this.updateView();
    },

    /**
     * @memberOf Choice.prototype
     * @param input
     */
    initializeInput: function(input) {
        var self = this;
        Simple.prototype.initializeInput.apply(this, [input]);
        // [MFS] DON'T STOP EDITING WHEN VALUE CHANGE
        /*
        input.onchange = function() {
            self.stopEditing();
        };
        */
    },
    // [MFS]
    setEditorValue: function (value) {
        var that = this;
        var promiseCallback = function () {
            that.getInput().value = value + '';            
        };
        this.itemsPromise ? this.itemsPromise.then(promiseCallback) : promiseCallback();
    },

    // [MFS]
    realBeginEditAt: function (point) {
        this.setEditorPoint(point);
        var model = this.grid.behavior;
        var value = model.getDataItem(point.y - model.getHeaderRowCount())[this.originalId];
        this.initialValue = value;
        this.setEditorValue(value);
        this.isEditing = true;
        this.setCheckEditorPositionFlag();
        return this.checkEditor();
    },
    // [MFS]
    saveEditorValue: function() {
        var point = this.getEditorPoint();
        var model = this.grid.behavior;
        var value = this.getEditorValue();
        model.setAttribute(point.y - model.getHeaderRowCount(), this.originalId, value);
        if (this.displayId) {
            model.setAttribute(point.y - model.getHeaderRowCount(), this.displayId, this.items.filter(function (item) {
                return value === item.Value;
            })[0].Alias);
        }
    }

});

module.exports = Choice;
