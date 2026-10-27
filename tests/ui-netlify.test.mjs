import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const toml=readFileSync(new URL('netlify.toml',root),'utf8');
const rules=toml.split('[[redirects]]').slice(1).map(block=>{
  const get=key=>{const m=block.match(new RegExp('^\\s*'+key+'\\s*=\\s*(.+)$','m'));return m?m[1].trim().replace(/^"|"$/g,''):undefined;};
  return {from:get('from'),to:get('to'),status:Number(get('status')),force:get('force')==='true'};
});
const hidden=new Set(rules.filter(r=>r.status===404&&r.force).map(r=>r.from));
/* What the live site needs; everything else in the published folder is hidden. */
const APP=new Set(['index.html','assets','site.webmanifest']);
const LOCAL=new Set(['.git','.claude','.codex-tasks','.agents','.oil-ui','skills-lock.json','node_modules','.netlify']);

test('every published file that is not part of the app answers not found',()=>{
  const missing=readdirSync(root).filter(name=>!APP.has(name)&&!LOCAL.has(name)&&!/^\.env/.test(name)).filter(name=>{
    const dir=statSync(new URL(name,root)).isDirectory();
    return !hidden.has('/'+name+(dir?'/*':''));
  });
  assert.deepEqual(missing,[],'add a 404 rule to netlify.toml for these');
});

test('the app, its assets and the Director board stay reachable',()=>{
  for(const path of ['/','/index.html','/assets/*','/assets/workspace-ui.css','/site.webmanifest','/team-board','/board-action']){
    assert.ok(!hidden.has(path),path+' must not be hidden');
  }
  const board=rules.find(r=>r.from==='/team-board'),action=rules.find(r=>r.from==='/board-action');
  assert.equal(board.to,'/.netlify/functions/team-board');
  assert.equal(board.status,200);
  assert.equal(action.to,'/.netlify/functions/board-action');
  assert.equal(action.status,200);
});
