// Database instructions:
//  create storage directory "mkdir db" (it's in .gitignore, so it doesn't get cloned)
//  start local database with "mongod -f mongod.conf"
//              run this file "node src/db-init.js"
//
//      WARNING: running this script will remove all documents presently in your collections
//
//  when finished, stop with "mongod -f mongod.conf --shutdown"

import { MongoClient } from 'mongodb';
import { collections, schemaFor, uniquesFor, textsFor } from './db.schema';
import { uri } from './db.driver';

MongoClient.connect(uri, async (err, db) => {
    if(err) throw err;

    // drop collections
    for ( let collection of collections() ) {
        try {
            await db.dropCollection(collection);
            console.log("Deleted existing collection: "+collection);
        } catch(e) { }  // an error here simply means there was no collection to drop
    }

    // add collections
    try {
        for ( let collection of collections() ) {

            let c = await db.createCollection(collection);
            console.log("Created collection "+collection);

            let uniques = uniquesFor(schemaFor(collection));
            let texts = textsFor(schemaFor(collection));

            // index creation is slightly different if both have the same properties
            if(uniques && texts && uniques.equals(texts)) {
                let props = {};
                for (let text of texts) {
                    props[text] = "text";
                };
                await c.createIndex(props, {unique: true});
                console.log("Created joint unique-text index on "+texts.toString()+" for "+collection+" collection");
            } else {
                if (uniques) {
                    let props = {};
                    for (let unique of uniques) {
                        props[unique] = 1;
                    };
                    await c.createIndex(props, {unique: true});
                    console.log("Created unique index on "+uniques.toString()+" for "+collection+" collection");
                }
                // create text index
                if (texts) {
                    let props = {};
                    for (let text of texts) {
                        props[text] = "text";
                    };
                    await c.createIndex(props);
                    console.log("Created text index on "+texts.toString()+" for "+collection+" collection");
                }
            }
        }
    } catch(e) {
        console.log("Initialization failed: "+e);
    }

    db.close();
});