/**
 * Provide functions for consistent interaction with database
 * across all scripts and services.
 * Code adapted from agm1984 @ https://stackoverflow.com/questions/24621940/how-to-properly-reuse-connection-to-mongodb-across-nodejs-application-and-module
 */

import * as config from 'config';

import { MongoClient, Db, Cursor, ObjectID } from 'mongodb';

import { Record, Update, Insert, Edit } from './db.schema';
import { autosFor, fixedsFor, foreignsFor, fieldsFor } from './db.schema';
import {
    collections, collectionFor, schemaFor, foreignData
} from './db.schema';
import {
    RecordID, UserID, LearningObjectID, OutcomeID,
    LearningOutcomeID, StandardOutcomeID
} from './db.schema';

import {
    UserSchema, UserRecord, UserUpdate, UserInsert, UserEdit
} from './user.schema';
import {
    LearningObjectSchema, LearningObjectRecord, LearningObjectUpdate,
    LearningObjectInsert, LearningObjectEdit
} from './learning-object.schema';
import {
    LearningOutcomeSchema, LearningOutcomeRecord, LearningOutcomeUpdate,
    LearningOutcomeInsert, LearningOutcomeEdit
} from './learning-outcome.schema';
import {
    StandardOutcomeSchema, StandardOutcomeRecord, StandardOutcomeUpdate,
    StandardOutcomeInsert, StandardOutcomeEdit
} from './standard-outcome.schema';
import { OutcomeRecord } from './learning-outcome.schema';

export { ObjectID };

let dbconfig = config.get('database');
// only created once, no matter how many times the module is required
let _db: Db;

/**
 * Connect to the database. Must be called before any other functions.
 * @async
 * 
 * NOTE: This function will attempt to connect to the database every
 *       time it is called, but since it assigns the result to a local
 *       variable which can only ever be created once, only one
 *       connection will ever be active at a time.
 * 
 * TODO: Verify that connections are automatically closed
 *       when they no longer have a reference.
 */
export async function connect(): Promise<void> {
    try {
        _db = await MongoClient.connect(dbconfig["uri"]);
        return Promise.resolve();
    } catch(e) {
        return Promise.reject("Problem connecting to database at "
                +dbconfig["uri"]+":\n\t"+e);
    }
}

/**
 * Close the database. Note that this will affect all services
 * and scripts using the database, so only do this if it's very
 * important or if you are sure that *everything* is finished.
 */
export function disconnect(): void {
    _db.close();
}

/////////////
// INSERTS //
/////////////

/**
 * Insert a user into the database.
 * @async
 * 
 * @param {UserInsert} record 
 * 
 * @returns {UserID} the database id of the new record
 */
export async function insertUser(record: UserInsert): Promise<UserID> {
    return insert(UserSchema, record);
}

/**
 * Insert a learning object into the database.
 * @async
 * 
 * @param {LearningObjectInsert} record 
 * 
 * @returns {LearningObjectID} the database id of the new record
 */
export async function insertLearningObject(record: LearningObjectInsert):
        Promise<LearningObjectID> {
    return insert(LearningObjectSchema, record);
}

/**
 * Insert a learning outcome into the database.
 * @async
 * 
 * @param {LearningOutcomeInsert} record 
 * 
 * @returns {LearningOutcomeID} the database id of the new record
 */
export async function insertLearningOutcome(record: LearningOutcomeInsert):
        Promise<LearningOutcomeID> {
    try {
        /* FIXME: In order to create auto-generated fields, we need to
                  query information for the foreign keys. But when we
                  perform the generic insert, we unnecessarily query
                  again to verify the foreign keys exist. Thoughts? */
        let source = await _db.collection(collectionFor(LearningObjectSchema))
                          .findOne<LearningObjectRecord>({_id: record.source});
        let author = await _db.collection(collectionFor(UserSchema))
                              .findOne<UserRecord>({_id:source.author});
        /* TODO: IMPORTANT - I just realized that updating and editing
                 users and learning objects needs to cascade update
                 the learning outcomes' auto-generated fields. */
        record['author'] = author.name_;
        record['name_'] = source.name_;
        record['outcome'] = record.verb+" "+record.text;
        return insert(LearningOutcomeSchema, record);
    } catch(e) {
        return Promise.reject("Problem inserting a Learning Outcome:\n\t"+e);
    }
}

