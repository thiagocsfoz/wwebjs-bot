export class OrderedDictionary {
    constructor() {
        this.keys = [];
        this.values = {};
    }

    upsert(key, value) {
        if (!this.values[key]) {
            this.keys.push(key);
        }
        this.values[key] = value;
    }

    get(key) {
        return this.values[key];
    }

    getAll() {
        return this.keys.map(key => this.values[key]);
    }

    delete(key) {
        if (this.values[key]) {
            delete this.values[key];
            this.keys = this.keys.filter(k => k !== key);
        }
    }

    clear() {
        this.keys = [];
        this.values = {};
    }

    toJSON() {
        return this.getAll();
    }

    fromJSON(jsonArray) {
        jsonArray.forEach(item => {
            this.upsert(item.key, item.value);
        });
    }
}
