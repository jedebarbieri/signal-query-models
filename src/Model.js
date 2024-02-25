import { QueryClient } from '@tanstack/react-query';
import ApiService from '../Services/ApiService';
import { Signal, signal } from '@preact/signals-react';

/**
 * Class to represent the data of any entity in the application.
 * It auto generates the getters and setters for the attributes of the entity.
 * 
 * @property {Object} attributesConfig This is the configuration of the attributes of the entity
 * @property {Model} model This is the reference of the Model that owns this DataModel
 */
class DataModel {

    static PROPERTY_PREFIX = '_prop_';

    attributesConfig = {};

    model = null;

    static VALIDATE_DATE_TYPE = function(value) {
        if (value instanceof Date) {
            return value;
        } else if (typeof value === 'string') {
            return new Date(value);
        } else {
            throw new Error("Invalid type for updatedAt");
        }
    }

    constructor(attributesConfig, modelReference) {
        if (!modelReference) throw new Error('modelReference is required');
        this.model = modelReference;

        this.attributesConfig = { ...attributesConfig };

        for (const attribute in this.attributesConfig) {

            const propName = this.constructor.PROPERTY_PREFIX + attribute;
            
            this[propName] = signal(null);

            const config = this.attributesConfig[attribute];
            const hasCustomGetter = config && typeof config.get === 'function';
            const hasCustomSetter = config && typeof config.set === 'function';

            const getterAndSetter = {
                get: hasCustomGetter ? config.get : () => {
                    return this[propName].value;
                },
                set: hasCustomSetter ? config.set : (value) => {
                    this[propName].value = value;
                }
            };

            // Special case for the 'id' attribute
            if (attribute === 'id') {
                getterAndSetter.set = (value) => {
                    // It is not possible to direclty set the ID of an entity when it is already setted
                    if (this._prop_id?.value) return;
                    this._prop_id.value =  parseInt(value);
                }
            }

            Object.defineProperty(this, attribute, getterAndSetter);

        }
    }

    /**
     * This function updates the data of the entity with the data passed as parameter
     */
    update = (data) => {
        for (const attribute in data) {
            if (attribute in this) {
                this[attribute] = data[attribute];
            }
        }
    }

    /**
     * This function returns the data of the entity in object format
     */
    getObject = () => {
        const object = {};
        for (const attribute in this.attributesConfig) {
            object[attribute] = this[attribute];
        }
        return object;
    }

    /**
     * Returns the corresponding signal referenced of the indicated property
     * @param {string} property The name of the property
     * @returns {Signal} The signal referenced of the indicated property
     */
    getProperty = (property) => {
        return this[this.constructor.PROPERTY_PREFIX + property];
    }
}


/**
 * This is a general class to represent the structure of any entity in the application.
 * It handles the query and persistence of the entity accessing throught the API.
 * Also can perform some validations and transformations to the data according to the entity nature.
 * 
 * @property {DataModel} data This is the data of the entity
 * @property {boolean} isPersisted This is a flag to indicate if the entity is persisted or not
 */
class Model {

    /**
     * Endpoint configuration for the GET service to get a list of the entity. 
     * This is different than GET_ENDPOINT that is used to fetch a single entity
     * It gets the value dinamically since depends on the AuthService status
     */
    static LIST_ENDPOINT() { return null; };

    /**
     * Endpoint configuration for the GET service to get a single entity.
     * It gets the value dinamically since depends on the AuthService status
     */
    static GET_ENDPOINT() { return null; };

    /**
     * Endpoint configuration for the POST service.
     * It gets the value dinamically since depends on the AuthService status
     */
    static POST_ENDPOINT() { return null };

    /**
     * Endpoint configuration for the PATCH service.
     * It gets the value dinamically since depends on
     * the AuthService status
     */
    static PATCH_ENDPOINT() { return null };

    /**
     * Endpoint configuration for the DELETE service. It gets the value dinamically since depends on
     * the AuthService status
     */
    static DELETE_ENDPOINT() { return null };