/**
 * Insert a standard outcome into the database.
 * @async
 * 
 * @param {StandardOutcomeInsert} record 
 * 
 * @returns the database id of the new record
 */
export async function insertStandardOutcome(record: StandardOutcomeInsert):
        Promise<StandardOutcomeID> {
    return insert(StandardOutcomeSchema, record);
}

////////////////////////////
// MAPPING AND REGISTRIES //
////////////////////////////

/**
 * Add a mapping for an outcome.
 * @async
 * 
 * @param {OutcomeID} outcome the user's outcome
 * @param {OutcomeID} mapping the newly associated outcome's id
 */
export async function mapOutcome(outcome: LearningOutcomeID,
        mapping: OutcomeID):Promise<void> {
    return register('outcomes', outcome, 'mappings', mapping);
}

/**
 * Undo a mapping for an outcome.
 * @async
 * 
 * @param {OutcomeID} outcome the user's outcome
 * @param {OutcomeID} mapping the newly associated outcome's id
 */
export async function unmapOutcome(outcome: LearningOutcomeID,
        mapping: OutcomeID): Promise<void> {
    return unregister('outcomes', outcome, 'mappings', mapping);
}

/* TODO: add functions to reorder object and outcome registries */

// updates
/* TODO: I don't think there are any use cases to update
         rather than edit. Delete these functions. */
export async function updateUser(id: UserID, record: UserUpdate): Promise<void> {
    return update(UserSchema, id, record);
}

export async function updateLearningObject(id: LearningObjectID, record: LearningObjectUpdate): Promise<void> {
    return update(LearningObjectSchema, id, record);
}

export async function LearningOutcomeUser(id: LearningOutcomeID, record: LearningOutcomeUpdate): Promise<void> {
    record['outcome'] = record.verb+" "+record.text;
    return update(LearningOutcomeSchema, id, record);
}

///////////////////////////////////////////////////////////////////
// EDITS - update without touching any foreign keys or documents //
///////////////////////////////////////////////////////////////////

/**
 * Edit a user.
 * @async
 * 
 * @param {UserID} id which document to change
 * @param {UserEdit} record the values to change to
 */
export async function editUser(id: UserID, record: UserEdit): Promise<void> {
    return edit(UserSchema, id, edit);
}

/**
 * Edit a learning object.
 * @async
 * 
 * @param {LearningObjectID} id which document to change
 * @param {LearningObjectEdit} record the values to change to
 */
export async function editLearningObject(id: LearningObjectID,
        record: LearningObjectEdit): Promise<void> {
    return edit(LearningObjectSchema, id, edit);
}

/**
 * Edit a learning outcome.
 * @async
 * 
 * @param {LearningOutcomeID} id which document to change
 * @param {LearningOutcomeEdit} record the values to change to
 */
export async function editLearningOutcome(id: LearningOutcomeID,
        record: LearningOutcomeEdit): Promise<void> {
    record['outcome'] = record.verb+" "+record.text;
    return edit(LearningOutcomeSchema, id, edit);
}

///////////////////////////////////////////
// DELETIIONS - will cascade to children //
///////////////////////////////////////////

/**
 * Remove a user (and its objects) from the database.
 * @async
 * 
 * @param {UserID} id which document to delete
 */
export async function deleteUser(id: UserID): Promise<void> {
    return remove(UserSchema, id);
}

/**
 * Remove a learning object (and its outcomes) from the database.
 * @async
 * 
 * @param {LearningObjectID} id which document to delete
 */
export async function deleteLearningObject(id: LearningObjectID):
        Promise<void> {
    return remove(LearningObjectSchema, id);
}

/**
 * Remove a learning outcome from the database.
 * @async
 * 
 * @param {LearningOutcomeID} id which document to delete
 */
export async function deleteLearningOutcome(id: LearningOutcomeID):
        Promise<void> {
    /* TODO: this function also needs to remove
             this outcome from any mappings */
    return remove(LearningOutcomeSchema, id);
}

/////////////////
// TEXT SEARCH //
/////////////////

