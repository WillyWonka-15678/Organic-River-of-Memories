import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createManagement } from './management-store.mjs';
import {runtimeConfig} from './config.mjs';

export const defaultDatabase = fileURLToPath(new URL('../data/messages.sqlite', import.meta.url));
export function openMessages(filename = runtimeConfig().databasePath) {
  if (filename !== ':memory:') { filename = resolve(filename); mkdirSync(dirname(filename), { recursive: true }); }
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  const schema=`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, major TEXT NOT NULL, year INTEGER NOT NULL,
      content TEXT NOT NULL, createdAt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden','rejected','deleted')),
      source TEXT NOT NULL DEFAULT 'user', sourceKey TEXT, UNIQUE(source,sourceKey));`;
  const columns=db.prepare('PRAGMA table_info(messages)').all();
  if(columns.length&&!columns.some(c=>c.name==='source')){
    if(filename!==':memory:'&&!existsSync(`${filename}.pre-stage3.bak`))db.prepare('VACUUM INTO ?').run(`${filename}.pre-stage3.bak`);
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec(`ALTER TABLE messages RENAME TO messages_stage2; DROP INDEX IF EXISTS messages_created; ${schema}
        INSERT INTO messages(id,name,major,year,content,createdAt,status) SELECT id,name,major,year,content,createdAt,status FROM messages_stage2;
        DROP TABLE messages_stage2; COMMIT;`);
    }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }else db.exec(schema);
  const tableSql=db.prepare("SELECT sql FROM sqlite_master WHERE name='messages'").get().sql;
  if(!tableSql.includes("'deleted'")){
    if(filename!==':memory:'&&!existsSync(`${filename}.pre-stage4.bak`))db.prepare('VACUUM INTO ?').run(`${filename}.pre-stage4.bak`);
    db.exec('BEGIN IMMEDIATE');
    try{db.exec(`ALTER TABLE messages RENAME TO messages_stage3; DROP INDEX IF EXISTS messages_created; ${schema}
      INSERT INTO messages SELECT * FROM messages_stage3; DROP TABLE messages_stage3; COMMIT;`);}
    catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  db.exec('CREATE INDEX IF NOT EXISTS messages_created ON messages(createdAt DESC,id DESC);');
  const insert = db.prepare('INSERT INTO messages (id,name,major,year,content,createdAt,status,source,sourceKey) VALUES (?,?,?,?,?,?,?,?,?)');
  const management=createManagement(db);
  const save=(value,status)=>{
    const record={id:randomUUID(),...value,createdAt:new Date().toISOString(),status};
    insert.run(record.id,record.name,record.major,record.year,record.content,record.createdAt,record.status,'user',null);return record;
  };
  return {
    ...management,
    submit(value){
      db.exec('BEGIN IMMEDIATE');
      try{const record=save(value,management.settings().autoApproveMessages?'approved':'pending');db.exec('COMMIT');return record;}
      catch(error){db.exec('ROLLBACK');throw error;}
    },
    close: () => db.close(),
    save(value, status='pending') {
      return save(value,status);
    },
    seed(records){
      let added=0;db.exec('BEGIN IMMEDIATE');
      try{
        const statement=db.prepare("INSERT OR IGNORE INTO messages(id,name,major,year,content,createdAt,status,source,sourceKey) VALUES (?,?,?,?,?,?,'approved','seed',?)");
        for(const r of records)added+=Number(statement.run(`seed:${r.id}`,r.name??'',r.major??'',Number(r.year??2026),r.message,new Date().toISOString(),r.id).changes);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      return {total:records.length,added,skipped:records.length-added,userHistory:db.prepare("SELECT COUNT(*) AS n FROM messages WHERE source='user'").get().n};
    },
    approved(){return db.prepare("SELECT id,name,major,year,content FROM messages WHERE status='approved' ORDER BY createdAt,id").all();},
    approve(id){const row=db.prepare("SELECT * FROM messages WHERE id=? AND source='user' AND status='pending'").get(id);if(!row)return 0;management.moderate(id,'approved','pending','local-cli');return 1;},
    hide(id){return Number(db.prepare("UPDATE messages SET status='hidden' WHERE id=?").run(id).changes);},
    list(page,limit) {
      const items = db.prepare('SELECT * FROM messages ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?').all(limit,(page-1)*limit);
      return { items, total: db.prepare('SELECT COUNT(*) AS total FROM messages').get().total, page, limit };
    }
  };
}
export function validateMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请提交 JSON 对象');
  if ('status' in body) throw new Error('不能设置审核状态');
  const text = (key,max,required=false) => {
    if (body[key] !== undefined && typeof body[key] !== 'string') throw new Error(`${key} 必须为文本`);
    const value = (body[key] ?? '').trim();
    if (required && !value) throw new Error('毕业寄语不能为空');
    if ([...value].length > max) throw new Error(`${key} 最多 ${max} 个字符`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new Error(`${key} 含有无效控制字符`);
    return value;
  };
  const name=text('name',20)||'匿名毕业生',major=text('major',40),content=text('content',60,true);
  const raw = body.year === undefined || body.year === '' ? '2026' : body.year;
  if (!['string','number'].includes(typeof raw)) throw new Error('毕业年份格式不正确');
  const year=String(raw).trim();
  if (!/^\d{4}$/.test(year) || Number(year)<1900 || Number(year)>2100) throw new Error('毕业年份应为 1900–2100 的四位数字');
  return { name, major, year:Number(year), content };
}
