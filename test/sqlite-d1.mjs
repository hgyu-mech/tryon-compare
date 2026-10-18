import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function sqliteD1(file=':memory:'){
 const sqlite=new DatabaseSync(file);sqlite.exec('PRAGMA busy_timeout=15000');
 function statement(sql,values=[]){return {
  bind(...nextValues){return statement(sql,nextValues)},
  async first(){const row=sqlite.prepare(sql).get(...values);return row?{...row}:null},
  async run(){const result=sqlite.prepare(sql).run(...values);return {success:true,meta:{changes:Number(result.changes)}}},
  async all(){return {results:sqlite.prepare(sql).all(...values).map(row=>({...row})),success:true}},
 }}
 return {sqlite,prepare:statement,close(){sqlite.close()}};
}
export function migrate(db){for(const file of readdirSync(path.join(root,'drizzle')).filter(x=>x.endsWith('.sql')).sort())db.sqlite.exec(readFileSync(path.join(root,'drizzle',file),'utf8'));return db}