    /**
     * This is the name of the entity in the API response
     */
    static ENTITY_NAME = null;
    /**
     * This is the name of the list of entities in the API response
     */
    static LIST_NAME = null;

    static QUERY_OPTIONS = {
        staleTime: 5 * 60 * 1000, // We assume 5 minutes
        refetchOnWindowFocus: true,
        retry: true,
    };

    static ATTRIBUTES_CONFIG = {id: {}};

    /**
     * This query will handle all the queries for entities in the application
     */
    static QueryClient = new QueryClient({
        defaultOptions: {
            queries: {
                ...this.QUERY_OPTIONS
            }
        }
    });

    /**
     * This is a flag to indicate if the entity is persisted or not
     */
    _isPersisted = false;

    get isPersisted() {
        return this._isPersisted;
    }

    set isPersisted(isPersisted) {
        // simplily return, it is not possible to set this flag
        return;
    }

    _originalData = null;

    get originalData() {
        return this._originalData;
    }

    set originalData(originalData) {
        // simplily return, it is not possible to set this flag
        return;
    }

    /**
     * This private attribute is used to store the data returned when some request API is performed
     * to take advantage of the updated data from the server. 
     */
    _refreshedData = null;
    
    /**
     * This is the object to handle the data of the entity
     * @type {DataModel}
     */
    data = null;

    /**
     * This is the reference to the Proxy object that wraps this instance
     */
    _proxyThis = null;

    beforeGetCallback = (data) => { };
    beforePostCallback = (data) => { };
    beforePatchCallback = (data) => { };
    beforeDeleteCallback = (data) => { };
    onSuccessGetCallback = (data) => { };
    onSuccessPostCallback = (data) => { };
    onSuccessPatchCallback = (data) => { };
    onSuccessDeleteCallback = (data) => { };
    onErrorGetCallback = (error) => { throw error };
    onErrorPostCallback = (error) => { throw error };
    onErrorPatchCallback = (error) => { throw error };
    onErrorDeleteCallback = (error) => { throw error };

    /**
     * This is the constructor of the class
     * @param {Object} inicialData The initial data of the entity. Could contain the ID of the entity, if so
     *                            the entity is considered as already persisted
     */
    constructor(inicialData, options = {}) {
        
        if (!this.constructor.ENTITY_NAME) {
            throw new Error('ENTITY_NAME not defined');
        }

        this.beforeGetCallback = options.beforeGetCallback && typeof options.beforeGetCallback === 'function' ? options.beforeGetCallback : this.beforeGetCallback;
        this.beforePostCallback = options.beforePostCallback && typeof options.beforePostCallback === 'function' ? options.beforePostCallback : this.beforePostCallback;
        this.beforePatchCallback = options.beforePatchCallback && typeof options.beforePatchCallback === 'function' ? options.beforePatchCallback : this.beforePatchCallback;
        this.beforeDeleteCallback = options.beforeDeleteCallback && typeof options.beforeDeleteCallback === 'function' ? options.beforeDeleteCallback : this.beforeDeleteCallback;
        this.onSuccessGetCallback = options.onSuccessGetCallback && typeof options.onSuccessGetCallback === 'function' ? options.onSuccessGetCallback : this.onSuccessGetCallback;
        this.onSuccessPostCallback = options.onSuccessPostCallback && typeof options.onSuccessPostCallback === 'function' ? options.onSuccessPostCallback : this.onSuccessPostCallback;
        this.onSuccessPatchCallback = options.onSuccessPatchCallback && typeof options.onSuccessPatchCallback === 'function' ? options.onSuccessPatchCallback : this.onSuccessPatchCallback;
        this.onSuccessDeleteCallback = options.onSuccessDeleteCallback && typeof options.onSuccessDeleteCallback === 'function' ? options.onSuccessDeleteCallback : this.onSuccessDeleteCallback;
        this.onErrorGetCallback = options.onErrorGetCallback && typeof options.onErrorGetCallback === 'function' ? options.onErrorGetCallback : this.onErrorGetCallback;
        this.onErrorPostCallback = options.onErrorPostCallback && typeof options.onErrorPostCallback === 'function' ? options.onErrorPostCallback : this.onErrorPostCallback;
        this.onErrorPatchCallback = options.onErrorPatchCallback && typeof options.onErrorPatchCallback === 'function' ? options.onErrorPatchCallback : this.onErrorPatchCallback;
        this.onErrorDeleteCallback = options.onErrorDeleteCallback && typeof options.onErrorDeleteCallback === 'function' ? options.onErrorDeleteCallback : this.onErrorDeleteCallback;

        this._proxyThis = new Proxy(this, {
            get: (target, prop, receiver) => {
                // Si la propiedad existe en `data`, retorna su valor
                if (prop in target.data && !prop.startsWith('_') && typeof target.data[prop] !== 'function') {
                    return target.data[prop];
                }
                // De lo contrario, usa el comportamiento predeterminado
                return Reflect.get(target, prop, receiver);
            },
            set: (target, prop, value, receiver) => {
                // Si la propiedad existe en `data`, asigna su valor
                if (prop in target.data) {
                    target.data[prop] = value;
                    return true;
                }
                // De lo contrario, usa el comportamiento predeterminado
                return Reflect.set(target, prop, value, receiver);
            }
        });
        
        // We build the main structure of the model
        this._createDataStructure();

        // We set the initial data of the model
        this._setInitialData(inicialData);
        

        // Envolver esta instancia con un Proxy
        // Solo para manejar llamadas externas a las propiedades de este modelo
        return this._proxyThis;
    }

