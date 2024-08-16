// Conecte ao MongoDB
import { MongoClient } from 'mongodb';
const uri = "mongodb://localhost:27017/ChatGpt"; // Substitua pelo URI correto
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function removeDuplicates() {
    await client.connect();
    const db = client.db('ChatGpt');
    const collection = db.collection('baileys_chats');

    const cursor = collection.aggregate([
        {
            $group: {
                _id: { assistantId: "$assistantId", id: "$id" },
                uniqueIds: { $addToSet: "$_id" },
                count: { $sum: 1 }
            }
        },
        {
            $match: {
                count: { $gt: 1 }
            }
        }
    ]);

    const duplicates = await cursor.toArray();

    for (let doc of duplicates) {
        const { uniqueIds } = doc;
        uniqueIds.shift(); // Mantém o primeiro documento
        await collection.deleteMany({ _id: { $in: uniqueIds } });
    }

    console.log("Duplicatas removidas");
    await client.close();
}

removeDuplicates().catch(console.error);
