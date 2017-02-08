'use strict';

//var analytics = require('hyper-analytics');
//var analytics = require('../local_node_modules/hyper-analytics');
var analytics = require('../../local_node_modules/finanalytics');
var DataModel = require('../DataModel');
var MFSDataSourceOrigin = require('../../dataSources/MFSDataSourceOrigin');
var images = require('../../../images');

var UPWARDS_BLACK_ARROW = '\u25b2', // aka '▲'
    DOWNWARDS_BLACK_ARROW = '\u25bc'; // aka '▼'


/**
 * @implements dataSourceHelperAPI
 * @desc This is a simple "null" helper API implementation with only a null `properties` method is defined.
 * @see {@link http://c2.com/cgi/wiki?NullObject}
 * @memberOf dataModels.JSON
 * @inner
 */
const nullDataSourceHelperAPI = {
    properties: function (properties) {
        var result,
            isGetter = 'getPropName' in properties;

        if (isGetter) {
            // All props are undefined in this null API regardless of their name; and
            // undefined props return `null` as per interface definition.
            result = null;
        }

        return result;
    }
};

/**
 * @name dataModels.MFS
 * @constructor
 */
var MFS = DataModel.extend('dataModels.MFS', {

    topTotals: [],
    bottomTotals: [],

    initialize: function (grid, options) {
        this.reset(options);        
    },

    /**
     * Override to use a different origin.
     * @type(DataSourceBase}
     */
    DataSourceOrigin: MFSDataSourceOrigin,

    clearSelectedData: function() {
        this.selectedData.length = 0;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {boolean}
     */
    hasAggregates: function() {
        return this.analytics.hasAggregates();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {boolean}
     */
    hasGroups: function() {
        return this.analytics.hasGroups();
    },

    getDataSource: function() {
        return this.postsorter; //this.hasAggregates() ? this.analytics : this.presorter;
    },

    getFilterSource: function() {
        return this.postfilter; //this.hasAggregates() ? this.postfilter : this.prefilter;
    },

    getGlobalFilterSource: function() {
        return this.postglobalfilter; //this.hasAggregates() ? this.postfilter : this.prefilter;
    },

    getSortingSource: function() {
        return this.postsorter; //this.hasAggregates() ? this.postsorter : this.presorter;
    },

    getData: function() {
        return this.source.data;
    },

    getNewData: function () {
        return this.source.newData;
    },

    getFilteredData: function() {
        var ds = this.getDataSource();
        var count = ds.getRowCount();
        var result = new Array(count);
        for (var y = 0; y < count; y++) {
            result[y] = ds.getRow(y);
        }
        return result;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} x
     * @param {number} y
     * @returns {*}
     */
    getValue: function (x, y) {
        var hasHierarchyColumn = this.hasHierarchyColumn();
        var value;
        if (hasHierarchyColumn) {
            if (x === -2) {
                x = 0;
            }
        } else if (this.hasAggregates()) {
            x += 1;
        }
        value = this.getDataSource().getValue(x, y);
        return value;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} x
     * @param {number} y - negative values refer to _bottom totals_ rows
     * @returns {*}
     */
    getHeaderRowValue: function(x, y) {
        var value;
        if (y === undefined) {
            value = this.getHeaders()[Math.max(x, 0)];
        } else if (y < 0) { // bottom totals rows
            var bottomTotals = this.getBottomTotals();
            value = bottomTotals[bottomTotals.length + y][x];
        } else {
            var isFilterRow = this.grid.isShowFilterRow(),
                isHeaderRow = this.grid.isShowHeaderRow(),
                topTotalsOffset = (isFilterRow ? 1 : 0) + (isHeaderRow ? 1 : 0);
            if (y >= topTotalsOffset) { // top totals rows
                value = this.getTopTotals()[y - topTotalsOffset][x];
            } else if (isHeaderRow && y === 0) {
                value = this.getHeaders()[x];
                var sortString = this.getSortImageForColumn(x);
                if (sortString) { value = value + ' ' + sortString; }
            } else { // must be filter row
                value = this.getFilter(x);
                var icon = images.filter(value.length);
                return [null, value, icon];
            }
        }
        return value;
    },

    /**
     * @function
     * @instance
     * @description
     create a default empty tablestate
     * #### returns: Object
     */
    getDefaultState: function () {
        return {
            columnIndexes: [],
            fixedColumnIndexes: [],
            hiddenColumns: [],

            columnWidths: [],
            fixedColumnWidths: [],
            fixedColumnAutosized: [],

            rowHeights: {},
            fixedRowHeights: {},
            columnProperties: [],
            columnAutosized: [],

            fixedColumnCount: 0,
            fixedRowCount: 1,
        };
    },

    /**
     * @function
     * @instance
     * @description
     getter for a [Memento](http://c2.com/cgi/wiki?MementoPattern) Object
     * #### returns: Object
     */
    getState: function () {
        if (!this.tableState) {
            this.tableState = this.getDefaultState();
            this.initColumnIndexes(this.tableState);
        }
        return this.tableState;
    },

    /**
     * update tableState and re-render the hypergrid.
     * 
     * @method setState
     * @return {object} Return nothing 
     * @param {object[]} state The table state.
     */
    setState: function (state) {
        "use strict";
        this.tableState = state;
        this.changed();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} x
     * @param {number} y
     * @param value
     */
    setValue: function(x, y, value) {
        var hasHierarchyColumn = this.hasHierarchyColumn();
        var headerRowCount = this.grid.getHeaderRowCount();
        if (hasHierarchyColumn) {
            if (x === -2) {
                x = 0;
            }
        } else if (this.hasAggregates()) {
            x += 1;
        }
        if (y < headerRowCount) {
            this.setHeaderRowValue(x, y, value);
        } else {
            this.getDataSource().setValue(x, y - headerRowCount, value);
        }
        this.changed();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} x
     * @param {number} y
     * @param value
     * @returns {*}
     */
    setHeaderRowValue: function(x, y, value) {
        if (value === undefined) {
            return this._setHeader(x, y); // y is really the value
        }
        var isFilterRow = this.grid.isShowFilterRow();
        var isHeaderRow = this.grid.isShowHeaderRow();
        var isBoth = isFilterRow && isHeaderRow;
        var topTotalsOffset = (isFilterRow ? 1 : 0) + (isHeaderRow ? 1 : 0);
        if (y >= topTotalsOffset) {
            this.getTopTotals()[y - topTotalsOffset][x] = value;
        } else if (x === -1) {
            return; // can't change the row numbers
        } else if (isBoth) {
            if (y === 0) {
                return this._setHeader(x, value);
            } else {
                this.setFilter(x, value);
            }
        } else if (isFilterRow) {
            this.setFilter(x, value);
        } else {
            return this._setHeader(x, value);
        }
        return '';
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} colIndex
     * @returns {*}
     */
    getColumnProperties: function(colIndex) {
        //access directly because we want it ordered
        var column = this.grid.behavior.allColumns[colIndex];
        if (column) {
            return column.properties;
        }
        return undefined;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} colIndex
     * @returns {string} The text to filter on for this column.
     */
    getFilter: function(colIndex) {
        var filter, columnProperties;

        if ((columnProperties = this.getColumnProperties(colIndex))) {
            filter = columnProperties.filter;
        }

        return filter || '';
    },

    /** @typedef {function} rowFilterFunction
     * @param {function|*} data - Data to test (or function to call to get data to test) to see if it qualifies for the result set.
     * @returns {boolean} Row qualifies for the result set (passes through filter).
     */
    /**
     * @param {number} colIndex
     * @returns {undefined|rowFilterFunction} row filtering function
     */
    getComplexFilter: function(colIndex) {
        var rowFilter, columnProperties, filter, filterObject, newFilter;

        if (
            (columnProperties = this.getColumnProperties(colIndex)) &&
            (filter = columnProperties.complexFilter) &&
            (filterObject = this.grid.filter) &&
            (newFilter = filterObject.create(filter.state))
        ) {
            rowFilter = function(data) {
                var transformed = valueOrFunctionExecute(data);
                return newFilter(transformed);
            };
        }

        return rowFilter;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} colIndex
     * @param value
     */
    setFilter: function(colIndex, value) {
        var columnProperties = this.getColumnProperties(colIndex);
        columnProperties.filter = value;
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {number}
     */
    getColumnCount: function() {
        var showTree = this.grid.properties['showTreeColumn'] === true;
        var hasAggregates = this.hasAggregates();
        var offset = (hasAggregates && !showTree) ? -1 : 0;
        return this.analytics.getColumnCount() + offset;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {number}
     */
    getRowCount: function() {
        var count = this.getDataSource().getRowCount();
        count += this.grid.getHeaderRowCount();
        return count;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {string[]}
     */
    getHeaders: function() {
        return this.analytics.getHeaders();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {string[]} headers
     */
    setHeaders: function(headers) {
        this.getDataSource().setHeaders(headers);
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {string[]} fields
     */
    setFields: function(fields) {
        this.getDataSource().setFields(fields);
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {string[]}
     */
    getFields: function() {
        return this.getDataSource().getFields();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     */
    reindex: function (options) {
        selectedDataRowsBackingSelectedGridRows.call(this);

        this.pipeline.forEach(function (dataSource) {
            if (dataSource) {
                if (dataSource.apply) {
                    dataSource.apply(options);
                }
            }
        });

        reselectGridRowsBackedBySelectedDataRows.call(this);
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {object[]} dataRows
     */
    setData: function (dataRows) {
        if (this.source && this.source.setData) {
            this.source.setData(dataRows);
        } else {
            // Specialize mfsDataSource
            this.source = new MFSDataSourceOrigin(dataRows, null, this.grid);
        }
        
        //this.preglobalfilter = new analytics.DataSourceGlobalFilter(this.source);
        //this.prefilter = new analytics.DataSourceFilter(this.preglobalfilter);
        //this.presorter = new analytics.DataSourceSorterComposite(this.prefilter);

        this.analytics = new analytics.DataSourceAggregator(this.source);

        this.postglobalfilter = new analytics.DataSourceGlobalFilter(this.analytics);
        this.postfilter = new analytics.DataSourceFilter(this.postglobalfilter);
        this.postsorter = new analytics.DataSourceSorterComposite(this.postfilter);

        this.applyAnalytics();

    },

    // [MFS]
    setNewData: function(dataRows) {
        this.source.newData = dataRows;
    },

    /**
 * @summary Instantiates the data source pipeline.
 * @desc Each new pipe is created from the list of supplied constructors, each taking a reference to the previous data source in the pipeline.
 *
 * A reference to each new pipe is added to `this.sources` dataModel using the pipe's derived name.
 *
 * Will clear out any filtering and sorting state.
 *
 * The last pipe is assigned the synonym `this.dataSource`.
 * @param {pipelineSchema} [DataSources] - New pipeline description. If not given, uses the default {@link dataModels.MFS#DataSources|this.defaultPipelineSchema}.
 * @param {object} [options] - Takes first argument position when `DataSources` omitted.
 * @param {string} [options.stash] - See {@link dataModels.MFS.prototype#getPipelineSchemaStash}. If given, saves the currently defined pipeline onto the indicated stash stack and then resets it with the given `DataSources`.
 * @memberOf dataModels.MFS.prototype
 */
    setPipeline: function (DataSources, options) {
        if (!Array.isArray(DataSources)) {
            options = DataSources;
            DataSources = undefined;
        }

        if (options && options.stash) {
            this.getPipelineSchemaStash(options.stash).push(this.DataSources);
        }

        var dataSource = this.source;

        /**
         * @summary Currently defined pipeline.
         * @desc Each instance has its own pipeline.
         * (Pipelines cannot be shared because they contain indexes specific to the data in the grid.)
         * @name pipeline
         * @type {dataSourcePipelineObject[]}
         * @memberOf dataModels.MFS.prototype
         */
        this.pipeline = [];

        DataSources = DataSources || this.defaultPipelineSchema;

        DataSources.forEach(function (DataSource) {
            if (DataSource) {
                dataSource = new DataSource(dataSource);
                this.pipeline.push(dataSource);

                // Ensure a null helper API defined for all data sources that require one
                if (dataSource.type && dataSource.set && !this.api[dataSource.type]) {
                    this.registerHelperAPI(dataSource.type);
                }
            }
        }, this);

        this.updateDataSources();

        this.dataSource = dataSource;

        this.DataSources = DataSources;
    },

    /**
     * @summary Update data sources with APIs of matching types.
     * @desc Only updates _qualified_ data sources, which include:
     * * those for which an API of the data source's type is defined in `this.api`; and
     * * those that can accept an API (have an `api` property to set).
     * @param {string} [type] - Type of data source to update. If omitted, updates all data sources.
     * @returns {number|object} One of:
     * `type` specified - The number of updated data sources of the specified type.
     * `type` omitted - Hash containing the number of updated data sources by type.
     */
        updateDataSources: function (type) {
            var results = {},
                api = this.api;

            this.pipeline.forEach(function (dataSource) {
                if (
                    (!type || dataSource.type === type) &&
                    api[dataSource.type]
                ) {
                    dataSource.set(api[dataSource.type]);
                    results[dataSource.type] = (results[dataSource.type] || 0) + 1;
                }
            });

            return type ? results[type] : results;
        },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {Array<Array>} totalRows
     */
    setTopTotals: function(totalRows) {
        this.topTotals = totalRows;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {Array<Array>}
     */
    getTopTotals: function() {
        return this.hasAggregates() ? this.getDataSource().getGrandTotals() : this.topTotals;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {Array<Array>} totalRows
     */
    setBottomTotals: function(totalRows) {
        this.bottomTotals = totalRows;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {Array<Array>}
     */
    getBottomTotals: function() {
        return this.hasAggregates() ? this.getDataSource().getGrandTotals() : this.bottomTotals;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param groups
     */
    setGroups: function(groups) {
        this.analytics.setGroupBys(groups);
        this.applyAnalytics();
        this.grid.fireSyntheticGroupsChangedEvent(this.getGroups());
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {object[]}
     */
    getGroups: function() {
        var headers = this.getHeaders().slice(0);
        var fields = this.getFields().slice(0);
        var groupBys = this.analytics.groupBys;
        var groups = [];
        for (var i = 0; i < groupBys.length; i++) {
            var field = headers[groupBys[i]];
            groups.push({
                id: groupBys[i],
                label: field,
                field: fields
            });
        }
        return groups;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {object[]}
     */
    getAvailableGroups: function() {
        var headers = this.source.getHeaders().slice(0);
        var groupBys = this.analytics.groupBys;
        var groups = [];
        for (var i = 0; i < headers.length; i++) {
            if (groupBys.indexOf(i) === -1) {
                var field = headers[i];
                groups.push({
                    id: i,
                    label: field,
                    field: field
                });
            }
        }
        return groups;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {object[]}
     */
    getVisibleColumns: function() {
        var items = this.grid.behavior.columns;
        items = items.filter(function(each) {
            return each.label !== 'Tree';
        });
        return items;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {object[]}
     */
    getHiddenColumns: function() {
        var visible = this.grid.behavior.columns;
        var all = this.grid.behavior.allColumns;
        var hidden = [];
        for (var i = 0; i < all.length; i++) {
            if (visible.indexOf(all[i]) === -1) {
                hidden.push(all[i]);
            }
        }
        hidden.sort(function(a, b) {
            return a.label < b.label;
        });
        return hidden;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param aggregations
     */
    setAggregates: function(aggregations) {
        this.quietlySetAggregates(aggregations);
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param aggregations
     */
    quietlySetAggregates: function(aggregations) {
        this.analytics.setAggregates(aggregations);
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @returns {boolean}
     */
    hasHierarchyColumn: function() {
        var showTree = this.grid['showTreeColumn'] === true;
        return this.hasAggregates() && this.hasGroups() && showTree;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     */
    applyAnalytics: function (dontApplyGroupBysAndAggregations) {
        // [MFS]
        // Ignore fin-hypergrid version of filtering and sorting
        // TODO: use it
        /*
        selectedDataRowsBackingSelectedGridRows.call(this);

        if (!dontApplyGroupBysAndAggregations) {
            applyGroupBysAndAggregations.call(this);
        }
        applyFilters.call(this);
        applySorts.call(this);

        reselectGridRowsBackedBySelectedDataRows.call(this);
        */
    },

    createFormattedFilter: function(formatter, filter) {
        return function(value) {
            var formattedValue = formatter(value);
            return filter(formattedValue);
        };
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} colIndex
     * @param keys
     */
    toggleSort: function (colIndex, keys) {
        // TODO use native fin-hypergird sorting
        // now using mfs-hypergrid
        /*
        this.incrementSortState(colIndex, keys);
        this.applyAnalytics();
        */
        "use strict";
        this.grid.clearSelections();
        const fields = this.getFields();
        if (colIndex >= fields.length) {
            return;
        }
        this.fire('columnHeaderClick', { "columnIndex": colIndex });
    },

    // This function was originally available in polymer,
    // but not difficult to implement anyway.
    // We don't have a DOM element for behavior,
    // but using div.fin-hypergrid should be sufficient.
    // Notice bubbles is by default false.
    fire: function(eventName, eventParameters) {
        this.grid.div.dispatchEvent(new CustomEvent(eventName,
        {
            detail: eventParameters,
            bubbles: true
        }));
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} colIndex
     * @param {string[]} keys
     */
    incrementSortState: function(colIndex, keys) {
        colIndex++; //hack to get around 0 index
        var state = this.getPrivateState();
        var hasCTRL = keys.indexOf('CTRL') > -1;
        state.sorts = state.sorts || [];
        var already = state.sorts.indexOf(colIndex);
        if (already === -1) {
            already = state.sorts.indexOf(-1 * colIndex);
        }
        if (already > -1) {
            if (state.sorts[already] > 0) {
                state.sorts[already] = -1 * state.sorts[already];
            } else {
                state.sorts.splice(already, 1);
            }
        } else if (hasCTRL || state.sorts.length === 0) {
            state.sorts.unshift(colIndex);
        } else {
            state.sorts.length = 0;
            state.sorts.unshift(colIndex);
        }
        if (state.sorts.length > 3) {
            state.sorts.length = 3;
        }
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param index
     * @param returnAsString
     * @returns {*}
     */
    getSortImageForColumn: function (index) {
        return this.grid.behavior.getSortImageForColumn(index);
        /*
        index++;
        var up = true;
        var sorts = this.getPrivateState().sorts;
        if (!sorts) {
            return null;
        }
        var position = sorts.indexOf(index);
        if (position < 0) {
            position = sorts.indexOf(-1 * index);
            up = false;
        }
        if (position < 0) {
            return null;
        }
        var rank = sorts.length - position;
        var arrow = up ? UPWARDS_BLACK_ARROW : DOWNWARDS_BLACK_ARROW;
        return rank + arrow + ' ';
        */
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param cell
     * @param event
     */
    cellClicked: function(cell, event) {
        if (!this.hasAggregates()) {
            return;
        }
        if (event.gridCell.x !== 0) {
            return; // this wasn't a click on the hierarchy column
        }
        var headerRowCount = this.grid.getHeaderRowCount();
        var y = event.gridCell.y - headerRowCount;
        this.getDataSource().click(y);
        this.applyAnalytics(true);
        this.changed();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} y
     * @returns {object}
     */
    getRow: function(y) {
        var headerRowCount = this.grid.getHeaderRowCount();
        if (y < headerRowCount && !this.hasAggregates()) {
            var topTotals = this.getTopTotals();
            return topTotals[y - (headerRowCount - topTotals.length)];
        }
        return this.getDataSource().getRow(y - headerRowCount);
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} y
     * @returns {object}
     */
    buildRow: function(y) {
        var colCount = this.getColumnCount();
        var fields = [].concat(this.getFields());
        var result = {};
        if (this.hasAggregates()) {
            result.tree = this.getValue(-2, y);
            fields.shift();
        }
        for (var i = 0; i < colCount; i++) {
            result[fields[i]] = this.getValue(i, y);
        }
        return result;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {number} y
     * @returns {object}
     */
    getComputedRow: function(y) {
        var rcf = this.getRowContextFunction([y]);
        var fields = this.getFields();
        var row = {};
        for (var i = 0; i < fields.length; i++) {
            var field = fields[i];
            row[field] = rcf(field)[0];
        }
        return row;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {string} fieldName
     * @param {number} y
     * @returns {*}
     */
    getValueByField: function(fieldName, y) {
        var index = this.getFields().indexOf(fieldName);
        if (this.hasAggregates()) {
            y += 1;
        }
        return this.getDataSource().getValue(index, y);
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {sring} string
     */
    setGlobalFilter: function(string) {
        var globalFilterSource = this.getGlobalFilterSource();
        if (!string || string.length === 0) {
            globalFilterSource.clear();
        } else {
            globalFilterSource.set(textMatchFilter(string));
        }
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     * @param {object} config
     * @param {number} x
     * @param {number} y
     * @param {number} untranslatedX
     * @param {number} untranslatedY
     * @returns {object}
     */
    getCellRenderer: function(config, x, y, untranslatedX, untranslatedY) {
        var renderer;
        var provider = this.grid.getCellProvider();

        config.x = x;
        config.y = y;
        config.untranslatedX = untranslatedX;
        config.untranslatedY = untranslatedY;

        renderer = provider.getCell(config);
        renderer.config = config;

        return renderer;
    },

    /**
     * @memberOf dataModels.MFS.prototype
     */
    applyState: function() {
        this.applyAnalytics();
    },

    /**
     * @memberOf dataModels.MFS.prototype
     */
    reset: function(options) {
        this.setData([]);
        this.selectedData = [];

        /**
         * @summary Hash of data source helper APIs.
         * @desc Keyed by data source type. An API is required by data sources with an `api` property.
         * @see {@link dataModels.MFS/updateDataSources}
         * @type {object}
         */
        this.api = {};

        delete this.pipelineSchemaStash; // remove existing "own" version if any

        this.source = new this.DataSourceOrigin(options.data, options.schema, this.grid);

        this.setPipeline();

        //Register Defaults
        this.registerHelperAPI('filter');
        this.registerHelperAPI('sorter');
    },

    /**
     * @summary The default data sources for a new pipeline when none are give.
     * @desc For now Filtering is hardcoded in the grid.
     * In the future, this will likely be empty (unless overridden by application developer for his own purposes).
     * @type {pipelineSchema}
     * @memberOf dataModels.MFS.prototype
     */
    defaultPipelineSchema: [],

    getUnfilteredValue: function(x, y) {
        return this.source.getValue(x, y);
    },

    getUnfilteredRowCount: function() {
        return this.source.getRowCount();
    },

    // [MFS]
    get schema() { return this.source.schema; },

    set schema(schema) {
        this.source.setSchema(schema);
    },

    /**
     * @summary _Getter:_ Return the filter from the data model.
     * @method
     * @returns {dataSourceHelperAPI} The grid's currently assigned filter.
     * @memberOf dataModels.JSON.prototype
     */
    get filter() {
        return this.api.filter;
    },

    /**
     * @summary _Setter:_ Assign a filter to the data model.
     * @method
     * @param {dataSourceHelperAPI|undefined|null} filter - One of:
     * * A filter object - Turns the filter *ON*.
     * * `undefined` or `null` - Turns the filter *OFF.*
     * @memberOf dataModels.JSON.prototype
     */
    set filter(filter) {
        this.registerHelperAPI('filter', filter);
    },

    /**
     * @summary _Getter_
     * @method
     * @returns {sorterAPI} The grid's currently assigned sorter.
     * @memberOf dataModels.JSON.prototype
     */
    get sorter() {
        return this.api.sorter;
    },

    /**
     * @summary _Setter:_ Assign a sorter to the grid.
     * @method
     * @param {sorterAPI|undefined|null} sorter - One of:
     * * A sorter object, turning sorting *ON*.
     * * If `undefined` or `null`, the {@link dataModels.JSON~nullSorter|nullSorter} is reassigned to the grid, turning sorting *OFF.*
     * @memberOf dataModels.JSON.prototype
     */
    set sorter(sorter) {
        this.registerHelperAPI('sorter', sorter);
    },

    /**
     * @summary Register the data source helper API.
     * @desc The API is immediately applied to all data sources in the pipeline of the given type; and reassigned later whenever the pipeline is reset.
     * @param {string} dataSourceType
     * @param {dataSourceHelperAPI|undefined|null} helper - One of:
     * * A filter object - Turns the data source *ON*.
     * * `undefined` or `null` - Turns the data source *OFF.*
     * * A helper API. Turns the data source *ON*.
     */
    registerHelperAPI: function(dataSourceType, helper) {
        this.api[dataSourceType] = helper = helper || nullDataSourceHelperAPI;

        if (typeof helper.properties === 'function' && helper.properties.length === 1) {
            helper.prop = propPrep.bind(helper, this);
        }

        if (this.updateDataSources(dataSourceType)) {
            this.reindex();
        }
    },

    isDrillDown: function (event) {
        return false;
    },
});

function valueOrFunctionExecute(valueOrFunction) {
    return typeof valueOrFunction === 'function' ? valueOrFunction() : valueOrFunction;
}

function textMatchFilter(string) {
    string = string.toLowerCase();
    return function(each) {
        each = valueOrFunctionExecute(each);
        return (each + '').toLowerCase().indexOf(string) > -1;
    };
}

// LOCAL METHODS -- to be called with `.call(this`

/**
 * Accumulate actual data row objects backing current grid row selections.
 * This call should be paired with a subsequent call to `reselectGridRowsBackedBySelectedDataRows`.
 * @private
 * @memberOf dataModels.MFS.prototype
 */
function selectedDataRowsBackingSelectedGridRows() {
    var selectedData = this.selectedData,
        hasRowSelections = this.grid.selectionModel.hasRowSelections(),
        needFilteredDataList = selectedData.length || hasRowSelections;

    if (needFilteredDataList) {
        var filteredData = this.getFilteredData();
    }

    // STEP 1: Remove any filtered data rows from the recently selected list.
    selectedData.forEach(function(dataRow, index) {
        if (filteredData.indexOf(dataRow) >= 0) {
            delete selectedData[index];
        }
    });

    // STEP 2: Accumulate the data rows backing any currently selected grid rows in `this.selectedData`.
    if (hasRowSelections) { // any current grid row selections?
        this.grid.getSelectedRows().forEach(function(selectedRowIndex) {
            var dataRow = filteredData[selectedRowIndex];
            if (selectedData.indexOf(dataRow) < 0) {
                selectedData.push(dataRow);
            }
        });
    }
}

/**
 * Re-establish grid row selections based on actual data row objects accumulated by `selectedDataRowsBackingSelectedGridRows` which should be called first.
 * @private
 * @memberOf dataModels.MFS.prototype
 */
function reselectGridRowsBackedBySelectedDataRows() {
    if (this.selectedData.length) { // any data row objects added from previous grid row selections?
        var selectionModel = this.grid.selectionModel,
            offset = this.grid.getHeaderRowCount(),
            filteredData = this.getFilteredData();

        selectionModel.clearRowSelection();

        this.selectedData.forEach(function(dataRow) {
            var index = filteredData.indexOf(dataRow);
            if (index >= 0) {
                selectionModel.selectRow(offset + index);
            }
        });
    }
}

/**
 * @private
 * @memberOf dataModels.MFS.prototype
 */
function applyGroupBysAndAggregations() {
    if (this.analytics.aggregates.length === 0) {
        this.quietlySetAggregates({});
    }
    this.analytics.apply();
}

/**
 * @private
 * @memberOf dataModels.MFS.prototype
 */
function applyFilters() {
    var visibleColumns = this.getVisibleColumns();
    this.getGlobalFilterSource().apply(visibleColumns);
    var details = [];
    var filterSource = this.getFilterSource();
    var groupOffset = 0; //this.hasHierarchyColumn() ? 0 : 1;

    // apply column filters
    filterSource.clearAll();

    visibleColumns.forEach(function(column) {
        var columnIndex = column.index,
            filterText = this.getFilter(columnIndex),
            formatterType = column.properties.format,
            formatter = this.grid.getFormatter(formatterType),
            complexFilter = this.getComplexFilter(columnIndex),
            filter = complexFilter || filterText.length > 0 && textMatchFilter(filterText);

        if (filter) {
            filterSource.add(columnIndex - groupOffset, this.createFormattedFilter(formatter, filter));
            details.push({
                column: column.label,
                format: complexFilter ? 'complex' : formatterType
            });
        }
    }.bind(this));

    filterSource.applyAll();

    this.grid.fireSyntheticFilterAppliedEvent({
        details: details
    });
}

/**
 * @private
 * @memberOf dataModels.MFS.prototype
 */
function applySorts() {
    var sortingSource = this.getSortingSource();
    var sorts = this.getPrivateState().sorts;
    var groupOffset = this.hasAggregates() ? 1 : 0;
    if (!sorts || sorts.length === 0) {
        sortingSource.clearSorts();
    } else {
        for (var i = 0; i < sorts.length; i++) {
            var colIndex = Math.abs(sorts[i]) - 1;
            var type = sorts[i] < 0 ? -1 : 1;
            sortingSource.sortOn(colIndex - groupOffset, type);
        }
    }
    sortingSource.applySorts();
}

/**
 * @inner
 * @summary Digests `(columnIndex, propName, value)` and calls `properties`.
 * @desc Digests the three parameters `(columnIndex, propName, value)` detailed below, creating a single object with which it then calls the helper API `properties` method.
 *
 * A helper API `properties` method:
 * * Supports two types of actions:
 *   * **Getter** call where you supply just the property name. The method gets the property value from the API and returns it.
 *   * **Setter** call where you supply a value along with the property name; or you supply a hash of property name/value pairs. The method sets the property on the API and returns nothing. All values are valid with the exception of `undefined` which deletes the property of the given name rather than setting it to `undefined`.
 * * Supports two types of properties:
 *   * **Global properties** affect the API globally.
 *   * **Column properties** pertain to specific columns.
 *
 * This method is overloaded. The way it is called as explained in the Parameters section below determines both the type of action (getter, setter) and the kind of property (global, column).
 *
 * Note: Not all API properties are dynamic; some are static and updating them later will have no effect.
 *
 * @this {dataSourceHelperAPI}
 *
 * @param {DataSourceBase} dataModel - The data model. This parameter is bound to the call by {@link dataModels.JSON#setHelperAPI|setHelperAPI}.
 *
 * @param {number} [columnIndex] - If given, this is a property on a specific column. If omitted, this is a property on the whole API properties object.
 *
 * @param {string|object} property - _If `columnIndex` is omitted, this arg takes its place._
 *
 * One of these types:
 * * **string** - Property name. The name of the explicit property to either get or (if `value` also given) set on the properties object.
 * * **object** - Hash of properties to set on the properties object.
 *
 * @param [value] - _If `columnIndex` is omitted, this arg takes its place._
 *
 * One of:
 * * Omitted (when `property` is a string), this is the "getter" action: Return the value from the properties object of the key in `property`.
 * * When `property` is a string and `value` is given, this is the "setter" action: Copy this value to properties object using the key in `property`.
 * * When `property` is a hash and `value` is given: Unexpected; throws an error.
 *
 * @returns {propObject}
 */
function propPrep(dataModel, columnIndex, propName, value) {
    var invalid,
        properties = {},
        argCount = arguments.length;

    if (typeof columnIndex === 'number') {
        argCount--;
    } else {
        value = propName;
        propName = columnIndex;
        columnIndex = undefined;
    }

    switch (argCount) {

        case 2: // getter propName name or setter hash
            if (typeof propName === 'object') {
                properties = propName;
            } else {
                properties.getPropName = propName;
            }
            break;

        case 3: // setter for value
            if (typeof propName !== 'string') {
                invalid = true;
            } else {
                properties[propName] = value;
            }
            break;

        default: // too few or too many args
            invalid = true;

    }

    if (invalid) {
        throw 'Invalid overload.';
    }

    if (columnIndex !== undefined) {
        // non-enumerable propName:
        Object.defineProperty(properties, 'column', {
            value: {
                index: columnIndex,
                name: dataModel.source.schema[columnIndex].name
            }
        });
    }

    return this.properties(properties);
}

module.exports = MFS;
