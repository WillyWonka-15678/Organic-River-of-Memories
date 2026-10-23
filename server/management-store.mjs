// Synchronous SQLite transactions serialize moderation, settings and public submissions.
export function createManagement(db){
  db.exec(`CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT OR IGNORE INTO settings VALUES('autoApproveMessages','true');
    CREATE TABLE IF NOT EXISTS admin(id INTEGER PRIMARY KEY CHECK(id=1),username TEXT NOT NULL,passwordHash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(tokenHash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expiresAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,resetAt INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,before TEXT,after TEXT,createdAt TEXT NOT NULL);`);
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const audit=(actor,action,target,before,after)=>db.prepare('INSERT INTO audit(actor,action,target,before,after,createdAt) VALUES(?,?,?,?,?,?)').run(actor,action,target,JSON.stringify(before),JSON.stringify(after),new Date().toISOString());
  const settings=()=>({autoApproveMessages:db.prepare("SELECT value FROM settings WHERE key='autoApproveMessages'").get().value==='true'});
  return {
    settings,
    changeSetting(value,actor,expected){return transaction(()=>{
      const before=settings();if(expected!==undefined&&before.autoApproveMessages!==expected)throw Object.assign(new Error('设置已被其他管理员页面修改，请刷新后重试'),{status:409});
      db.prepare("UPDATE settings SET value=? WHERE key='autoApproveMessages'").run(String(value));
      audit(actor,'settings.autoApproveMessages','autoApproveMessages',before,{autoApproveMessages:value});return settings();
    });},
    adminAccount:()=>db.prepare('SELECT username,passwordHash FROM admin WHERE id=1').get(),
    createAdmin(username,hash){return transaction(()=>{db.prepare('INSERT INTO admin VALUES(1,?,?)').run(username,hash);audit(username,'admin.initialize','admin',null,{username});});},
    createSession(hash,csrf,expires){db.prepare('DELETE FROM sessions WHERE expiresAt<=?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash,csrf,expires);},
    session:hash=>db.prepare('SELECT * FROM sessions WHERE tokenHash=? AND expiresAt>?').get(hash,Date.now()),
    revoke:hash=>db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hash),
    loginAttempt(key,limit){return transaction(()=>{
      const now=Date.now();db.prepare('DELETE FROM login_limits WHERE resetAt<=?').run(now);
      const row=db.prepare('SELECT * FROM login_limits WHERE key=?').get(key);
      if(row&&row.count>=limit)return false;
      db.prepare('INSERT INTO login_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+15*60*1000);return true;
    });},
    log: audit,
    stats(){const counts={total:0,approved:0,pending:0,hidden:0,rejected:0,deleted:0};for(const row of db.prepare('SELECT status,COUNT(*) AS n FROM messages GROUP BY status').all()){counts[row.status]=row.n;counts.total+=row.n;}return counts;},
    adminMessages({q='',status='',source='',order='desc',page=1,limit=20}){
      const where=[],args=[];
      if(status){where.push('status=?');args.push(status);}else where.push("status!='deleted'");
      if(source){where.push('source=?');args.push(source);}
      if(q){where.push("(instr(content,?)>0 OR instr(name,?)>0)");args.push(q,q);}
      const clause=where.join(' AND '),sort=order==='asc'?'ASC':'DESC';
      return {items:db.prepare(`SELECT * FROM messages WHERE ${clause} ORDER BY createdAt ${sort},id ${sort} LIMIT ? OFFSET ?`).all(...args,limit,(page-1)*limit),total:db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE ${clause}`).get(...args).n,page,limit};
    },
    moderate(id,status,expected,actor){return transaction(()=>{
      const before=db.prepare('SELECT * FROM messages WHERE id=?').get(id);
      if(!before)throw Object.assign(new Error('留言不存在'),{status:404});
      if(before.status!==expected)throw Object.assign(new Error('留言状态已变化，请刷新后重试'),{status:409});
      const allowed={pending:['approved','rejected','deleted'],approved:['hidden','deleted'],hidden:['approved','deleted'],rejected:['deleted'],deleted:[]};
      if(!allowed[before.status].includes(status))throw Object.assign(new Error('不允许此状态转换'),{status:400});
      db.prepare('UPDATE messages SET status=? WHERE id=?').run(status,id);
      audit(actor,`message.${status}`,id,{status:before.status},{status});
      return {...before,status};
    });},
    auditList:(page=1)=>db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 50 OFFSET ?').all((page-1)*50)
  };
}