    /**
     * This function creates the data structure of this model entity based on the ATTRIBUTES_CONFIG
     */
    _createDataStructure = () => {
        const attributesConfig = this.constructor.ATTRIBUTES_CONFIG;

        this.data = new DataModel(attributesConfig, this._proxyThis);
    }

    /**
     * This function sets the initial data of the entity
     * @param {Object} inicialData The initial data of the entity. Could contain the ID of the entity, if so
     *                             the entity is considered as already persisted
     */
    _setInitialData = (inicialData) => {
        if (typeof inicialData === 'object') {
            let dataStructure = this.data.getObject();
            for (const attribute in dataStructure) {
                if (inicialData[attribute] !== undefined && inicialData[attribute] !== null) {
                    let value = inicialData[attribute];
                    if (attribute == 'id') {
                        // If the user passes an object with an ID, we only set the ID of the entity.
                        // not the rest of the attributes this is the case of the entity is already exists
                        this._isPersisted = true;
                        value = parseInt(value);
                    };
                    this.data[attribute] = value;
                }
            }
            this._originalData = new DataModel(this.constructor.ATTRIBUTES_CONFIG, this._proxyThis);
            this._originalData.update(this.data.getObject());
        }
    }

    /**
     * Re-runs the query to get the data of the entity. Could be from the caché or from the API
     * or even from any response of the API that has returne a fresh data of the entity
     */
    fetchQuery = async () => {
        try {
            const data = await this.constructor.QueryClient.fetchQuery({
                queryKey: [this.constructor.ENTITY_NAME, this.data.id],
                queryFn: this._fetchData
            });
            this.data.update(data);
            this._originalData.update(data);
            this.onSuccessGetCallback(data);
        } catch (error) {
            console.log('Error: ', error);
            this.onErrorGetCallback(error);
        }
    }

    /**
     * This function is used by the query to get the data of the entity
     * It can fetch the data from the API for the first time or fetch the data
     * from the _refreshedData attribute if it is setted (when some request API was performed)
     * @returns {Object} A raw version of the data of the entity
     */
    _fetchData = async () => {
        this._isPersisted = true;
        if (this._refreshedData) {
            let tempData = this._refreshedData;
            this._refreshedData = null;
            return {
                ...this.data.getObject(),
                ...tempData
            };
        }
        return this.get();
    }