// /**
//  * Find outcomes matching a text query.
//  * This variant uses Mongo's fancy text query. Questionable results.
//  * @param text 
//  * 
//  * @returns {Cursor<ProjectedOutcomeRecord>} cursor of positive matches
//  */
// export function matchOutcomes(text: string): Cursor<ProjectedOutcomeRecord> {
//     return _db.collection(collectionFor(StandardOutcomeSchema))
//               .find<ProjectedOutcomeRecord>(
//         { $text: {$search: text} },
//         { score: {$meta: "textScore"} })
//         .sort( { score: {$meta: "textScore"} } ) ;
// }

// /**
//  * Enhanced OutcomeRecord that includes text score data.
//  */
// interface ProjectedOutcomeRecord extends OutcomeRecord {
//     score: number
// }

/**
 * Find outcomes matching a text query.
 * This variant finds all outcomes containing each word in the query.
 * @param text the words to match against
 * 
 * @returns {Cursor<OutcomeRecord>} cursor of positive matches
 */
export function matchOutcomes(text: string): Cursor<OutcomeRecord> {
    let tokens = text.split(/\s/);
    let docs: any[] = [];
    for ( let token of tokens ) {
        docs.push({outcome: {$regex: token}});
    }

    return _db.collection(collectionFor(StandardOutcomeSchema))
              .find<OutcomeRecord>({
        $and: docs
    });
}

////////////////////////////////////////////////
// GENERIC HELPER METHODS - not in public API //
////////////////////////////////////////////////

/**
 * Reject promise if any foreign keys in a record do not exist.
 * @async
 * 
 * @param {Function} schema provides information for each foreign key
 * @param {Record} record which record to validate
 * @param {Set<string>} foreigns which fields to check
 * 
 * @returns none, but promise will be rejected if there is a problem
 */
async function validateForeignKeys(schema: Function, record: Record,
        foreigns: Set<string>): Promise<void> {
    try {
        if(foreigns) for ( let foreign of foreigns ) {
            let data = foreignData(schema, foreign);
            // get id's to check, as an array
            let keys = record[foreign];
            if ( ! (keys instanceof Array) ) keys = [keys];
            // fetch foreign document and reject if it doesn't exist
            for (let key of keys ) {
                let count = await _db.collection(data.target)
                                     .count({_id: key});
                if(count == 0) {
                    return Promise.reject("Foreign key error for "+record+": "
                          +key+" not in "+data.target+" collection");
                }
            }
        }
        return Promise.resolve();
    } catch(e) {
        return Promise.reject("Problem validating key constraint for a "
              +schema.name+":\n\t"+e);
    }
}

/**
 * Add an item's id to a foreign registry.
 * @async
 * 
 * @param {string} collection where to find the foreign registry owner
 * @param {RecordID} owner the foreign registry owner
 * @param {string} registry field name of the registry
 * @param {RecordID} item which item to add
 */
async function register(collection: string, owner: RecordID, registry: string,
        item: RecordID): Promise<void> {
    try {
        let pushdoc = {};
        pushdoc[registry] = item;

        await _db.collection(collection).updateOne({
            _id: owner
        }, {
            $push: pushdoc
        });
        return Promise.resolve();
    } catch(e) {
        return Promise.reject("Problem registering to a "+collections
              +" "+registry+" field:\n\t"+e);
    }
}

/**
 * Remove an item's id from a foreign registry.
 * @async
 * 
 * @param {string} collection where to find the foreign registry owner
 * @param {RecordID} owner the foreign registry owner
 * @param {string} registry field name of the registry
 * @param {RecordID} item which item to remove
 */
async function unregister(collection: string, owner: RecordID,
        registry: string, item: RecordID): Promise<void> {
    try {
        // fetch the document to unregister from
        let doc = await _db.collection(collection)
                           .findOne<Record>({_id: owner});

        // remove item from the registry
        let list = doc[registry];
        for ( let i = 0; i < list.length; i ++ ) {
            if (list[i] == item) {
                list.splice(i, 1);
                // keep going in case item was multiply registered
                i --;
            }
        }

        let splicedoc = {};
        splicedoc[registry] = list;

        // update the registry
        await _db.collection(collection).updateOne({_id:owner}, splicedoc);

        return Promise.resolve();
    } catch(e) {
        return Promise.reject("Problem unregistering from a "+collections
              +" "+registry+" field:\n\t"+e);
    }
}

