'use strict';

/**
     * Binary Search
     * Performs a binary search on the host array. This method can either be
     * injected into Array.prototype or called with a specified scope like this:
     * binaryIndexOf.call(someArray, searchElement, comparator);
     *
     * @param {object}   searchElement The element to be searched
     * @param {function} comparator A function that takes 2 parameters A and B 
     *                   to do comparison. If A < B, returns -1; if A > B, returns 1;
     *                   if A = B, return 0.
     */
function binaryIndexOf(searchElement, comparator) {
    "use strict";
    var minIndex = 0;
    /*jshint validthis:true */
    var maxIndex = this.length - 1;
    var currentIndex;
    var currentElement;

    if (comparator) {
        while (minIndex <= maxIndex) {
            currentIndex = (minIndex + maxIndex) / 2 | 0;
            currentElement = this[currentIndex];

            var comparison = comparator(currentElement, searchElement);

            if (comparison === -1) {
                minIndex = currentIndex + 1;
            } else if (comparison === 1) {
                maxIndex = currentIndex - 1;
            } else {
                return currentIndex;
            }
        }
    } else {
        while (minIndex <= maxIndex) {
            currentIndex = (minIndex + maxIndex) / 2 | 0;
            currentElement = this[currentIndex];

            if (currentElement < searchElement) {
                minIndex = currentIndex + 1;
            } else if (currentElement > searchElement) {
                maxIndex = currentIndex - 1;
            } else {
                return currentIndex;
            }
        }
    }

    return -1;
}

// ReSharper disable once InconsistentNaming
// Using ArrayHelper other than comtaminate Array namespace
var ArrayHelper = {};
ArrayHelper.binaryIndexOf = function (someArray, searchElement, comparator) {
    return binaryIndexOf.call(someArray, searchElement, comparator);
};

/**
     * Creates a ExpandedItemsManager. This is a manager under tableState to manage multi-level expand/collapse behaivor.
     * @class
     */
var ExpandedItemsManager = function (behavior) {
    "use strict";

    this.expandedItems = {};

    this.$cacheExpandedItemsIndex = [];

    this.$sectionRanges = [0, 0];

    this._behavior = behavior;

    this.getBehavior = function () {
        return this._behavior;
    }
};
/**
 * Initialize an ExpandedItemsManager (mainly exapndedItems and $cacheExpandedItemsIndex
 * @method init
 * @return {object} Return Nothing
 * @param {number} dataLength Number of data items.
 * @param {number} newDataLength Number of new data items.
 */
ExpandedItemsManager.prototype.init = function (dataLength, newDataLength) {
    "use strict";
    // There should be no expanded Items, 
    this.expandedItems = {};

    var leafSubItemsIndicator = !!this.getBehavior().getLeafSubItemsProperty();

    // and the $cacheExpandedItemsIndex should be strictly 1-to-1 mapping to data items
    var tempArray = [];
    for (var i = 0; i < dataLength ; i++) {
        var returnTuple = [0, i];
        while (returnTuple.length < 1 + this.getBehavior().getMultiLevels() + (leafSubItemsIndicator ? 1 : 0)) {
            returnTuple.push(null);
        }
        tempArray.push(returnTuple);
    }
    for (var j = 0; j < newDataLength ; j++) {
        var newReturnTuple = [1, j];
        while (newReturnTuple.length < 1 + this.getBehavior().getMultiLevels() + (leafSubItemsIndicator ? 1 : 0)) {
            newReturnTuple.push(null);
        }
        tempArray.push(newReturnTuple);
    }
    this.$cacheExpandedItemsIndex = tempArray;
    this.$sectionRanges = [dataLength, dataLength + newDataLength];
};
/**
 * Add an expandedItem record. Sometimes this may have implication to parent or children records, if applicable.
 * parentIds is an array of Ids serves as pointers to the parent expandedItems.
 * childrenIds is an array of Ids serves as pointers to the childre expandedItems.
 * tuple is a data index tuple.
 * deleteCount marks how many records need to delete if collapsed.
 * collapsed means if current row is collapsed.
 *
 * @method addExpandedItem
 * @return {object} Return Nothing
 * @param {string} unique id of the row
 * @param {parentIds} unique ids of parents of the data item
 * @param {tuple} The tuple of the data item
 * @param {visible} if the data item should be visible.
 */
