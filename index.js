/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2024-2026 Toha <tohenk@yahoo.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const _ = require('./translator');

/**
 * @callback ControllerCallback
 * @param {express.Application} app Express application
 * @returns {void}
 */

/**
 * A callback to handle pre-route execution.
 *
 * Example:
 *
 * ```
 * function preRouteCallback(req, res, next, route)) {
 *     // do something
 * }
 * ```
 *
 * @callback PreRouteCallback
 * @param {express.Request} req Request object
 * @param {express.Response} res Response object
 * @param {express.NextFunction} next Next callback
 * @param {string} route Route name
 * @returns {void}
 */

/**
 * A callback called when a controller is found.
 *
 * Example:
 *
 * ```
 * const app = express();
 * function scanCallback(controller, name)) {
 *     controller(app);
 * }
 * ```
 *
 * @callback ScanCallback
 * @param {ControllerCallback} controller Controller factory
 * @param {string} name Route name
 * @returns {void}
 */

/**
 * @typedef {Object} ControllerRoute
 * @property {string[]|string} method Request methods
 * @property {string} path Relative path to root
 * @property {express.RequestParamHandler} handler Route handler
 */

/**
 * @typedef {Object} ControllerOptions
 * @property {string} name Controller name
 * @property {string} prefix Path prefix
 * @property {express.Application} app Express app
 * @property {{[key: string]: ControllerRoute}} routes Routes
 * @property {PreRouteCallback} preRoute Pre route callback
 */

/**
 * A controller for Expressjs app.
 *
 * @author Toha <tohenk@yahoo.com>
 */
class Controller {

    /** @type {{[key: string]: ControllerRoute}} */
    routes = {}
    /** @type {Controller[]} */
    parents = []

    /**
     * Constructor.
     *
     * @param {ControllerOptions} options Options
     */
    constructor(options) {
        /** @type {ControllerOptions} */
        this.options = options || {};
        /** @type {string} */
        this.prefix = options.prefix;
        if (options.app) {
            /** @type {express.Application} */
            this.app = options.app;
        }
        /** @type {express.Router} */
        this.router = express.Router();
        /** @type {Controller} */
        this.parent;
        /** @type {string|number} */
        this.pid;
        this.initialize();
    }

    initialize() {
        if (this.options.name) {
            Controller.set(this.options.name, this);
        }
        this.buildRoutes();
        this.addRoutes(this.options.routes || {});
        this.registerRoutes();
    }

    /**
     * Add a parent to controller.
     *
     * @param {Controller} parent The parent
     * @returns {Controller}
     */
    addParent(parent) {
        if (!this.parents.includes(parent)) {
            this.parents.push(parent);
        }
        return this;
    }

    /**
     * Get controller mount paths.
     *
     * @returns {string[]|undefined}
     */
    getMountPath() {
        const result = [];
        this.parents.forEach(p => {
            if (p.prefix) {
                result.push(`${p.prefix}/:parent/${this.prefix.substr(0, 1) === '/' ? this.prefix.substr(1) : this.prefix}`);
            }
        });
        if (result.length) {
            return result;
        }
    }

    /**
     * Scan for sub controller in the directory.
     *
     * @param {string} dir Sub controller directory 
     */
    scanSubController(dir) {
        Controller.scan(dir, controller => {
            if (this.app) {
                const instance = controller(this.app);
                instance.addParent(this);
                if (!Controller.subControllers.includes(instance)) {
                    Controller.subControllers.push(instance);
                }
            }
        });
    }

    /**
     * Build routes.
     */
    buildRoutes() {
    }

    /**
     * Generate route.
     *
     * @param {string} name Route name
     * @param {object} params Route parameters
     * @returns {string}
     */
    genRoute(name, params = {}) {
        const prefix = (this.parent ? `${this.parent.prefix}/${this.parent.pid}` : '') + this.prefix;
        let path = (prefix.substr(-1) === '/' ? prefix.substr(0, prefix.length - 1) : prefix) + this.getRoutePath(name);
        const args = [];
        Object.keys(params).forEach(p => {
            const re = new RegExp(':' + p);
            const matched = path.match(re);
            if (matched) {
                path = path.replace(re, params[p]);
            } else {
                args.push(p);
            }
        });
        args.forEach(p => {
            path += (path.indexOf('?') < 0 ? '?' : '&') + p + '=' + params[p];
        });
        return path;
    }

    /**
     * Get route path.
     *
     * @param {string} name Route name
     * @returns {string|undefined}
     */
    getRoutePath(name) {
        if (this.routes[name] && this.routes[name].path) {
            return this.routes[name].path;
        }
    }

    /**
     * Add a route.
     *
     * @param {string} name Route name
     * @param {string|string[]} method Route methods
     * @param {string} path Route path 
     * @param {express.RequestParamHandler} handler Route handler
     */
    addRoute(name, method, path, handler) {
        this.routes[name] = {method, path, handler};
    }

    /**
     * Add routes.
     *
     * @param {{[key: string]: ControllerRoute}} routes Routes collection
     */
    addRoutes(routes) {
        Object.keys(routes).forEach(route => {
            const data = routes[route];
            if (data.method && data.path && typeof data.handler === 'function') {
                this.addRoute(route, data.method, data.path, data.handler);
            }
        });
    }