    /**
     * This function prepares the URL of the API service to be called
     * By default, uses the this.data.getObject of this entity, but can be overrided
     * in the child classes according to the special needes of the URL.
     */
    prepareURL(url) {
        return ApiService.replaceUrlParams(url, this.data.getObject());
    }

    /**
     * This function is in charge of fetching the data from the API according to
     * the id of this entity
     */
    async get() {
        if (!this.constructor.GET_ENDPOINT()) {
            throw new Error(`GET_ENDPOINT not defined on ${this.name}`);
        }
        if (!this.data.id) {
            throw new Error('Cannot GET an entity without an ID');
        }
        
        try {
            let config = { ...this.constructor.GET_ENDPOINT() };
            config.url = this.prepareURL(config.url);
            const responseData = await ApiService.request({}, config);
            this.onSuccessGetCallback(responseData.data);
            return responseData.data[this.constructor.ENTITY_NAME];
        } catch (error) {
            this.onErrorGetCallback(error);
        }
    }

    /**
     * This function modifies the structure of the data object to be sent for post service 
     * @returns {Object} The data of the entity in object format
     */
    prepareForPost() {
        return this.data.getObject();
    }

    /**
     * This function is in charge of creating a new entity through the API
     * 
     */
    async post() {
        if (!this.constructor.POST_ENDPOINT()) {
            throw new Error('POST_ENDPOINT not defined');
        }
        if (this.data.id) {
            throw new Error(`Cannot POST an entity that already has an ID: ${this.data.id} `);
        }
        try {
            let config = { ...this.constructor.POST_ENDPOINT() };
            config.url = this.prepareURL(config.url);
            const responseData = await ApiService.request(this.prepareForPost(), config);
            this._refreshedData = responseData.data[this.constructor.ENTITY_NAME];
            this.data.id = this._refreshedData.id;
            this.constructor.QueryClient.refetchQueries({
                queryKey: [this.constructor.ENTITY_NAME, this.data.id]
            });
            this._isPersisted = true;
            this.onSuccessPostCallback(responseData.data);
            return responseData.data;
        } catch (error) {
            this.onErrorPostCallback(error);
        }
    }

    /**
     * This function modifies the structure of the data object to be sent for post service 
     * @returns {Object} The data of the entity in object format
     */
    prepareForPatch() {
        return this.data.getObject();
    }

    /**
     * Saves the last changes of this entity through the API
     */
    async patch() {
        if (!this.constructor.PATCH_ENDPOINT()) {
            throw new Error('PATCH_ENDPOINT not defined');
        }
        if (!this.data.id) {
            throw new Error('Cannot PATCH an entity without an ID');
        }
        try {
            let config = { ...this.constructor.PATCH_ENDPOINT() };
            config.url = this.prepareURL(config.url);
            const responseData = await ApiService.request(this.prepareForPatch(), config);

            let refreshedData = responseData.data[this.constructor.ENTITY_NAME];
            if (refreshedData && typeof refreshedData === 'object') {
                this._refreshedData = responseData.data[this.constructor.ENTITY_NAME];
                this.constructor.QueryClient.refetchQueries({
                    queryKey: [this.constructor.ENTITY_NAME, this.data.id]
                });
            }

            this.onSuccessPatchCallback(responseData.data);
            return responseData.data;
        } catch (error) {
            this.onErrorPatchCallback(error);
        }
    }

    /**
     * Deletes this entity through the API
     */
    async delete() {
        if (!this.constructor.DELETE_ENDPOINT()) {
            throw new Error('DELETE_ENDPOINT not defined');
        }
        if (!this.data.id) {
            throw new Error('Cannot DELETE an entity without an ID');
        }

        try {
            let config = { ...this.constructor.DELETE_ENDPOINT() };
            config.url = this.prepareURL(config.url);
            let responseData = await ApiService.request({}, config);
            this.constructor.QueryClient.removeQueries([this.constructor.ENTITY_NAME, this.data.id]);
            this.onSuccessDeleteCallback(responseData.data);
            return responseData.data;
        } catch (error) {
            this.onErrorDeleteCallback(error);
        }
    }

