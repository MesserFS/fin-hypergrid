'use strict';

var Behavior = require('../Behavior');
var ListDragon = require('list-dragon');
var Point = require('rectangular').Point;
var ExpandedItemsManager = require('./expanded-items-manager');
var DataModelMfs = require('../../dataModels/MFS/mfsDataModel');
var cellEventFactory = require('../../lib/cellEventFactory');
var HeaderSubgrid = require('../../dataModels/HeaderSubgrid');
var MFSFilterSubgrid = require('../../dataModels/MFS/MFSFilterSubgrid');
var SummarySubgrid = require('../../dataModels/SummarySubgrid');
var features = require('../../features');
//var aggregations = require('hyper-analytics').util.aggregations;
//var aggregations = require('../local_node_modules/hyper-analytics').util.aggregations;
var aggregations = require('../../local_node_modules/finanalytics').aggregations;

var noop = function () { };

// [MFS] JSON Date-safe clone
function jsonDeserializeHelper(key, value) {
    "use strict";
    if (typeof value === 'string') {
        var regexp = /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d.\d\d\dZ$/.exec(value);
        if (regexp) {
            return new Date(value);
        }
    }
    return value;
}

// [MFS] from propertySvc
var setNestedProperty = function (obj, fieldRefs, value) {
    "use strict";
    var nestedFieldRefs = fieldRefs.slice();
    var ref = nestedFieldRefs.shift();

    var ordinalMatch = ref.indexOf("[") >= 0 ? ref.match(/^(.*)\[([0-9]*)\]$/) : null;
    if (!!ordinalMatch && ordinalMatch.length > 2) {
        var ordinal = parseInt(ordinalMatch[2]);
        var listRef = ordinalMatch[1];
        obj[listRef] = obj[listRef] || [];
        if (nestedFieldRefs.length === 0) {
            if (obj[listRef].length > ordinal) {
                obj[listRef][ordinal] = value;
            } else {
                // TODO: this assumes the ordinal specified matches the index of the appended object, which is definitely not guaranteed
                obj[listRef].append(value);
            }
        } else {
            var newObj = obj[listRef][ordinal] || {};
            if (obj[listRef].length > ordinal) {
                obj[listRef][ordinal] = newObj;
            } else {
                // TODO: this assumes the ordinal specified matches the index of the appended object, which is definitely not guaranteed
                obj[listRef].append(newObj);
            }
            setNestedProperty(newObj, nestedFieldRefs, value);
        }
    } else {
        if (nestedFieldRefs.length === 0) {
            obj[ref] = value;
        } else {
            obj[ref] = obj[ref] || {};
            setNestedProperty(obj[ref], nestedFieldRefs, value);
        }
    }
};
var getNestedProperty = function (obj, fieldRefs) {
    "use strict";
    if (obj == null)
        return null;
    var newFieldRefs = fieldRefs.slice();
    var ref = newFieldRefs.shift();
    var objRef = obj[ref];

    if (ref.indexOf("[") >= 0) {
        var ordinalMatch = ref.match(/^(.*)\[([0-9]*)\]$/);
        if (!!ordinalMatch && ordinalMatch.length > 2) {
            var arrayRef = obj[ordinalMatch[1]];
            objRef = arrayRef != null ? arrayRef[ordinalMatch[2]] : null;
        }
    }

    if (newFieldRefs.length === 0) {
        return objRef;
    } else {
        return getNestedProperty(objRef, newFieldRefs);
    }
};

var deleteNestedProperty = function (obj, fieldRefs) {
    "use strict";
    var newFieldRefs = fieldRefs.slice();
    var ref = newFieldRefs.shift();
    if (newFieldRefs.length === 0) {
        delete obj[ref];
    } else {
        deleteNestedProperty(obj[ref], newFieldRefs);
    }
};

/**
 * @name behaviors.MFS
 * @desc > Same parameters as {@link behaviors.Behavior#initialize|initialize}, which is called by this constructor.
 * @constructor
 */
