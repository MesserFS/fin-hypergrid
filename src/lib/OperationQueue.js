'use strict';

module.exports = (() => {

    class OperationQueue {
        constructor() {
            this.lastPromise = new Promise((resolve, reject) => {
                console.log("p1");
                window.setTimeout(() => {
                    resolve(null);
                }, 0);
            });
        }

        addPromiseFunction(fn) {
            // Cannot use arrow function in roder to 
            this.lastPromise = this.lastPromise.then(fn);
            return this.lastPromise;
        }
    }

    return OperationQueue;

})();