/**
 * Insert a generic item to the database.
 * @async
 * 
 * @param {Function} schema provides collection/validation information
 * @param {Insert} record document to insert
 * 
 * @returns {RecordID} the database id of the new record
 */
async function insert(schema: Function, record: Insert): Promise<RecordID> {
    try {
        let collection = collectionFor(schema);
        let foreigns = foreignsFor(schema)
        if(foreigns) foreigns.difference(autosFor(schema));

        // check validity of all foreign keys
        await validateForeignKeys(schema, record, foreigns);

        // perform the actual insert
        let insert = await _db.collection(collection).insertOne(record);
        let id = insert.insertedId;

        // register the new record as needed
        if(foreigns) for ( let foreign of foreigns ) {
            let data = foreignData(schema, foreign);
            if (data.registry) {
                await register(data.target, record[foreign], data.registry, id);
            }
        }

        return Promise.resolve(id);
    } catch(e) {
        return Promise.reject("Problem inserting a "+schema.name+":\n\t"+e);
    }
}

/**
 * Update a generic item in the database.
 * @async
 * 
 * @param {Function} schema provides collection/validation information
 * @param {RecordID} id which document to update
 * @param {Update} record the values to change to
 */
async function update(schema: Function, id: RecordID, record: Update):
        Promise<void> {
    try {
        let collection = collectionFor(schema);
        let foreigns = foreignsFor(schema);
        if(foreigns) foreigns = foreigns.difference(autosFor(schema))
                                        .difference(fixedsFor(schema));
        // check validity of all foreign keys
        await validateForeignKeys(schema, record, foreigns);

        // perform the actual update
        await _db.collection(collection).updateOne({ _id:id }, update);

        // registered fields must be fixed, nothing to change here

        return Promise.resolve();
    } catch(e) {
        return Promise.reject("Problem updating a "+schema.name+":\n\t"+e);
    }
}

/**
 * Edit (update without foreigns) a generic item in the database.
 * @async
 * 
 * @param {Function} schema provides collection/validation information
 * @param {RecordID} id which document to edit
 * @param {Edit} record the values to change to
 */
async function edit(schema: Function, id: RecordID, record: Edit): Promise<void> {
    try {
        let collection = collectionFor(schema);

        // no foreign fields, no need to validate

        // perform the actual update
        await _db.collection(collection).updateOne({ _id:id }, update);

        // registered fields must be fixed, nothing to change here

        return Promise.resolve();
    } catch(e) {
        return Promise.reject("Problem editing a "+schema.name+":\n\t"+e);
    }
}

/**
 * Cascade delete a record and its children.
 * @async
 * 
 * @param {Function} schema provides collection/hierarcy information
 * @param {RecordID} id the document to delete
 */
async function remove(schema: Function, id: RecordID): Promise<void> {
    try {
        let collection = collectionFor(schema);

        // fetch data to be deleted ... for the last time :(
        let record = await _db.collection(collection)
                              .findOne<Record>({_id: id});
        
        // remove all children recursively, and unregister from parents
        let foreigns = foreignsFor(schema);
        if(foreigns) for ( let foreign of foreigns ) {
            let data = foreignData(schema, foreign);

            if(data.child) {
                // get children to remove, as an array
                let keys = record[foreign];
                if ( ! (keys instanceof Array) ) keys = [keys];
                // remove each child
                for ( let key of keys ) {
                    await remove(schemaFor(data.target), key);
                }
            }

            if(data.registry) {
                // get registries to edit, as an array
                let keys = record[foreign];
                if ( ! (keys instanceof Array) ) keys = [keys];
                // unregister from each key
                for ( let key of keys ) {
                    await unregister(data.target, key, data.registry, id);
                }
            }
        }

        // perform actual deletion
        await _db.collection(collection).deleteOne({_id: id});

        return Promise.resolve();
    } catch(e) {
        return Promise.reject("Problem deleting a "+schema.name+":\n\t"+e);
    }
}
