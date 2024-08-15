class ObjectRepository {
    constructor() {
        this.objects = new Map();
    }

    upsertById(id, object) {
        this.objects.set(id, object);
    }

    deleteById(id) {
        this.objects.delete(id);
    }

    count() {
        return this.objects.size;
    }

    getAll() {
        return Array.from(this.objects.values());
    }

    toJSON() {
        return this.getAll();
    }

    fromJSON(jsonArray) {
        jsonArray.forEach(item => {
            this.upsertById(item.id, item);
        });
    }
}

export default ObjectRepository;
