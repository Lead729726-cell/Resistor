import {DatabaseSync} from 'node:sqlite';
import {createLicenseDomain} from './domain.mjs';

// Node/local operator wrapper. Hosted deployments inject a transactional durable
// adapter into the same domain; they never write license state to /tmp.
export function createLicenseService({filename,...options}={}){
 const db=new DatabaseSync(filename);
 db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
 try{return createLicenseDomain({...options,database:db,transaction});}
 catch(error){db.close();throw error;}
}