    /**
     * Register routes in express router.
     */
    registerRoutes() {
        Object.keys(this.routes).forEach(route => {
            const data = this.routes[route];
            const methods = Array.isArray(data.method) ? data.method : [data.method];
            methods.forEach(method => {
                this.router[method.toLowerCase()](data.path, async (req, res, next) => {
                    req.app.set('response', res);
                    if (typeof this.options.preRoute === 'function') {
                        await this.options.preRoute(req, res, next, route);
                    }
                    await data.handler(req, res, next);
                });
            });
        });
    }

    /**
     * Get controller.
     *
     * @param {string} name Controller name
     * @returns {Controller}
     */
    getController(name) {
        return Controller.get(name);
    }

    /**
     * Render a view.
     *
     * @param {string} view View name
     * @param {object} options Options
     * @returns {string}
     */
    renderView(view, options = {}) {
        if (!this.app) {
            throw new Error('To render a view, the app must already be set!');
        }
        let res;
        const response = this.app.get('response');
        // allows to render view synchronously
        const expressView = this.app.get('view');
        if (expressView.prototype.oldrender === undefined) {
            expressView.prototype.oldrender = expressView.prototype.render;
            expressView.prototype.renderSync = function(options, callback) {
                this.engine(this.path, options, callback);
            }
            expressView.prototype.render = function(options, callback) {
                if (!this.syncrender) {
                    this.oldrender(options, callback);
                } else {
                    this.renderSync(options, callback);
                }
            }
        }
        expressView.prototype.syncrender = true;
        try {
            response._render(view, options, (err, html) => {
                res = err ? err : html;
            });
        }
        catch (e) {
            console.error(e);
        }
        expressView.prototype.syncrender = false;
        return res;
    }

    /**
     * Translate a message.
     *
     * @param {string} message The message
     * @param {object} params The variables
     * @returns {string}
     */
    _(message, params = {}) {
        return _(message, params);
    }

    /**
     * Get controller.
     *
     * @param {string} name Controller name
     * @returns {Controller}
     */
    static get(name) {
        if (name instanceof Object) {
            name = name.name ? name.name : name.constructor.name;
        }
        return Controller.controllers[name];
    }

    /**
     * Set controller.
     *
     * @param {string} name Controller name
     * @param {Controller} controller Controller instance
     */
    static set(name, controller) {
        if (name === undefined) {
            throw new Error(`Controller name must be defined!`);
        }
        if (name instanceof Object) {
            name = name.name ? name.name : name.constructor.name;
        }
        if (!controller instanceof this) {
            throw new Error(`Controller ${name} must be a class of Controller!`);
        }
        Controller.controllers[name] = controller;
    }

    /**
     * Get all controllers.
     *
     * @returns {{[key: string]: Controller}}
     */
    static get controllers() {
        if (Controller._controllers === undefined) {
            Controller._controllers = {};
        }
        return Controller._controllers;
    }

    static setCategoryPriority(category, priority) {
        if (Controller.priorities === undefined) {
            Controller.priorities = {};
        }
        Controller.priorities[category] = priority;
        return Controller;
    }

    static addShortcut(data) {
        Controller.shortcuts.push(data);
        return Controller;
    }

    static getShortcuts(categories = {}) {
        const result = [];
        const defaultPriority = 50;
        Controller.shortcuts.forEach(shortcut => {
            if (shortcut.category) {
                const title = categories[shortcut.category] ?  categories[shortcut.category] :
                    shortcut.category.substr(0, 1).toUpperCase() + shortcut.category.substr(1);
                let idx = -1;
                for (let i = 0; i < result.length; i++) {
                    if (result[i].title === title) {
                        idx = i;
                        break;
                    }
                }
                if (idx < 0) {
                    const categoryPriority = Controller.priorities && Controller.priorities[shortcut.category] ? Controller.priorities[shortcut.category] : defaultPriority;
                    const s = {title: title, icon: 'bi-' + shortcut.category, priority: categoryPriority, items: []};
                    result.push(s);
                    idx = result.length - 1;
                }
                result[idx].items.push(shortcut);
            } else {
                result.push(Object.assign({}, {priority: defaultPriority}, shortcut));
            }
        });
        const sorter = (a, b) => {
            if (a.priority !== undefined && b.priority !== undefined) {
                return a.priority - b.priority;
            } else if (a.priority !== undefined && b.priority === undefined) {
                return 1;
            } else if (a.priority === undefined && b.priority !== undefined) {
                return -1;
            } else {
                return 0;
            }
        }
        for (let i = 0; i < result.length; i++) {
            if (result[i].items) {
                result[i].items.sort(sorter);
            }
        }
        result.sort(sorter);
        return result;
    }

    static get shortcuts() {
        if (Controller._shortcuts === undefined) {
            Controller._shortcuts = [];
        }
        return Controller._shortcuts;
    }

    /**
     * Scan for controller in directory.
     *
     * @param {string} dir Controller directory
     * @param {ScanCallback} callback Callback
     */
    static scan(dir, callback) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            if (file.endsWith('.js')) {
                const controller = file.substring(0, file.length - 3);
                callback(require(path.join(dir, controller)), controller);
            }
        });
    }

    /**
     * Get sub controllers.
     *
     * @returns {Controller[]}
     */
    static get subControllers() {
        if (Controller._subcontrollers === undefined) {
            Controller._subcontrollers = [];
        }
        return Controller._subcontrollers;
    }
}

module.exports = Controller;