    /**
     * This function turn back to the original values of the entity
     */
    restore() {
        this.data.update(this._originalData.getObject());
    }

    /**
     * This function compares the ID of the entity passed as parameter with the ID of this entity
     * @param {Model} model The model to compare with this entity
     * @returns {boolean} True if the ID of the entity passed as parameter is the same as this entity
     */
    compare(model) {
        if (model instanceof this.constructor) {
            return this.data.id === model.data.id;
        }
        return false;
    }

    /**
     * This function returns the proxy object that wraps this instance
     */
    getInstance() {
        return this._proxyThis;
    }

    toString() {
        return String(this.data.id);
    }

    toJSON() {
        return this.data.getObject();
    }

    setOnAnySuccessCallback(callback) {
        this.onSuccessGetCallback = callback;
        this.onSuccessPostCallback = callback;
        this.onSuccessPatchCallback = callback;
        this.onSuccessDeleteCallback = callback;
    }

    setOnAnyErrorCallback(callback) {
        this.onErrorGetCallback = callback;
        this.onErrorPostCallback = callback;
        this.onErrorPatchCallback = callback;
        this.onErrorDeleteCallback = callback;
    }

    /**
     * Gets the entity usting the ID passing as parameter and returns a new instance of the entity
     * @returns {this} The entity with the ID passed as parameter
     */
    static async select(id) {
        let newEntity = new this({ id: id });
        await newEntity.get();
    }

    /**
     * Gets the list of the entities of this type through the API
     * @param {Object} filters The filters to be applied to the list
     *                       - order: {
     *                          column: The column to order by
     *                          dir: The direction of the order
     *                         }
     *                       - search: {
     *                          value: The term to search
     *                         }
     *                       - length: The number of items to return
     *                       - start: The index of the first item to return   
     */
    static async list(filters) {
        if (!this.LIST_ENDPOINT()) {
            throw new Error(`LIST_ENDPOINT not defined on ${this.name}`);
        }
        const responseData = await ApiService.request(filters, this.LIST_ENDPOINT());
        const returnedList = responseData.data[this.LIST_NAME].map((item) => new this(item));
        return {
            list: returnedList,
            recordsTotal: responseData.data.recordsTotal,
            recordsFiltered: responseData.data.recordsFiltered,
        };
    }

    /**
     * Casts the value to the type of this entity
     */
    static cast(value) {
        if (value instanceof this) {
            return value;
        } else if (value instanceof Object) {
            return new this(value);
        } else if (typeof value === 'number') {
            return new this({ id: value });
        } else {
            throw new Error(`Invalid value for ${this.name} cast`, value);
        }
    }

    /**
     * Returns or assign a value to a nested property of the given object.
     */
    static nestedProperty(object, rute, value) {
        const parts = rute.replace(/\[(\w+)\]/g, '.$1').split('.');
        const lastPart = parts.pop();

        let lastObject = object;
        for (let i = 0; i < parts.length; i++) {
            if (lastObject === undefined) {
                return undefined;
            }
            lastObject = lastObject[parts[i]];
        }

        if (value !== undefined && lastObject !== undefined && lastPart in lastObject) {
            lastObject[lastPart] = value;
        } else {
            return lastObject ? lastObject[lastPart] : undefined;
        }
    }

    /**
     * Finds the model in the list passed as parameter
     * @param {Array} list The list to search the model
     * @param {Model} model The model to find in the list
     */
    static findInList(list, model) {
        return list.find((item) => item.id === model.id);
    }

    /**
     * Finds the model in the list passed as parameter
     * @param {Array} list The list to search the model
     * @param {number} id The ID of the model to find in the list
     */
    static findInListById(list, id) {
        return list.find((item) => item.id === id);
    }

}

export { Model, DataModel };