var MFS = Behavior.extend('behaviors.MFS', {

    /**
     * @summary Constructor logic, called _after_{@link Behavior#initialize|Behavior.initialize()}.
     * @desc This method will be called upon instantiation of this class or of any class that extends from this class.
     * > All `initialize()` methods in the inheritance chain are called, in turn, each with the same parameters that were passed to the constructor, beginning with that of the most "senior" class through that of the class of the new instance.
     *
     * @param grid - the hypergrid
     * @param {object[]} options - options (including data)
     * @memberOf behaviors.MFS.prototype
     */
    initialize: function(grid, options) {
        this.setData(options);
        /**
         * _nextId together with getNextId function combined are served as a sequencing function.
         */
        this._nextId = 1;

        this.tableState = this.tableState || {};
        this.tableState.sorted = [];
        this.tableState.filtered = [];
        // this.sortStates = [' ', ' \u2191', ' \u2193'];
        this.sortStates = [' ', '\u25b2', '\u25bc'];
        this.filterStates = [' ', '@'];
    },

    features: [
        features.CellSelection,
        features.KeyPaging,
        features.ColumnResizing,
        features.ColumnSorting,
        features.CellEditing,
        features.CellClick,
        features.OnHover,
        features.Filters
    ],

    reset: function (options) {
        this.clearState();

        if (this.dataModel) {
            this.dataModel.reset();
        } else {
            /**
             * @type {DataModel}
             * @memberOf Behavior.prototype
             */
            this.dataModel = this.getNewDataModel(options);
        }

        // recreate `CellEvent` class so it can set up its internal `grid`, `behavior`, and `dataModel` convenience properties
        this.CellEvent = cellEventFactory(this.grid);

        this.dataUpdates = {}; //for overriding with edit values;
        this.scrollPositionX = this.scrollPositionY = 0;
        this.clearColumns();
        this.clearState();
        this.createColumns();

        this.subgrids = options.subgrids || [
            HeaderSubgrid,
            MFSFilterSubgrid,
            [SummarySubgrid, { name: 'topTotals' }],
            this.dataModel,
            [SummarySubgrid, { name: 'bottomTotals' }]
        ];
    },

    aggregations: aggregations,

    createColumns: function() {
        var dataModel = this.dataModel;
        var columnCount = dataModel.getColumnCount();
        var headers = dataModel.getHeaders();
        var fields = dataModel.getFields();
        this.clearColumns();
        for (var i = 0; i < columnCount; i++) {
            var header = headers[i];
            var column = this.addColumn(i, fields[i]);
            var properties = column.properties;
            properties.header = header;
            properties.complexFilter = null;
        }
    },

    applyAnalytics: function() {
        this.dataModel.applyAnalytics();
    },

    getCellEditorAt: function (event) {
        return this._getCellEditorAt(event);
    },

    /**
     * @memberOf behaviors.MFS.prototype
     * @description Set the header labels.
     * @param {string[]} headerLabels - The header labels.
     */
    setHeaders: function(headerLabels) {
        this.dataModel.setHeaders(headerLabels);
    },

    /**
     * @memberOf behaviors.MFS.prototype
     * @desc * @returns {string[]} The header labels.
     */
    getHeaders: function() {
        return this.dataModel.getHeaders();
    },

    /**
     * @memberOf behaviors.MFS.prototype
     * @description Set the fields array.
     * @param {string[]} fieldNames - The field names.
     */
    setFields: function (fieldNames) {
        //were defining the columns based on field names....
        //we must rebuild the column definitions
        this.dataModel.setFields(fieldNames);
        // this.createColumns();
    },

    /**
     * @memberOf behaviors.MFS.prototype
     * @description Get the field names.
     * @returns {string[]}
     */
    getFields: function() {
        return this.dataModel.getFields();
    },

    /**
    * update data (excluding new entries which are not in server yet) 
    * 
    * @method setData
    * @return {object} Return nothing 
    * @param {object[]} jsonData Usually data retrieved from hypergrid (angular) $scope.items
    */
    setData: function (dataRows, options) {
        "use strict";
        if (!(Array.isArray(dataRows) || typeof dataRows === 'function')) {
            options = dataRows;
            dataRows = options && options.data;
        }

        dataRows = this.unwrap(dataRows);

        if (dataRows === undefined) {
            return;
        }

        if (!Array.isArray(dataRows)) {
            throw 'Data is not an array';
        }

        options = options || {};
        var grid = this.grid;

        this.dataModel.setData(dataRows);
        // this.createColumns();
        
        if (!this.dataModel.getNewData()) {
            this.setNewData([]);
        }
        
        this.initDataIndexes();

        // Update ExpandedItems and cacheItems

        this.updateExpandedItems();

        var self = this;
        if (this.grid.isColumnAutosizing()) {
            setTimeout(function () {
                self.autosizeAllColumns();
            }, 100);
            self.changed();
        } else {
            setTimeout(function () {
                self.allColumns[-1].checkColumnAutosizing(true);
                self.changed();
            });
        }
        this.fire('digestRequired');
    },

    /**
     * @summary Set the top totals.
     * @memberOf behaviors.MFS.prototype
     * @param {Array<Array>} totalRows - array of rows (arrays) of totals
     */
    setTopTotals: function(totalRows) {
        this.dataModel.setTopTotals(totalRows);
    },

    /**
     * @summary Get the top totals.
     * @memberOf behaviors.MFS.prototype
     * @returns {Array<Array>}
     */
    getTopTotals: function() {
        return this.dataModel.getTopTotals();
    },

    /**
     * @summary Set the bottom totals.
     * @memberOf behaviors.MFS.prototype
     * @param {Array<Array>} totalRows - array of rows (arrays) of totals
     */
    setBottomTotals: function(totalRows) {
        this.dataModel.setBottomTotals(totalRows);
    },

    /**
     * @summary Get the bottom totals.
     * @memberOf behaviors.MFS.prototype
     * @returns {Array<Array>}
     */
    getBottomTotals: function() {
        return this.dataModel.getBottomTotals();
    },

    // [MFS]
    /**
     * @memberOf behaviors.MFS.prototype
     * @description update the definition of columns and buttons. It updates columns, _headers, _fields, _headers, and maxColumnCharacters in tableState.     
     * @method setColumns
     * @return {object} Returns nothing
     * @param {object[]} columnDefinitions the definition of columns. Require at least data and title.
     * @param {object[]} buttonDefinitions the definition of buttons. Require at least Visible, Caption and Color.
     */
    setColumns: function(columnDefinitions, buttonDefinitions) {
        "use strict";
        buttonDefinitions = (buttonDefinitions && buttonDefinitions.length) ? buttonDefinitions : [];
        var columnCount = columnDefinitions.length;
        var fields = new Array(columnCount);
        var headers = new Array(columnCount);
        var i;
        for (i = 0; i < columnCount; i++) {
            var each = columnDefinitions[i];
            fields[i] = each.data;
            headers[i] = each.title;
        }
        /// originally it was a simple copy:
        /// this.columns = JSON.parse(JSON.stringify(columnDefinitions));
        /// In new Hypergrid, it is advised to have a Column class, so:
        this.clearColumns();

        // In latest version of Hypergrid, it is required to have a schema first
        const schema = columnDefinitions.map(d => {
            return {
                "name" : d.data,
                "header" : d.title
            };
        }).concat(buttonDefinitions.map(d => {
            return {
                "name": `@${d.Visible}`,
                "header": d.Caption
            };
        }));

        this.dataModel.schema = schema;
        for (var i = 0; i < columnCount; i++) {
            var header = headers[i];
            var column = this.addColumn(i, fields[i]);
            var properties = column.properties;
            properties.header = header;
            // Sync local filter to the columns
            var filterValue = this.getFilterValueByColumnIndex(i);
            if (filterValue === undefined) {
                delete properties.filter;
            } else {
                properties.filter = filterValue;
            }

            properties.complexFilter = null;
            // properties are not appended to column in Hypergrid 2.0, so we will force to insert attributes directly into column
            for (var attr in columnDefinitions[i]) {
                if (columnDefinitions[i].hasOwnProperty(attr)) {
                    column[attr] = columnDefinitions[i][attr];
                }
            }

            if (column.leafAggregateFunction) {
                column.leafAggregateFunction = eval("var tempVariable = " + column.leafAggregateFunction + ";tempVariable");
            }
        }

        this._buttons = JSON.parse(JSON.stringify(buttonDefinitions));
        for (i = 0; i < this._buttons.length; i++) {
            var data = '@' + this._buttons[i].Visible; // Magic prefix to ask getValue to use angular
            fields.push(data);
            headers.push('');
            var column = this.addColumn(columnCount + i,
            {
                'name': fields[columnCount + i]
            });
            var properties = column.properties;
            properties.header = '';
            properties.complexFilter = null;

            column.data = data;
            column.title = this._buttons[i].Caption;
            column.control = true;
            column.readOnly = true;
            column.buttonColor = this._buttons[i].Color;
            column.enabled = '@' + this._buttons[i].Enabled;                                  
        }

        this.setFields(fields);
        this.setHeaders(headers);
        this.tableState.maxColumnCharacters = [];
        for (i = 0; i < headers.length; i++) {
            this.tableState.maxColumnCharacters[i] = headers[i].length;
        }
        this.initColumnIndexes();
    },

    /**
     * @memberOf behaviors.MFS.prototype
     * @description Enhance the double-click event just before it's broadcast to listeners.
     * @param {Point} event
     */
    enhanceDoubleClickEvent: function(event) {
        event.row = this.getRow(event.gridCell.y);
    },

    setDataProvider: function(dataProvider) {
        this.dataModel.setDataProvider(dataProvider);
    },

    hasHierarchyColumn: function() {
        return this.dataModel.hasHierarchyColumn();
    },

    getColumnAlignment: function(x) {
        if (x === 0 && this.hasHierarchyColumn()) {
            return 'left';
        } else {
            return 'center';
        }
    },

    getRowSelectionMatrix: function(selectedRows) {
        return this.dataModel.getRowSelectionMatrix(selectedRows);
    },

    getColumnSelectionMatrix: function(selectedColumns) {
        return this.dataModel.getColumnSelectionMatrix(selectedColumns);
    },

    getSelectionMatrix: function(selections) {
        return this.dataModel.getSelectionMatrix(selections);
    },

    getRowSelection: function() {
        var selectedRows = this.getSelectedRows();
        return this.dataModel.getRowSelection(selectedRows);
    },

    getColumnSelection: function() {
        var selectedColumns = this.getSelectedColumns();
        return this.dataModel.getColumnSelection(selectedColumns);
    },

    getSelection: function() {
        var selections = this.getSelections();
        return this.dataModel.getSelection(selections);
    },

    buildColumnPicker: function(div) {
        if (!this.isColumnReorderable()) {
            return false;
        }

        var listOptions = {
            cssStylesheetReferenceElement: div
        };

        var groups = { models: this.getGroups(), title: 'Groups' },
            availableGroups = { models: this.getAvailableGroups(), title: 'Available Groups' },
            hiddenColumns = { models: this.getHiddenColumns(), title: 'Hidden Columns' },
            visibleColumns = { models: this.getVisibleColumns(), title: 'Visible Columns'},
            groupLists = new ListDragon([groups, availableGroups], listOptions),
            columnLists = new ListDragon([hiddenColumns, visibleColumns], listOptions),
            listSets = [groupLists, columnLists];

        listSets.forEach(function(listSet) {
            listSet.modelLists.forEach(function(list) {
                div.appendChild(list.container);
            });
        });

        //attach for later retrieval
        div.lists = {
            group: groups.models,
            availableGroups: availableGroups.models,
            hidden: hiddenColumns.models,
            visible: visibleColumns.models
        };

        return true;
    },
    getGroups: function() {
        return this.dataModel.getGroups();
    },
    getAvailableGroups: function() {
        return this.dataModel.getAvailableGroups();
    },
    getHiddenColumns: function() {
        return this.dataModel.getHiddenColumns();
    },
    getVisibleColumns: function() {
        return this.dataModel.getVisibleColumns();
    },
    setColumnDescriptors: function(lists) {
        //assumes there is one row....
        var tree = this.columns[0];
        this.columns.length = 0;
        if (tree && tree.label === 'Tree') {
            this.columns.push(tree);
        }
        for (var i = 0; i < lists.visible.length; i++) {
            this.columns.push(lists.visible[i]);
        }

        var groupBys = lists.group.map(function(e) {
            return e.id;
        });
        this.dataModel.setGroups(groupBys);

        this.changed();
    },

    getSelectedRows: function() {
        var offset = -this.grid.getHeaderRowCount();
        var selections = this.grid.selectionModel.getSelectedRows();
        var result = selections.map(function(each) {
            return each + offset;
        });
        return result;
    },

    getSelectedColumns: function() {
        return this.grid.selectionModel.getSelectedColumns();
    },

    getSelections: function() {
        return this.grid.selectionModel.getSelections();
    },

    /**
    * update the property of an object where sub items reside, and update tableState.$cacheExpandedItemsIndex
    * The tableState.$cacheExpandedItemsIndex is a one-to-one mapping from row index to tuples, which is used by
    * getDataIndexTuple function. This function is run regardless if subItemsProperty is defined or not.
    *
    * @method setSubItemPropety
    * @return {object} Return Nothing
    */
    setSubItemsProperty: function (subItemsPropertyColonleafSubItemProperty) {
        "use strict";
        var stringArray = subItemsPropertyColonleafSubItemProperty.split("::");
        var subItemsProperty = stringArray[0];
        var leafSubItemsProperty = stringArray[1];
        this.tableState = this.tableState || {};
        this.tableState.scopeInfo = this.tableState.scopeInfo || {};
        this.tableState.scopeInfo.subItemsProperty = subItemsProperty;
        this.tableState.scopeInfo.leafSubItemsProperty = leafSubItemsProperty;
        this.tableState.expandedItemsManager = new ExpandedItemsManager(this);
        this.tableState.expandedItemsManager.init(this.getData()?this.getData().length : 0, this.getNewData()?this.getNewData().length : 0);
    },

    // [MFS]
    getNewData: function () {
        "use strict";
        return this.dataModel.getNewData();
    },

    // [MFS]
    getLeafSubItemsProperty: function () {
        "use strict";
        return this.tableState.scopeInfo ? this.tableState.scopeInfo.leafSubItemsProperty : "";
    },

    // [MFS]
    /**
    * Update column indexes and fixed column indexes
    *
    * @method initColumnIndexes
    * @return {object} Return Nothing
    */
    initColumnIndexes: function () {
        "use strict";
        var columnCount = this.getActiveColumnCount();
        var fixedColumnCount = this.getFixedColumnCount();
        var i;
        this.tableState.columnIndexes = [];
        for (i = 0; i < columnCount; i++) {
            if (!this.tableState.hiddenColumns || !this.tableState.hiddenColumns.length || this.tableState.hiddenColumns.indexOf(i) === -1) {
                this.tableState.columnIndexes.push(i);
            }
        }
        for (i = 0; i < fixedColumnCount; i++) {
            this.tableState.fixedColumnIndexes[i] = i;
        }
    },

    // [MFS]
    isTotalRowNumber: function (rowY) {
        "use strict";
        return this.enableTotalRow() && rowY === this.getExpandedDataRowCount() + this.getNewDataCount();
    },

    // [MFS]
    /**
    * 
    * If total row is enabled.
    * 
    * @method enableTotalRow
    * @returns {} 
    */
    enableTotalRow: function () {
        "use strict";
        return this.tableState.scopeInfo && this.tableState.scopeInfo.totalRow;
    },

    fixedRowClicked: function (grid, mouse) {
        "use strict";
        if (mouse.gridCell.y === 0) {
            this.toggleSort(mouse.gridCell.x);
        }
    },

    // [MFS]
    /**
    * Translate row index into the corresponding data index (and sub data index)
    * If this is the main row, sub data index would be null.
    *
    * @method getDataIndexTuple
    * @return {number[]} Returns an array of integers of indexes
    * @param {number} The row index.
    */
    getDataIndexTuple: function (rowY) {
        "use strict";
        if (rowY >= this.getState().expandedItemsManager.$cacheExpandedItemsIndex.length) {
            throw "rowY >= this.getState().expandedItemsManager.$cacheExpandedItemsIndex.length";
        } else {
            return this.getState().expandedItemsManager.$cacheExpandedItemsIndex[rowY];
        }
    },

    // [MFS]
    /**
    * Return the tuple level of a given tuple, no matter what is the value of multiLevel
    *
    * @method getDataItemLevel
    * @return {number} Returns the level of the data item.
    * @param {number[]} tuple The data index tuple.
    */
    getDataItemLevel: function (tuple) {
        "use strict";
        /// [0, 1] : Level 0
        /// [0, 1, null] : Level 0
        /// [1, 1] : Level 0
        /// [1, 1, null] : Level 0
        /// [1, 1, 2, null, null] : Level 1
        for (var i = tuple.length - 1; i >= 0; i--) {
            if (tuple[i] !== null) {
                return i - 1;
            }
        }
        throw 'Invalid tuple!';
    },
    // [MFS]
    getState: function () {
        return this.grid.properties;
    },
    // [MFS]
    /**
     * update new entry data 
     * 
     * @method setNewData
     * @return {object} Return nothing 
     * @param {object[]} jsonData Usually data retrieved from hypergrid (angular) $scope.newItems
     */
    setNewData: function (jsonData) {        
        "use strict";
        jsonData = (jsonData === null || jsonData === undefined) ? [] : jsonData;
        this.dataModel.setNewData(jsonData);
        this.updateExpandedItems();
        this._newData = jsonData;
        // this.initDataIndexes();
        this.changed();
        this.fire('digestRequired');
    },
    // [MFS
    /**
    * Unknown function.
    *
    * @method initDataIndexes
    * @return {object} Return Nothing
    */
    initDataIndexes: function () {
        "use strict";
        //initialize the indexe cache
        var data = this.getData();
        for (var i = 0; i < data.length; i++) {
            data[i].__si = i;
            data[i].__i = i;
        }
    },
    // [MFS]
    /**
    * Update tableState.ExpandedItems
    * tableState.ExpandedItems is a dictionary which stores the id of the expanded data item, as well as the sub item it introduces.
    * Every update to tableState.ExpandedItems will cause update to table.$cacheExpandedItemsIndex, which is an array that returns
    * dataIndexTuple
    * This function is used if a significant difference of items occurs, 
    * and is mainly used for updating tableState.$cacheExpandedItemsIndex when inaccurate.
    *
    * @method updateExpandedItems
    * @return {object} Returns Nothing
    */
    updateExpandedItems: function () {
        "use strict";
        if (!this.getState().expandedItemsManager) {
            this.getState().expandedItemsManager = new ExpandedItemsManager(this);
        }
        this.getState().expandedItemsManager.updateExpandedItems(this.getData(), this.getNewData());
    },
    // [MFS]
    /**
      * * Polyfill for fire in polymer
      *
      * @method fire
      * @returns {Object} event
      * @param {string} type An event name.
      * @param {any} detail
      * @param {Node} onNode Target node.
      * @param {Boolean} bubbles Set false to prevent bubbling, defaults to true
      * @param {Boolean} cancelable Set false to prevent cancellation, defaults to true
      */
    fire: function (type, detail, onNode, bubbles, cancelable) {
        var node = onNode || this.grid.div;
        var detail = detail === null || detail === undefined ? {} : detail;
        var event = new CustomEvent(type, {
            bubbles: bubbles !== undefined ? bubbles : true,
            cancelable: cancelable !== undefined ? cancelable : true,
            detail: detail
        });
        node.dispatchEvent(event);
        return event;
    },
    // [MFS]
    getMultiLevels: function () {
        "use strict";
        return this.tableState.scopeInfo ? this.tableState.scopeInfo.multiLevels : 1;
    },
    // [MFS]
    /**
    * Get a unique id from item according to primary key definition.
    *
    * @method getIdByItem
    * @return {string} Returns the unique id
    * @param {object} The item to retrieve primary key from
    */
    getIdByItem: function (item, level) {
        "use strict";
        var tempItem = {};
        var self = this;
        if (this.tableState.scopeInfo.keyFields && this.tableState.scopeInfo.keyFields.length) {
            this.tableState.scopeInfo.keyFields.forEach(function (key) {
                self.setProperty(tempItem, key, self.getProperty(item, key));
            });
        } else {
            this.getColumns().forEach(function (column) {
                self.setProperty(tempItem, column.data, self.getProperty(item, column.data));
            });
        }
        if (!!item.$hypergridId) {
            tempItem["$hypergridId"] = item.$hypergridId;
        }
        tempItem["_level"] = level;
        return JSON.stringify(tempItem);
    },
    // [MFS]
    getColumns: function () {
        "use strict";
        return this.columns;
    },
    // [MFS]
    /**
    * A wrapper function to call getNestedProperty. Support dotted property.
    *
    * @method getProperty
    * @return {object} Return the property.
    */
    getProperty: function (obj, fieldRef) {
        "use strict";
        if (fieldRef == null) return null;
        var fieldRefs = fieldRef.split('.');
        return getNestedProperty(obj, fieldRefs);
    },
    // [MFS]
    /**
     * A wrapper function to call setNestedProperty. Support dotted property.
     *
     * @method setProperty
     * @return {object} Return nothing.
     */
    setProperty: function (obj, fieldRef, value) {
        "use strict";
        if (fieldRef == null) return null;
        var fieldRefs = fieldRef.split('.');
        setNestedProperty(obj, fieldRefs, value);
    },
    // [MFS]
    /**
     * A wrapper function to call deleteNestedProperty. Support dotted property.
     *
     * @method setProperty
     * @return {object} Return nothing.
     */
    deleteProperty: function (obj, fieldRef) {
        "use strict";
        if (fieldRef == null) return null;
        var fieldRefs = fieldRef.split('.');
        deleteNestedProperty(obj, fieldRefs);
    },
    // [MFS]
    /**
    * retrieve the property of an object where sub items reside
    *
    * @method getSubItemProperty
    * @return {string} Return the property of an object where sub items reside
    */
    getSubItemsProperty: function () {
        "use strict";
        return this.tableState.scopeInfo ? this.tableState.scopeInfo.subItemsProperty : "";
    },
    // [MFS]
    /**
    * Get the data item given row index
    *
    * @method getDataItem
    * @return {object} The corresponding data object.
    * @param {number} rowY The row index.
    */
    getDataItem: function (rowY) {
        "use strict";
        // Assuming Data Structure:
        /*
        var normalData = [{
            {{this.getSubItemsProperty()}}: [{
            ......
                {{this.getLeafSubItemsProperty()}}: [{
                }],
                ...
            }, {
            ...
            }],
            ...
        }, {
            ...
        }];

        var newData = [{
            {{this.getSubItemsProperty()}}: [{
            ......
                {{this.getLeafSubItemsProperty()}}: [{
                }],
                ...
            }, {
            ...
            }],
            ...
        }, {
            ...
        }];
        */

        var newDataIndicator = rowY >= this.getExpandedDataRowCount();

        var leafSubItemIndicator = !!this.getLeafSubItemsProperty();

        // Get a shallow copy
        var dataIndexTuple = this.getDataIndexTuple(rowY).slice(0);
        // [0] indicates data / new data
        dataIndexTuple.shift();

        var dataItem = newDataIndicator ?
            this.getNewDataItemByDataY(dataIndexTuple[0]) :
            this.getDataItemByDataY(dataIndexTuple[0]);

        var count = 1;
        while (count < dataIndexTuple.length && dataIndexTuple[count] !== null) {
            dataItem = dataItem[(leafSubItemIndicator && count === dataIndexTuple.length - 1 ?
                    this.getLeafSubItemsProperty() :
                    this.getSubItemsProperty()
            )][dataIndexTuple[count]];
            count++;
        }
        return dataItem;
    },
    // [MFS]
    /**
    * return row count, except new entries.
    *
    * @method getExpandedDataRowCount
    * @return {number} Return the count of all rows, except new entries.
    */
    getExpandedDataRowCount: function () {
        "use strict";
        return this.getState().expandedItemsManager ? this.getState().expandedItemsManager.$sectionRanges[0] : 0;
        /*
        return this.getSubItemsProperty() ? 
            (this.getState().expandedItemsManager.$cacheExpandedItemsIndex ? this.getState().expandedItemsManager.$cacheExpandedItemsIndex.length : 0) :
            this.getDataCount();
        */
    },
    // [MFS]
    /**
    * Get the data item given data index
    *
    * @method getDataItemByDataY
    * @return {object} The corresponding data object.
    * @param {number} dataY The data index.
    */
    getDataItemByDataY: function (dataY) {
        "use strict";
        var dataCount = this.getDataCount();
        if (dataY < dataCount) {
            return this.getData()[dataY];
        } else {
            return this.getNewData()[dataY - dataCount];
        }
    },
    // [MFS]
    /**
    * return the count of data items (excluding new entry data)
    *
    * @method getDataCount
    * @return {number} Return the count of data items
    */
    getDataCount: function () {
        "use strict";
        return this.getData() ? this.getData().length : 0;
    },
    // [MFS]
    /**
    * Return if the data item corresponding to the data row is a leaf
    *
    * @method isLeafRow
    * @return {number} Returns the level of the data item.
    * @param {number[]} tuple The data index tuple.
    */
    isLeafRow: function (rowY) {
        "use strict";
        var dataIndexTuple = this.getDataIndexTuple(rowY);
        return this.isLeafTuple(dataIndexTuple);
    },
    // [MFS]
    /**
    * Return if the data item corresponding to the data index tuple is a leaf
    *
    * @method isLeafTuple
    * @return {number} Returns the level of the data item.
    * @param {number[]} tuple The data index tuple.
    */
    isLeafTuple: function (tuple) {
        "use strict";
        return tuple[tuple.length - 1] !== null;
    },

    // [MFS]
    /**
    *
    * 
    New return column width (defined in tableState)
    */
    // Looks like the default getColumnWidth runs better, so commented out.
    /*
    getColumnWidth: function (x) {
        var col = this.getColumn(x);
        if (!col) {
            return this.resolveProperty('defaultColumnWidth');
        }
        var width = col.getWidth();
        return width;
    },
    */

    // [MFS] potentially needs to change
    /**
     * @memberOf Behavior.prototype
     * @return {number} The number of header rows.
     * A portion of the number returned by {@link Behavior#getFixedRowCount()|getFixedRowCount()}.
     * (The remaining _fixed rows_ are the _top totals_ rows.)
     */
    getHeaderRowCount: function() {
        var header = this.grid.isShowHeaderRow() ? 1 : 0;
        var filter = this.grid.isShowFilterRow() ? 1 : 0;
        var totals = this.getTopTotals().length;
        return header + filter + totals;
    },

    // [MFS]
    getNewDataCount: function () {
        "use strict";
        return this.getNewData() ? this.getNewData().length : 0;
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
    getFormattedProperty: function (obj, column) {
        "use strict";
        noop(obj);
        noop(column);
        throw 'To be defined in mfs-hypergrid-wrapper';
    },

    onDoubleClick: function(grid, event) {
        "use strict";
        var processed = false;
        // Is it an invalid column?
        // ReSharper disable once ExpressionIsAlwaysConst
        // ReSharper disable once ConditionIsAlwaysConst
        !processed && (processed = this.invalidColumnOnClickHandler(grid, event));
        if (!processed && this.featureChain) {
            this.featureChain.handleClick(grid, event);
            this.setCursor(grid);
        }
    },
    // [MFS]
    /**
    * click handler for all click events on hypergrid.
    *
    * @method onClick
    * @return {object} Returns Nothing
    * @param {object} grid The fin-hypergrid
    * @param {object} event A click event defined in fin-hypergrid
    */
    onClick: function (grid, event) {
        "use strict";
        var processed = false;
        var gridCell = event.gridCell;
        var fixedColCount = this.getFixedColumnCount();
        var fixedRowCount = this.getFixedRowCount();
        // No translateColumnIndex in Hypergrid 2.0
        var dataX = this.translateColumnIndex(this.grid.getHScrollValue() + gridCell.x - fixedColCount);

        var isFixedRow = gridCell.y - fixedRowCount < 0;

        // [MFS] Hypergrid 2.0 change - gridCell.py already take into consideration of VScrollValue
         var rowY = gridCell.y - fixedRowCount;
        // var rowY = (isFixedRow ? 0 : this.grid.getVScrollValue()) + gridCell.y - fixedRowCount;
        // Adjustment if dataY runs out of boundary
        rowY = Math.min(rowY, this.getExpandedAllRowCount(true));

        // Is it top left cell for clearing filters
        // ReSharper disable once ExpressionIsAlwaysConst
        // ReSharper disable once ConditionIsAlwaysConst
        !processed && (processed = this.clearFiltersHandler(grid, event, rowY));

        // Is it on row number column?
        !processed && (processed = this.rowNumberColumnOnClickHandler(grid, event, rowY));

        // Is it an invalid column?
        !processed && (processed = this.invalidColumnOnClickHandler(grid, event, dataX));

        // Is it a control button?
        !processed && (processed = this.controlButtonOnClickHandler(grid, event, dataX, rowY));

        // Is it an exising row?
        !processed && (processed = this.existingRowOnClickHandler(grid, event, dataX, rowY));

        // Is it a new row?
        !processed && (processed = this.newRowOnClickHandler(grid, event, dataX, rowY));

        // Is it on a filter row?
        !processed && (processed = this.filterRowOnClickHandler(grid, event));

        if (!processed && this.featureChain) {
            this.featureChain.handleClick(grid, event);
            this.setCursor(grid);
        }
    },

    clearFiltersHandler: function (grid, event) {
        "use strict";
        if (event.gridCell.x === -1 && event.gridCell.y === 1) {
            this.clearLocalFilter();
            return true;
        } else {
            return false;
        }
    },

    /**
 * Right click handler for all right click events on hypergrid.
 *
 * @method onContextMenu
 * @return {object} Returns Nothing
 * @param {object} grid The fin-hypergrid
 * @param {object} event A right click event defined in fin-hypergrid
 */
    onContextMenu: function (grid, event) {
        "use strict";
        var processed = false;
        var gridCell = event.gridCell;
        var fixedColCount = this.getFixedColumnCount();
        var fixedRowCount = this.getFixedRowCount();
        // No translateColumnIndex in Hypergrid 2.0
        var dataX = this.translateColumnIndex(this.grid.getHScrollValue() + gridCell.x - fixedColCount);
        var isFixedRow = gridCell.y - fixedRowCount < 0;
        // [MFS] Hypergrid 2.0 change - gridCell.py already take into consideration of VScrollValue
        var rowY = gridCell.y - fixedRowCount;
        // var rowY = (isFixedRow ? 0 : this.grid.getVScrollValue()) + gridCell.y - fixedRowCount;
        // Adjustment if dataY runs out of boundary
        rowY = Math.min(rowY, this.getExpandedAllRowCount(true));

        // ReSharper disable once ExpressionIsAlwaysConst
        // ReSharper disable once ConditionIsAlwaysConst
        // Is it a header row?
        if (!processed && dataX !== -1 && gridCell.y === 0) {
            processed = true;
            this.fire("columnHeaderRightClick", { "columnIndex": dataX, "finEvent": event });
        }
        // Is it on row number column?
        if (!processed && gridCell.x === -1 && gridCell.y !== 0 && rowY < this.getExpandedAllRowCount(false)) { // Reserve top-left cell for other usage
            processed = true;
            var row = this.getDataItem(rowY);
            row["$hypergridIdForSubmit"] = this.getSubmitHypergridId(rowY);
            row["$hypergridIdForRemove"] = this.getSubmitHypergridId(rowY);
            //TODO
            this.fire("rowHeaderRightClick", {
                "rowIndex": rowY,
                "row": row,
                "finEvent": event
            });

        }
    },

    // [MFS]
    /**
    * return row count, including new entries.
    *
    * @method getExpandedAllRowCount
    * @param {boolean} includeTotalRow Whether to include total row
    * @return {number} Return the count of all rows, including new entries and .
    */
    getExpandedAllRowCount: function (includeTotalRow) {
        "use strict";
        return this.getExpandedDataRowCount() + this.getExpandedNewDataRowCount() + (includeTotalRow && this.enableTotalRow() ? 1 : 0);
    },
    // [MFS]
    /**
    * return row count of new data
    *
    * @method getExpandedNewDataRowCount
    * @return {number} Return the count of all rows of new data
    */
    getExpandedNewDataRowCount: function () {
        "use strict";
        var expandedItemsManager = this.getState().expandedItemsManager;
        return expandedItemsManager ? expandedItemsManager.$sectionRanges[1] - expandedItemsManager.$sectionRanges[0] : 0;
    },
    // [MFS]
    /**
    * click handler for all click events on row number column on hypergrid.
    *
    * @method rowNumberColumnOnClickHandler
    * @return {bool} Returns True is processed by this handler; false otherwise
    * @param {object} grid The fin-hypergrid
    * @param {object} event A click event defined in fin-hypergrid
    * @param {int} index of the row. It might be different form dataY due to there might be subitems expanded.
    */
    rowNumberColumnOnClickHandler: function (grid, event, rowY) {
        "use strict";
        // [MFS]
        // Changes in 2.0
        // event.gridCell.x now refers to data columns
        // meaning that row number column is now -1, not 0
        if (event.gridCell.x === -1 &&
            event.gridCell.y !== 0 &&
            rowY < this.getExpandedAllRowCount(false) &&
            this.getSubItemsProperty()) { // Reserve top-left cell for other usage
            this.toggleDataRow(rowY);
            return true;
        } else {
            return false;
        }
    },
    // [MFS]
    /**
         * click handler for click events on invalid columns in hypergrid.
         *
         * @method invalidColumnOnClickHandler
         * @return {bool} Returns True is processed by this handler; false otherwise
         * @param {object} grid The fin-hypergrid
         * @param {object} event A click event defined in fin-hypergrid
         * @param {int} index of the column
         */
    invalidColumnOnClickHandler: function (grid, event, dataX) {
        noop(grid, event);
        // Checking dataX no longer works - it will always fallback to rightest column
        return event.primitiveEvent.detail.mouse.x > event.visibleColumn.right;
        /// return dataX === undefined || this.getColumns().length <= dataX;
    },
    // [MFS]
    /**
     * click handler for click events on control buttons in hypergrid.
     *
     * @method controlButtonOnClickHandler
     * @return {bool} Returns True is processed by this handler; false otherwise
     * @param {object} grid The fin-hypergrid
     * @param {object} event A click event defined in fin-hypergrid
     * @param {int} index of the column
     * @param {int} index of the row. It might be different form dataY due to there might be subitems expanded.
     */
    controlButtonOnClickHandler: function (grid, event, dataX, rowY) {
        "use strict";
        // Is the clicked cell a control button? (lazy evaluation)
        if (this.getColumns().length > dataX && // column must be within defined columns
            this.getColumns()[dataX].control && // column must be a control button
            rowY >= 0 && // the row must be a row with data
            rowY < this.getAllDataCount() && // the row must not be a total row or row without data
            (this.getColumns()[dataX].data === "true" ||
                this.dataModel.source.getValue(dataX, rowY)) && // The button is showed
            (!this.isSubmitting()) && // the record is not under submitting 
            this.getMagicValue(this.getDataItem(rowY), this.getColumns()[dataX].enabled.substring(1))
        ) {
            this.fire('controlTriggered', { "buttonIndex": dataX + this._buttons.length - this.getColumns().length, "itemIndex": rowY });
            return true;
        } else {
            return false;
        }
    },
    // [MFS]
    /**
     * click handler for all click events on an existing row on hypergrid.
     *
     * @method exisitngRowOnClickHandler
     * @return {bool} Returns True is processed by this handler; false otherwise
     * @param {object} grid The fin-hypergrid
     * @param {object} event A click event defined in fin-hypergrid
     * @param {int} index of the column
     * @param {int} index of the row. It might be different form dataY due to there might be subitems expanded.
     */
    existingRowOnClickHandler: function (grid, event, dataX, rowY) {
        "use strict";
        if (event.gridCell.x !== 0 && // Not Row Number
            event.gridCell.y !== 0 && // Not Header row
            event.gridCell.y !== 1 && // Not Filter row
            rowY < this.getExpandedDataRowCount() &&
            this.enableNewRowEntry()) { // Ensure there is a form attached to the view                
            if (this.getColumns()[dataX].leafAggregateFunction && !this.isLeafRow(rowY)) {
                this.toggleDataRow(rowY);
            }
            return true;
        } else {
            return false;
        }
    },
    // [MFS]
    /**
     * click handler for all click events on a new row on hypergrid.
     *
     * @method newRowOnClickHandler
     * @return {bool} Returns True is processed by this handler; false otherwise
     * @param {object} grid The fin-hypergrid
     * @param {object} event A click event defined in fin-hypergrid
     * @param {int} index of the column
     * @param {int} index of the row. It might be different form dataY due to there might be subitems expanded.
     */
    newRowOnClickHandler: function (grid, event, dataX, rowY) {
        "use strict";
        if (rowY >= this.getExpandedDataRowCount() &&
            this.enableNewRowEntry()) { // Ensure there is a form attached to the view                
            // A non-existing new row is clicked
            if (rowY === this.getExpandedAllRowCount(true)) {
                return this.createNewRowOnClickHandler(grid, event);
            } else {
                // This is an existing new row
                return this.existingNewRowOnClickHandler(grid, event, dataX, rowY);
            }
        } else {
            return false;
        }
    },
    // [MFS]
    /**
    * Check if new row entry functionality should be enabled.
    *
    * @method enableNewRowEntry
    * @return {Boolean} true if it should be enabled, false if not.
    */
    enableNewRowEntry: function () {
        "use strict";
        return this.tableState.scopeInfo && this.tableState.scopeInfo.formConfig && !this.tableState.scopeInfo.hideNewButton && !this.tableState.scopeInfo.disableNewRowEntry;
    },
    // [MFS]
    /**
    * click handler for all click events on filter row on hypergrid.
    *
    * @method filterRowOnClickHandler
    * @return {bool} Returns True is processed by this handler; false otherwise
    * @param {object} grid The fin-hypergrid
    * @param {object} event A click event defined in fin-hypergrid
    * @param {int} index of the row. It might be different form dataY due to there might be subitems expanded.
    */
    filterRowOnClickHandler: function (grid, event) {
        "use strict";
        return false;
        // Handled by features/Filter.js
        // Except event.Cell.x === -1
        // in which case we clear all the filters
        /*
        if (event.gridCell.x !== 0 &&
            event.gridCell.y === 1) {
            grid._activateEditor(event);
            return true;
        } else {
            return false;
        }
        */
    },
    // [MFS]
    getCursorAt: function (columnX, rawY) {
        "use strict";
        // Do something similar to onClick
        var rowY = rawY - this.getHeaderRowCount();
        var dataX = columnX;
        var dataY = rowY;

        if (dataX >= 0 && dataY >= 0 &&
            this.getColumns().length > dataX && // column must be within defined columns                
            rowY >= 0 && // the row must be a row with data
            rowY < this.getAllDataCount()) { // the row must not be a total row or row without data
            // Is the clicked cell a control button?
            if (this.getColumns()[dataX].control && // column must be a control button
                (this.getColumns()[dataX].data === "true" ||
                    this.dataModel.source.getValue(dataX, rowY)) // The button is showed
            ) {
                return "pointer";
            }
            if (this.getLeafSubItemsProperty() &&
                !this.isLeafRow(rowY) &&
                this.getColumns()[dataX].leafAggregateFunction) {
                return "pointer";
            }
            return null;
        } else {
            return null;
        }
    },
    // [MFS]
    /**
    * return the count of all data items including new data
    *
    * @method getAllDataCount
    * @return {number} Return the count of all data items
    */
    getAllDataCount: function () {
        "use strict";
        return this.getDataCount() + this.getNewDataCount();
    },
    // [MFS]
    /**
    * Get the display of row number or expanded status.
    *
    * @method getFixedColumnValue
    * @return {string} Return the column display
    * @param {number} columnX 
    * @param {number} rowY
    */
    getFixedColumnValue: function (columnX, rowY) {
        "use strict";
        if (rowY === undefined) {
            throw "getFixedColumnValue: rowY is undefined";
        }

        if (rowY < 0) {
            return "";
        }

        var leafSubItemsIndicator = !!this.getLeafSubItemsProperty();
        var isTotalRowNumber = this.isTotalRowNumber(rowY);
        var dataIndexTuple = null;
        var isLeaf = null;
        var isOpen = null;
        var tupleLevel = null;
        if (!isTotalRowNumber) {
            dataIndexTuple = this.getDataIndexTuple(rowY);
            isLeaf = this.isLeafTuple(dataIndexTuple);
            isOpen = this.isOpen(rowY);
            tupleLevel = this.getDataItemLevel(dataIndexTuple);
        }

        var returnString = "";
        var icon;
        var i;
        if (isTotalRowNumber) {
            return "Summ.";
        } else if (rowY < this.getExpandedDataRowCount()) {
            if (this.getSubItemsProperty()) {
                if (!isLeaf) {
                    if (isOpen) {
                        icon = "-";
                    } else {
                        icon = "+";
                    }
                    for (i = 0; i < tupleLevel; i++) {
                        returnString += " ";
                    }
                    returnString += icon;
                    for (i = 0; i < this.getMultiLevels() + (this.getLeafSubItemsProperty() ? 1 : 0) - tupleLevel - 2; i++) {
                        returnString += " ";
                    }
                    return returnString;
                } else {
                    return "";
                }
            } else if (this.getLeafSubItemsProperty()) {
                if (!isLeaf) {
                    return dataIndexTuple[1] + 1;
                } else {
                    return "";
                }
            } else {
                return dataIndexTuple[1] + 1;
            }
        } else {
            var dataItem = this.getDataItem(rowY);
            if (dataItem === null || dataItem === undefined) {
                throw "dataItem is null in " + rowY;
            }
            if (leafSubItemsIndicator) {
                if (isLeaf) {
                    return "";
                } else {
                    icon = isOpen ? "-" : "+";
                    if (this.getDataItem(rowY)["$hypergridRowState"] === "Submitted") {
                        return " \u2191" + (dataIndexTuple[1] + 1) + icon;
                    } else {
                        return "*" + (dataIndexTuple[1] + 1) + icon;
                    }
                }
            } else {
                // Is the row in submitted status?                    
                if (this.getDataItem(rowY)["$hypergridRowState"] === "Submitted") {
                    return " \u2191" + (dataIndexTuple[1] + 1);
                } else {
                    return "*" + (dataIndexTuple[1] + 1);
                }
            }
        }
    },
    // [MFS]
    /**
    * A predicate that returns if the row corresponding to the row index is a main row and if it is expanded.
    * An expanded data item will have its id registered in table state under expandedItems.
    *
    * @method isOpen
    * @return {Boolean} Return true if it is a main row and it is expanded, otherwise return false.
    * @param {number} rowY The row index.
    */
    isOpen: function (rowY) {
        "use strict";
        var id = this.getIdByItem(this.getDataItem(rowY), this.getDataItemLevel(this.getDataIndexTuple(rowY)));
        return this.getState().expandedItemsManager.isDataItemOpenByItemId(id);
    },
    // [MFS]
    /**
    * Toggle expanded status of a main data item and update $cacheExpandedItemsIndex accordingly
    *
    * @method toggleDataRow
    * @return {object} Returns Nothing
    * @param {number} rowY The data item index of the data
    */
    toggleDataRow: function (rowY) {
        "use strict";
        var dataIndexTuple = this.getDataIndexTuple(rowY);
        // Get Id
        var id = this.getIdByItem(this.getDataItem(rowY), this.getDataItemLevel(this.getDataIndexTuple(rowY)));
        if (!this.isLeafTuple(dataIndexTuple)) {
            // Is the data Item open?
            if (this.getState().expandedItemsManager.isDataItemOpenByItemId(id)) {
                this.removeExpandedItem(id, dataIndexTuple);
            } else {
                this.addExpandedItem(id, dataIndexTuple);
            }
            this.changed();
        }
        // Do nothing if it is a leaf row
    },
    // [MFS]
    addExpandedItem: function (id, tuple) {
        "use strict";
        // Calculate parentIds
        var parentIds = [];
        var count = 0;
        var data = tuple[0] === 0 ? this.getData() : this.getNewData();
        var leafSubItemIndicator = !!this.getLeafSubItemsProperty();
        var pureTuple = tuple.slice(0);
        pureTuple.shift();
        while (data !== undefined && data !== null && count < pureTuple.length - 1) {
            var dataItem = data[pureTuple[count]];
            var vid = this.getIdByItem(dataItem, count);
            if (vid === id) {
                break;
            }
            parentIds.push(vid);
            data = dataItem[(leafSubItemIndicator && count === pureTuple.length - 2 ?
                    this.getLeafSubItemsProperty() :
                    this.getSubItemsProperty()
            )];
            count++;
        }
        this.getState().expandedItemsManager.addExpandedItem(id, parentIds, tuple, false, true);
    },
    // [MFS]
    removeExpandedItem: function (id, dataIndexTuple) {
        "use strict";
        this.getState().expandedItemsManager.removeExpandedItem(id, dataIndexTuple);
    },
    // [MFS]
    /**
    * Obtain the count of subItems of a data item, indicated by a tuple
    *
    * @method getSubItemCount
    * @return {number} count of subItems of a data item, indicated by a tuple
    * @param {number[]} A tuple that identifies a data item
    */
    getSubItemCount: function (tuple) {
        "use strict";
        var data = tuple[0] === 0 ? this.getData() : this.getNewData();
        var leafSubItemIndicator = !!this.getLeafSubItemsProperty();
        var count = 0;
        var pureTuple = tuple.slice(0);
        pureTuple.shift();
        var subItemProperty = null;
        while (data !== undefined && pureTuple[count] !== null) {
            subItemProperty = (leafSubItemIndicator && count === pureTuple.length - 2) ?
                this.getLeafSubItemsProperty() :
                this.getSubItemsProperty();
            data = data[pureTuple[count]][subItemProperty];
            count++;
        }
        if (data !== undefined && data !== null) {
            return data.length;
        } else {
            console.warn("Some of the data do not meet the level requirement Expected " + subItemProperty + " presented.");
            return 0;
        }

    },
    // [MFS]
    /**
    * 
    *
    * @method getExpandedAllRowCount
    * @return {number} Return the count of all rows, including new entries and header rows.
    */
    getRowCount: function () {
        "use strict";
        return this.getExpandedAllRowCount(true) + this.getHeaderRowCount();
    },
    // [MFS]
    /**
    * click handler for all click events for creating a new row on hypergrid.
    *
    * @method createNewRowOnClickHandler
    * @return {bool} Returns True is processed by this handler; false otherwise
    * @param {object} grid The fin-hypergrid
    * @param {object} event A click event defined in fin-hypergrid
    */
    createNewRowOnClickHandler: function (grid, event) {
        "use strict";
        if (event.primitiveEvent.detail.primitiveEvent.ctrlKey) {
            if (this.getNewDataCount() > 0) {
                // Use the latest one as template
                var lastItem = this.getNewData()[this.getNewData().length - 1];
                var newItem = JSON.parse(JSON.stringify(lastItem), jsonDeserializeHelper);
                // Remove attributes starting with $
                for (var attr in newItem) {
                    if (newItem.hasOwnProperty(attr) && (attr.substr(0, 1) === '$' || attr.substr(0, 2) === '__')) {
                        delete newItem[attr];
                    }
                }
                this.addNewDataItem(newItem);

            } else {
                // There is no row to reference from
                this.addNewDataItem();
            }
            // This is important : need to inform the UI that the data is changed and need to repaint the grid.
            this.changed();
            return true;
        } else {
            return false;
        }
    },
    // [MFS]
    /**
    * Add a new item in the new entry data storage
    *
    * @method addNewDataItem
    * @return {objecet} Return Nothing
    * @param {object} item The item object to be added into new entry data storage
    */
    addNewDataItem: function (item) {
        var newItem;
        if (item) {
            newItem = item;
        } else {
            newItem = this.createDefaultItem();
        }
        newItem["$hypergridId"] = this.getNextId();
        newItem["$hypergridRowState"] = "Editing";
        if (this.getNewData() === null) {
            this.setNewData([newItem]);
        } else {
            this.setNewData(this.getNewData().concat([newItem]));
        }

        // Because setNewData is called, $cacheExpandedItemsIndex and $sectionRanges will be updated automatically, so no need to adjust $cacheExpandedItemsIndex / $sectionRanges.
        /*        
        var index = this.getNewData().length - 1;
        var tuple = [1, index];
        for (var i = 0; i < this.getMultiLevels() + (!!this.getLeafSubItemsProperty() ? 1 : 0) - 1; ++i) {
            tuple.push(null);
        }        
        this.getState().expandedItemsManager.$cacheExpandedItemsIndex.push(tuple);        
        this.getState().expandedItemsManager.$sectionRanges[1] += 1;
        */
    },
    // [MFS]
    /**
    * To generate a new id for an item. as data might change during oepration, the row numer
    * is not a realiable tool to uniquely identify a row.
    *
    * @method getNextId
    * @return {number} The next Id.
    */
    getNextId: function () {
        "use strict";
        var returnId = this._nextId;
        this._nextId++;
        return returnId;
    },
    // [MFS]
    /**
    * Get the data item given data index
    *
    * @method getNewDataItemByDataY
    * @return {object} The corresponding data object.
    * @param {number} dataY The data index.
    */
    getNewDataItemByDataY: function (dataY) {
        "use strict";
        if (!this.getNewData()) {
            throw "newData is not initialized!";
        }
        if (dataY >= this.getNewData().length) {
            throw "dataY >= this.getNewData().length";
        }
        return this.getNewData()[dataY];
    },
    // [MFS]
    /**
    * click handler for all click events on an existing new row on hypergrid.
    *
    * @method newRowOnClickHandler
    * @return {bool} Returns True is processed by this handler; false otherwise
    * @param {object} grid The fin-hypergrid
    * @param {object} event A click event defined in fin-hypergrid
    * @param {int} index of the column
    * @param {int} index of the row. It might be different form dataY due to there might be subitems expanded.
    */
    existingNewRowOnClickHandler: function (grid, event, dataX, rowY) {
        "use strict";
        if (!this.getColumns()[dataX].leafAggregateFunction || this.isLeafRow(rowY)) {
            grid._activateEditor(event);
        } else {
            if (event.primitiveEvent.detail.primitiveEvent.ctrlKey) {
                // Add a new subItem
                this.addLeafDataItem(rowY);
                if (!this.isOpen(rowY)) {
                    this.toggleDataRow(rowY);
                } else {
                    this.toggleDataRow(rowY);
                    this.toggleDataRow(rowY);
                }
            } else {
                this.toggleDataRow(rowY);
            }

        }

        return true;
    },

    /**
         * Key down handler for all key down events on hypergrid.
         *
         * @method onKeyDown
         * @return {object} Returns Nothing
         * @param {object} grid The fin-hypergrid
         * @param {object} event A key down event defined in fin-hypergrid
         */
    onKeyDown: function (grid, event) {
        "use strict";
        var processed = false;
        var gridX, gridY;
        var rawGridX, rawGridY;
        var dataX, rowY;

        if (grid.selectionModel.selections.length > 0) {
            rawGridX = grid.selectionModel.selections[0].left;
            rawGridY = grid.selectionModel.selections[0].top;

            // Hypergrid 2.0, still need to figure out why the constants
            gridX = rawGridX - 1;
            gridY = rawGridY - 2;

            dataX = this.translateColumnIndex(gridX);
            rowY = gridY;

            // ReSharper disable once ConditionIsAlwaysConst
            processed = processed || this.onEnterKeyDownHandler(grid, event, rawGridX, rawGridY, dataX, rowY);

            processed = processed || this.onCtrlShiftEnterKeyDownHandler(grid, event);

            processed = processed || this.onCtrlEnterKeyDownHandler(grid, event, gridX, gridY, dataX, rowY);

            processed = processed || this.onShiftDeleteKeyDownHandler(grid, event, gridX, gridY, dataX, rowY);

        }

        // The following handler applies regardless if there is any selection
        // It can be editing mode, so selection is null                
        // ReSharper disable once ConditionIsAlwaysConst
        processed = processed || this.onTabKeyDownHandler(grid, event);

        if (!processed && this.featureChain) {
            this.featureChain.handleKeyDown(grid, event);
            this.setCursor(grid);
        }
    },
    /**
     * Key down handler for enter key down events on hypergrid.
     *
     * @method onEnterKeyDown
     * @return {bool} Returns true is processed by this handler, false if not
     * @param {object} grid The fin-hypergrid
     * @param {object} event A key down event defined in fin-hypergrid
     * @param {int} grid column index
     * @param {int} grid row index
     * @param {int} column index
     * @param {int} row index
     */
    onEnterKeyDownHandler: function (grid, event, rawGridX, rawGridY, dataX, rowY) {
        if (event.detail.char === "RETURN" &&
            !event.detail.ctrl &&
            !event.detail.shift &&
            !grid.isEditing()) {
            // Enter in non-editing status

            if (this.getColumns()[dataX].control) {
                if (this.getColumns()[dataX].data === "true" ||
                    this.getValue(dataX, rowY)) { // The button is showed
                    this.fire("controlTriggered", { "buttonIndex": dataX + this.getButtons().length - this.getColumns().length, "itemIndex": dataY });
                }
            } else {
                var cellEditor = grid.getCellEditorAt(rawGridX, rawGridY);
                grid.cellEditor = cellEditor;

                var tabEditPoint = new Point(rawGridX, rawGridY);
                grid.setMouseDown(tabEditPoint);
                grid.setDragExtent(new Point(0, 0));

                // [MFS] [GEKKO-967] Multiple hypergrid support
                if (cellEditor.isAdded) {
                    if (cellEditor.grid !== this) {
                        cellEditor.attachEditor();
                    }
                } else {
                    cellEditor.isAdded = true;
                    cellEditor.attachEditor();
                }

                cellEditor.attachEditor();
                cellEditor.grid = grid;
                cellEditor.beginEditAt(new Point(rawGridX, rawGridY));
                
            }
            return true;
        } else {
            return false;
        }
    },
    /**
     * Key down handler for ctrl + shift + enter key down events on hypergrid.
     *
     onCtrlShiftEnterKeyDownHandler
     * @return {bool} Returns true is processed by this handler, false if not
     * @param {object} grid The fin-hypergrid
     * @param {object} event A key down event defined in fin-hypergrid
     */
    onCtrlShiftEnterKeyDownHandler: function (grid, event) {
        if (event.detail.char === "RETURNSHIFT" &&
            event.detail.ctrl &&
            event.detail.shift &&
            (!grid.isEditing() || grid.cellEditor.alias === "readonly")) {
            // Ctrl + Shift + Enter in non-editing status
            //// Properly handle the editing status of readonly editor, if any
            var cellEditor = grid.cellEditor;
            if (cellEditor && cellEditor.alias === "readonly") {
                cellEditor.stopEditing();
                grid.repaint();
                grid.takeFocus();
            }
            this.fire("harvestNewRows");
            return true;
        } else {
            return false;
        }
    },
    /**
     * Key down handler for ctrl + enter key down events on hypergrid.
     *
     * @method onCtrlEnterKeyDown
     * @return {bool} Returns true is processed by this handler, false if not
     * @param {object} grid The fin-hypergrid
     * @param {object} event A key down event defined in fin-hypergrid
     * @param {int} grid column index
     * @param {int} grid row index
     * @param {int} column index
     * @param {int} row index
     */
    onCtrlEnterKeyDownHandler: function (grid, event, gridX, gridY, dataX, rowY) {
        if (event.detail.char === "RETURN" &&
            event.detail.ctrl &&
            !event.detail.shift &&
            (!grid.isEditing() || grid.cellEditor.alias === "readonly")) {
            // Ctrl + Enter in non-editing status
            if (rowY >= this.getData().length && rowY < this.getExpandedAllRowCount(false)) {
                //// Properly handle the editing status of readonly editor, if any
                var cellEditor = grid.cellEditor;
                if (cellEditor && cellEditor.alias === "readonly") {
                    cellEditor.stopEditing();
                    grid.repaint();
                    grid.takeFocus();
                }
                var submitHypergridId = this.getSubmitHypergridId(rowY);
                // Get the parent and fire the parent instead
                this.fire("harvestNewRows", { "rowHypergridId": submitHypergridId });
            }
            return true;
        } else {
            return false;
        }
    },
    /**
     * Key down handler for shift + delete key down events on hypergrid.
     *
     * @method onShiftDeleteKeyDown
     * @return {bool} Returns true is processed by this handler, false if not
     * @param {object} grid The fin-hypergrid
     * @param {object} event A key down event defined in fin-hypergrid
     * @param {int} grid column index
     * @param {int} grid row index
     * @param {int} column index
     * @param {int} row index
     */
    onShiftDeleteKeyDownHandler: function (grid, event, gridX, gridY, dataX, rowY) {
        if (event.detail.identifier === "U+007F" &&
            event.detail.shift) {
            // Shift + Delete
            if (rowY < this.getExpandedAllRowCount(false)) {
                this.removeDataItem(rowY);
            }
            return true;
        } else {
            return false;
        }
    },
    /**
     * Key down handler for (shift + ) tab key down events on hypergrid.
     *
     * @method onTabKeyDownHandler
     * @return {bool} Returns true is processed by this handler, false if not
     * @param {object} grid The fin-hypergrid
     * @param {object} event A key down event defined in fin-hypergrid
     */
    onTabKeyDownHandler: function (grid, event) {
        if (event.detail.char === "TAB" && grid.isEditing()) {
            // 1. Stop Editing current Cell
            var cellEditor = grid.cellEditor;
            cellEditor.stopEditing();
            grid.repaint();
            // [MFS] remove setTimeout takeFocus
            // grid.takeFocus();
            // 2. Move to next cell
            if (event.detail.shift) {
                this.featureChain.handleLEFT(grid);
            } else {
                this.featureChain.handleRIGHT(grid);
            }
            // And should be able to get selection now
            var rawGridX = grid.selectionModel.selections[0].left;
            var rawGridY = grid.selectionModel.selections[0].top;

            // Hypergrid 2.0, still need to figure out why the constants
            var gridX = rawGridX;
            var gridY = rawGridY - 2;
            var dataX = this.translateColumnIndex(gridX);

            // Twist on !isLeaf
            var rowY = gridY;
            var tuple = this.getDataIndexTuple(rowY);
            var tupleLength = tuple.length;
            var leafSubItemProperty = this.getLeafSubItemsProperty();
            if (tuple[tupleLength - 1] === null &&
                tuple[tupleLength - 2] !== null &&
                !!this.getColumns()[dataX].leafAggregateFunction &&
                !!leafSubItemProperty) {
                if (this.isOpen(rowY)) {
                    this.toggleDataRow(rowY);
                }

                var dataItem = this.getDataItem(rowY);
                if (!dataItem[leafSubItemProperty] || dataItem[leafSubItemProperty].length === 0) {
                    this.addLeafDataItem(rowY);
                }
                // At this stage getRowCount() return previous number
                this.toggleDataRow(rowY);
                grid.paintNow(); // Refresh Cache in renderer

                // Have a fake handleDown event
                var fakeEvent = {
                    "primitiveEvent": {
                        "preventDefault": () => {}
                    }
                };
                this.featureChain.handleDOWN(grid, fakeEvent);
                gridY += 1;
                rawGridY += 1;
                rowY += 1;
            }

            // 3. Start Editing
            cellEditor = grid.getCellEditorAt(rawGridX, rawGridY);
            grid.cellEditor = cellEditor;

            var tabEditPoint = new Point(rawGridX, rawGridY);
            grid.setMouseDown(tabEditPoint);
            grid.setDragExtent(new Point(0, 0));

            // [MFS] [GEKKO-967] Multiple hypergrid support
            if (cellEditor.isAdded) {
                if (cellEditor.grid !== this) {
                    cellEditor.attachEditor();
                }
            } else {
                cellEditor.isAdded = true;
                cellEditor.attachEditor();
            }

            cellEditor.attachEditor();
            cellEditor.grid = grid;
            cellEditor.beginEditAt(new Point(rawGridX, rawGridY));
            // 4. Repaint
            grid.repaint();
            return true;
        } else {
            return false;
        }
    },

    // [MFS]
    translateColumnIndex : function(x) {
        return x;
    },
    
    // [MFS]
    /**
    * Similar to setValue, except the property is already calculated so no need to retrieve from fields
    *
    * @method setAttribute
    * @return Return Nothing
    * @param {number} rowY The row Index
    * @param {string} attr The property to be set
    * @param {object} value The value to be assigned
    */
    setAttribute: function (rowY, attr, value) {
        "use strict";
        this.setProperty(this.getDataItem(rowY), attr, value);
        this.fire('digestRequired');
    },
    
    /**
    * Add a new sub item in the new entry data storage
    *
    * @method addLeafDataItem
    * @return {objecet} Return Nothing
    * @param {object} item The item object to be added into new entry data storage
    */
    addLeafDataItem: function (rowY, item) {
        var parentItem = this.getDataItem(rowY);
        var newItem;
        if (item) {
            newItem = item;
        } else {
            newItem = this.createDefaultLeafItem(parentItem);
        }
        newItem["$hypergridId"] = this.getNextId();
        newItem["$hypergridRowState"] = "Editing";
    },

    /**
    * Create a default leaf data item
    *
    * @method createDefaultLeafItem
    * @return {object} Returns a default leaf data item
    */
    createDefaultLeafItem: function () {
        "use strict";
        // To be overwritten in angular  
        throw "Not implemented";
    },

    getSubmitHypergridId: function (rowY) {
        "use strict";
        return this.getDataItem(this.getNonLeafParentRowIndex(rowY))["$hypergridId"];
    },

    getNonLeafParentRowIndex: function (rowY) {
        "use strict";
        //// if this is a leaf row in new data, need to find its corresponding parent row to submit
        if (this.getLeafSubItemsProperty() && this.isLeafRow(rowY)) {
            var tuple = this.getDataIndexTuple(rowY);
            var parentTuple = tuple.slice(0);
            parentTuple[parentTuple.length - 1] = null;
            return this.getRowIndexByTuple(parentTuple);
        } else {
            return rowY;
        }
    },

    getRowIndexByTuple: function (tuple) {
        "use strict";
        return this.getState().expandedItemsManager.getRowIndexByTuple(tuple);
    },

    getSortImageForColumn: function(index) {
        const sortIndex = this.tableState.sorted[index] || 0;
        return this.sortStates[sortIndex];
    },

    getNewDataModel: function (options) {
        return new DataModelMfs(this.grid, options);
    },

    // [MFS]
    setTableState(state) {
        this.tableState = state;
    },

    // [MFS]
    getTableState() {
        return this.tableState;
    }
});

module.exports = MFS;
