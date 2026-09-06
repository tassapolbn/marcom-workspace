/* Render the real functions with a fake database: no credentials or network calls. */
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require_=createRequire(import.meta.url);
const boardActions=require_('../netlify/functions/lib/board-actions.js');

export function sampleBoardData(){
  const date=offset=>new Date(Date.now()+offset*86400000).toISOString().slice(0,10);
  const titles=['Prepare the September newsletter','Review the open day campaign assets','Confirm the venue and production schedule','Plan next month’s content calendar'];
  const data={event_tasks:[
    {topic:'School Open Day · launch campaign',status:'in-progress',dueDate:date(2),assignees:['boss','dew','junior'],description:'Coordinate campaign messaging, creative assets and event logistics.',eventName:'School Open Day'},
    {topic:'Campus photography and video brief',status:'waiting',assignees:['boss','o'],description:'Confirm the shot list and locations before production.'}
  ]};
  for(const member of ['boss','dew','o','junior'])data[member+'_tasks']=titles.map((topic,index)=>({
    topic,status:['in-progress','waiting','pending','on-hold'][index],dueDate:index===3?'':date(index-1),
    priority:index===0?'high':'medium',description:'Coordinate the next steps with the team.\nReview the brief and prepare assets for approval.',
    links:[{title:'Example creative brief',url:'https://example.com/brief'}]
  }));
  return data;
}

/* A small Firestore stand-in: documents by id, collections as arrays, equality
   filters, and an add() that records what a function tried to write. */
function fakeDb(collections,documents,written){
  const docsOf=name=>(collections[name]||[]).map((item,index)=>({
    id:item.__id||(name+'-'+index),data:()=>item
  }));
  const query=(name,filters)=>({
    where:(field,op,value)=>query(name,filters.concat([[field,value]])),
    limit:()=>query(name,filters),
    get:async()=>{
      const docs=docsOf(name).filter(doc=>filters.every(([field,value])=>(doc.data()||{})[field]===value));
      return {docs,size:docs.length,empty:docs.length===0};
    }
  });
  return {collection:name=>Object.assign(query(name,[]),{
    doc:id=>({get:async()=>{
      if(Object.prototype.hasOwnProperty.call(documents,id))return {exists:Boolean(documents[id]),data:()=>documents[id]};
      const hit=docsOf(name).filter(doc=>doc.id===id)[0];
      return {exists:Boolean(hit),data:()=>hit&&hit.data()};
    }}),
    add:async record=>{
      const list=(written[name]=written[name]||[]);
      list.push(record);
      return {id:name+'-added-'+list.length};
    }
  })};
}

function runFunction(file,{collections,documents,written,now}){
  const db=fakeDb(collections,documents,written);
  const Clock=now?class extends Date{constructor(...args){super(...(args.length?args:[now]));}}:Date;
  const adminStub={firestore:{FieldValue:{serverTimestamp:()=>'server-timestamp'}}};
  const context=vm.createContext({exports:{},console,Date:Clock,JSON,require:name=>{
    if(name==='./lib/admin')return {admin:adminStub,getDb:()=>db,rateLimited:()=>false,clientIp:()=>'fixture',
      json:(statusCode,body)=>({statusCode,body:JSON.stringify(body)})};
    if(name==='./lib/board-actions')return boardActions;
    throw Error('Unexpected dependency '+name);
  }});
  vm.runInContext(readFileSync(new URL('../netlify/functions/'+file,import.meta.url),'utf8'),context);
  return context.exports.handler;
}

export async function renderTeamBoard({collections=sampleBoardData(),token='fixture-only',enabled=true,now=null,notes=[]}={}){
  const documents={board_share:{enabled,token:'fixture-only'},team:{names:{boss:'Boss',dew:'Dew',o:'O',junior:'Eye'}}};
  const all=Object.assign({},collections,{director_notes:notes});
  const handler=runFunction('team-board.js',{collections:all,documents,written:{},now});
  return handler({queryStringParameters:{token}});
}

/* Post one Director action and report both the reply and everything written. */
export async function sendBoardAction({collections=sampleBoardData(),token='fixture-only',enabled=true,
  method='POST',notes=[],body={}}={}){
  const documents={board_share:{enabled,token:'fixture-only'},team:{names:{boss:'Boss',dew:'Dew',o:'O',junior:'Eye'}}};
  const written={};
  const all=Object.assign({},collections,{director_notes:notes});
  const handler=runFunction('board-action.js',{collections:all,documents,written,now:null});
  const reply=await handler({httpMethod:method,headers:{},body:JSON.stringify(Object.assign({token},body))});
  return {statusCode:reply.statusCode,body:JSON.parse(reply.body),written};
}

export {boardActions};
