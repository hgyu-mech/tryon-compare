import {parentPort,workerData} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
import {sqliteD1} from './sqlite-d1.mjs';
import {reserveAttempt} from '../lib/judge-store.mjs';
const db=sqliteD1(workerData.file);let accepted=0;
try{for(let i=0;i<4;i++)if(await reserveAttempt(db,{localId:randomUUID(),ownerHash:'local-concurrency-fixture',now:1000,limit:32}))accepted++;parentPort.postMessage({accepted})}
finally{db.close()}