ExpandedItemsManager.prototype.addExpandedItem = function (id, parentIds, tuple, isCollapsed, isVisible) {
    "use strict";
    var subItemsCount;
    var currentLevel;
    var self = this;
    var alreadyExists = this.expandedItems.hasOwnProperty(id);
    var alreadyExistsAndCollapsed = alreadyExists && this.expandedItems[id].collapsed;
    var alreadyExistsAndNotCollapsed = alreadyExists && !this.expandedItems[id].collapsed;
    var visible = (isVisible && !isCollapsed) || alreadyExistsAndNotCollapsed;

    if (alreadyExists) {
        parentIds = this.expandedItems[id].parentIds;
        tuple = this.expandedItems[id].tuple;
        subItemsCount = this.getBehavior().getSubItemCount(tuple);
        this.expandedItems[id].collapsed = !visible;
        this.expandedItems[id].deleteCount = visible ? subItemsCount : 0;
    } else {
        subItemsCount = this.getBehavior().getSubItemCount(tuple);
        this.expandedItems[id] = {
            "parentIds": parentIds,
            "childrenIds": [],
            "tuple": tuple,
            "deleteCount": visible ? subItemsCount : 0,
            "collapsed": isCollapsed || false
        };
    }

    // if deleteCount is more than 0, will need to update all parents as well
    if (visible) {
        parentIds.forEach(function (pid) {
            if (self.expandedItems.hasOwnProperty(pid)) {
                self.expandedItems[pid].deleteCount += subItemsCount;
                if (self.expandedItems[pid].childrenIds.indexOf(id) === -1) {
                    self.expandedItems[pid].childrenIds.push(id);
                }
            }
        });

        // Update Cache
        var index = ArrayHelper.binaryIndexOf(this.$cacheExpandedItemsIndex, tuple, ExpandedItemsManager.DFSComparator);
        if (index === -1) {
            throw "Error: cannot find in cacheEpandedItemsIndex";
        } else {
            // Splice new items in
            var tempArray = [];
            for (var i = 0; i < subItemsCount; i++) {
                var subItemTuple = tuple.slice();
                currentLevel = this.getBehavior().getDataItemLevel(subItemTuple);
                subItemTuple[1 + currentLevel + 1] = i; //// First element is to determine whether it is data or new data
                tempArray.push(subItemTuple);
            }
            if (tempArray.length > 0) {
                Array.prototype.splice.apply(this.$cacheExpandedItemsIndex, [index + 1, 0].concat(tempArray));
                if (tuple[0] === 0) {
                    this.$sectionRanges[0] += subItemsCount;
                    this.$sectionRanges[1] += subItemsCount;
                } else if (tuple[0] === 1) {
                    this.$sectionRanges[1] += subItemsCount;
                }
            }

        }
    }

    if (alreadyExists && visible) {
        currentLevel = this.getBehavior().getDataItemLevel(this.expandedItems[id].tuple);
        var idTuplePairs = this.expandedItems[id].childrenIds.map(function (cid) {
            return { "id": cid, "tuple": self.expandedItems[cid].tuple };
        }).filter(function (pair) {
            return self.getBehavior().getDataItemLevel(pair.tuple) === currentLevel + 1;
        });
        idTuplePairs.forEach(function (pair) {
            self.addExpandedItem(pair.id, null, null, null, null);
        });
    }

};

