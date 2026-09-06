/* Render the real function with a fake database: no credentials or network calls. */
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

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

export async function renderTeamBoard({collections=sampleBoardData(),token='fixture-only',enabled=true,now=null}={}){
  const documents={board_share:{enabled,token:'fixture-only'},team:{names:{boss:'Boss',dew:'Dew',o:'O',junior:'Eye'}}};
  const db={collection:name=>({
    doc:id=>({get:async()=>({exists:Boolean(documents[id]),data:()=>documents[id]})}),
    get:async()=>({docs:(collections[name]||[]).map(item=>({data:()=>item}))})
  })};
  const Clock=now?class extends Date{constructor(...args){super(...(args.length?args:[now]));}}:Date;
  const context=vm.createContext({exports:{},console,Date:Clock,require:name=>{
    if(name!=='./lib/admin')throw Error('Unexpected dependency '+name);
    return {getDb:()=>db,rateLimited:()=>false,clientIp:()=> 'fixture',json:(statusCode,body)=>({statusCode,body:JSON.stringify(body)})};
  }});
  vm.runInContext(readFileSync(new URL('../netlify/functions/team-board.js',import.meta.url),'utf8'),context);
  return context.exports.handler({queryStringParameters:{token}});
}