ExpandedItemsManager.prototype.removeExpandedItem = function (id, tuple) {
    "use strict";
    // Remove it
    var expandedItemInfo = this.expandedItems[id];
    var self = this;

    if (expandedItemInfo.deleteCount > 0) {
        // if deleteCount is more than 0, will need to update all parents as well
        expandedItemInfo.parentIds.forEach(function (pid) {
            if (self.expandedItems.hasOwnProperty(pid)) {
                self.expandedItems[pid].deleteCount -= expandedItemInfo.deleteCount;
                var arrIndex = self.expandedItems[pid].childrenIds.indexOf(id);
                if (arrIndex > -1) {
                    self.expandedItems[pid].childrenIds.splice(arrIndex, 1);
                }
            }
        });
        // Children will have count 0
        expandedItemInfo.childrenIds.forEach(function (cid) {
            if (self.expandedItems.hasOwnProperty(cid)) {
                self.expandedItems[cid].deleteCount = 0;
            }
        });
    }
    // Update Cache
    var index = ArrayHelper.binaryIndexOf(this.$cacheExpandedItemsIndex, tuple, ExpandedItemsManager.DFSComparator);
    if (index === -1) {
        throw "Error: cannot find in cacheEpandedItemsIndex";
    } else {
        // Splice new items out
        this.$cacheExpandedItemsIndex.splice(index + 1, expandedItemInfo.deleteCount);
        if (tuple[0] === 0) {
            this.$sectionRanges[0] -= expandedItemInfo.deleteCount;
            this.$sectionRanges[1] -= expandedItemInfo.deleteCount;
        } else if (tuple[0] === 1) {
            this.$sectionRanges[1] -= expandedItemInfo.deleteCount;
        }

    }

    this.expandedItems[id].collapsed = true;
    this.expandedItems[id].deleteCount = 0;
};

ExpandedItemsManager.prototype.getRowIndexByTuple = function (tuple) {
    return ArrayHelper.binaryIndexOf(this.$cacheExpandedItemsIndex, tuple, ExpandedItemsManager.DFSComparator);
};

ExpandedItemsManager.prototype.updateExpandedItems = function (data, newData) {
    "use strict";
    var self = this;
    var i;
    var expandedItemsBackup = JSON.parse(JSON.stringify(this.expandedItems));

    // Initialize ExpandedItems and $cacheExpandedItemsIndex
    this.init(data.length, newData ? newData.length : 0);

    //Add ExpandedItem One by One, using BFS
    // Shallow copy a queue
    var queue = [];
    for (i = 0; i < data.length; i++) {
        var returnTuple = [0, i];
        while (returnTuple.length - 1 < (this.getBehavior().getMultiLevels() + (this.getBehavior().getLeafSubItemsProperty() ? 1 : 0))) {
            returnTuple.push(null);
        }
        queue.push({
            "dataItem": data[i],
            "parentIds": [],
            "tuple": returnTuple
        });
    }
    for (i = 0; i < newData.length; i++) {
        var newReturnTuple = [1, i];
        while (newReturnTuple.length - 1 < (this.getBehavior().getMultiLevels() + (this.getBehavior().getLeafSubItemsProperty() ? 1 : 0))) {
            newReturnTuple.push(null);
        }
        queue.push({
            "dataItem": newData[i],
            "parentIds": [],
            "tuple": newReturnTuple
        });
    }
    while (queue.length > 0) {
        var queueItem = queue.shift();
        var id = this.getBehavior().getIdByItem(queueItem.dataItem, this.getBehavior().getDataItemLevel(queueItem.tuple));
        // Does it exist in ExpandedItems Backup ?
        if (expandedItemsBackup.hasOwnProperty(id)) {
            // If it is, it is required to add into ExpandedItems. However, this may or may not impact $cacheExpandedItemsIndex, depending on visibility:
            var visible = queueItem.parentIds.every(function (pid) {
                return self.expandedItems.hasOwnProperty(pid);
            });
            this.addExpandedItem(id, queueItem.parentIds, queueItem.tuple, expandedItemsBackup[id].collapsed, visible);
        }
        //enqueue children
        if (queueItem.dataItem[this.getBehavior().getSubItemsProperty()] && queueItem.dataItem[this.getBehavior().getSubItemsProperty()].length) {
            var collection = queueItem.dataItem[this.getBehavior().getSubItemsProperty()];
            for (i = 0; i < collection.length; i++) {
                var tuple = queueItem.tuple.slice();
                tuple[1 + this.getBehavior().getDataItemLevel(tuple) + 1] = i;
                queue.push({
                    "dataItem": collection[i],
                    "parentIds": queueItem.parentIds.concat([id]),
                    "tuple": tuple
                });
            }
        }

    }
};
/**
 * Restore a section to unexpanded status
 * 
 * @param {} sectionId 
 * @returns {} 
 */
ExpandedItemsManager.prototype.restoreSection = function (sectionId) {
    var self = this;
    if (sectionId !== 1) {
        throw "Not Implemented";
    }
    var leafSubItemsIndicator = !!this.getBehavior().getLeafSubItemsProperty();
    var keys = Object.keys(this.expandedItems);
    keys.filter(function (key) {
        return self.expandedItems.hasOwnProperty(key) && self.expandedItems[key].tuple && self.expandedItems[key].tuple[0] === 1;
    }).forEach(function (key) {
        delete self.expandedItems[key];
    });
    var beginIndex = sectionId === 0 ? 0 : this.$sectionRanges[sectionId - 1];
    var endIndex = this.$sectionRanges[sectionId];
    this.$cacheExpandedItemsIndex.splice(beginIndex, endIndex - beginIndex);
    var newDataLength = this.getBehavior().getNewData().length;
    var tempArray = [];
    for (var j = 0; j < newDataLength; j++) {
        var newReturnTuple = [1, j];
        while (newReturnTuple.length < 1 + this.getBehavior().getMultiLevels() + (leafSubItemsIndicator ? 1 : 0)) {
            newReturnTuple.push(null);
        }
        tempArray.push(newReturnTuple);
    }
    this.$sectionRanges[sectionId] = beginIndex + newDataLength;
    this.$cacheExpandedItemsIndex = this.$cacheExpandedItemsIndex.concat(tempArray);
};
/**
 * Translate row index into the corresponding data index (and sub data index)
 * If this is the main row, sub data index would be null.
 *
 * @method getDataIndexTupleByRowIndex
 * @return {number[]} Returns an array of integers of indexes
 * @param {number} rowY The row index.
 */
ExpandedItemsManager.prototype.getDataIndexTupleByRowIndex = function (rowY) {
    "use strict";
    return this.$cacheExpandedItemsIndex[rowY];
};
/**
 * A predicate that returns if the row corresponding to the row index is expanded.
 * An expanded data item will have its id registered in table state under expandedItems.
 *
 * @method isDataItemOpenByItemId
 * @return {Boolean} Return true if it is expanded, otherwise return false.
 * @param {number} rowY The row index.
 */
ExpandedItemsManager.prototype.isDataItemOpenByItemId = function (itemId) {
    "use strict";
    return this.expandedItems.hasOwnProperty(itemId) && this.expandedItems[itemId].collapsed === false;
};

// [MFS] $cacheExpandedItemsIndex Comparator
ExpandedItemsManager.DFSComparator = function (a, b) {
    "use strict";
    if (a.length !== b.length) {
        throw 'tuples do not have equal level!';
    }
    var level = a.length;
    var currentLevel = 0;
    while (currentLevel < level) {
        if (currentLevel !== 0) {
            if (a[currentLevel] === null && b[currentLevel] === null) {
                return 0;
            } else if (a[currentLevel] === null) {
                return -1;
            } else if (b[currentLevel] === null) {
                return 1;
            }
        }
        if (a[currentLevel] < b[currentLevel]) {
            return -1;
        } else if (a[currentLevel] > b[currentLevel]) {
            return 1;
        }
        currentLevel++;
    }
    return 0;
};

ExpandedItemsManager.BFSComparator = function (a, b) {
    "use strict";
    if (a.length !== b.length) {
        throw "tuples do not have equal level!";
    }
    var levelA = a.length - 1;
    var levelB = b.length - 1;
    while (a[levelA] === null) {
        levelA--;
    }
    while (B[levelB] === null) {
        levelB--;
    }
    if (levelA < levelB) {
        return -1;
    } else if (levelA > levelB) {
        return 1;
    } else {
        return ExpandedItemsManager.DFSComparator(a, b);
    }
};

module.exports = ExpandedItemsManager;
