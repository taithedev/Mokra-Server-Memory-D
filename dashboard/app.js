'use strict';
const $ = id => document.getElementById(id);
const pages = {overview:'Overview',players:'Players',catalog:'Cosmetics',config:'Game settings',audit:'Activity log'};
const iconPaths = {
  overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  box:'M21 8l-9 5-9-5 M3 8l9-5 9 5v9l-9 5-9-5V8 M12 13v9',
  sliders:'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  activity:'M3 12h4l3-8 4 16 3-8h4',
  logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  menu:'M4 7h16 M4 12h16 M4 17h16',
  search:'M20 20l-4.5-4.5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  arrow:'M4 12h16 M14 6l6 6-6 6',
  refresh:'M20 7v5h-5 M4 17v-5h5 M5.5 9a7 7 0 0 1 12-2l2.5 5 M4 12l2.5 5a7 7 0 0 0 12 0',
  shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  wallet:'M3 5h16a2 2 0 0 1 2 2v12H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M1 9h20 M16 14h2',
  clock:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 2',
  plus:'M12 5v14 M5 12h14',
  check:'M4 12l5 5L20 6',
  close:'M5 5l14 14 M19 5L5 19',
  server:'M4 3h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2 M4 12h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2 M6 7h.01 M6 16h.01',
  list:'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  edit:'M15 5l4 4 M4 20l5-.8L20 8a2 2 0 0 0-4-4L5 15z',
  coin:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M9 8h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h5 M12 6v2 M12 16v2'
};
function icon(name,size=17) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('width',size);
  svg.setAttribute('height',size); svg.setAttribute('class','icon'); svg.setAttribute('aria-hidden','true');
  const path = document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',iconPaths[name] || iconPaths.overview);svg.append(path);return svg;
}
function el(tag,attrs={},children=[]) {
  const node = document.createElement(tag);
  for (const [key,value] of Object.entries(attrs)) {
    if (key==='class') node.className=value;
    else if (key==='text') node.textContent=String(value ?? '');
    else if (key==='value') node.value=value;
    else if (key==='disabled') node.disabled=Boolean(value);
    else node.setAttribute(key,String(value));
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
}
function div(cls,children=[]) { return el('div',{class:cls},children); }
function small(text,cls='sub') { return el('small',{class:cls,text}); }
function button(text,fn,variant='button',iconName=null) {
  const b=el('button',{class:variant,type:'button'});
  if(iconName)b.append(icon(iconName));b.append(document.createTextNode(text));
  if(fn)b.addEventListener('click',fn);return b;
}
function field(labelText,placeholder='',type='text',value='') {
  const id='field_'+Math.random().toString(36).slice(2,9);
  const input=el(type==='textarea'?'textarea':'input',{id,placeholder});
  if(type!=='textarea')input.setAttribute('type',type);
  input.value=value ?? '';
  const wrapper=div('field',[el('label',{for:id,text:labelText}),input]);
  return {wrapper,input};
}
function badge(text,bad=false,dim=false){return el('span',{class:'badge '+(bad?'bad':dim?'dim':'')},[el('i'),text]);}
const num=new Intl.NumberFormat('en-US');
function number(value){return num.format(Number(value)||0);}
function timestamp(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():'—';}
function shortDate(value){if(!value)return '—';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'—';}
function isBanned(p){return Boolean(p.is_banned && (!p.banned_until || Date.parse(p.banned_until)>Date.now()));}
const errors={ADMIN_LOGIN_REQUIRED:'Please sign in again.',INVALID_CREDENTIALS:'Incorrect username or password.',BAD_ORIGIN:'Your site address does not match PUBLIC_URL.',RATE_LIMITED:'Too many requests. Try again shortly.',INVALID_CURRENCY_DELTA:'Enter a nonzero whole number between -1,000,000 and 1,000,000.',PLAYER_NOT_FOUND_OR_INVALID_BALANCE:'Player was not found or the balance would be invalid.',PLAYER_OR_ENABLED_ITEM_NOT_FOUND:'Player or enabled cosmetic was not found.',INVALID_BAN_EXPIRATION:'Enter a future date and time.',INVALID_CATALOG_ITEM:'Please check the cosmetic ID, catalog and name.'};
let currentPage='overview',username='',searchTerm='',playerOffset=0,catalog=[],eventStream=null,viewToken=0,toastTimer=null,modalClose=null,refreshTimer=null;
async function api(path,method='GET',data){
  const options={method,credentials:'same-origin',headers:{}};
  if(data!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data);}
  const res=await fetch('/api/v1/'+path,options);
  const payload=await res.json().catch(()=>({}));
  if(!res.ok){
    if(res.status===401 && path!=='admin/login')showLogin();
    const code=payload.error || 'HTTP '+res.status;
    throw Error(errors[code] || code.replaceAll('_',' ').toLowerCase());
  }
  return payload;
}
function toast(msg,bad=false){
  const node=$('toast');node.textContent=msg;node.classList.toggle('bad',bad);node.classList.remove('hidden');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.add('hidden'),4200);
}
function hideMobile(){ $('sidebar').classList.remove('open');$('mobileBackdrop').classList.add('hidden'); }
function showLogin(){
  eventStream?.close();eventStream=null;$('dashboard').classList.add('hidden');$('loginPage').classList.remove('hidden');$('loginPassword').value='';
}
function showDashboard(name){
  username=name;$('userLabel').textContent=name;$('loginPage').classList.add('hidden');$('dashboard').classList.remove('hidden');
  connect();navigate(currentPage);
}
function connect(){
  eventStream?.close();eventStream=new EventSource('/api/v1/admin/stream');
  eventStream.onopen=()=>{$('connection').textContent='Operational · Live';document.querySelectorAll('.status-dot').forEach(x=>x.classList.remove('offline'));};
  eventStream.onerror=()=>{$('connection').textContent='Reconnecting…';};
  eventStream.addEventListener('refresh',()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(!$('modalRoot').hasChildNodes())navigate(currentPage,false);},380);});
}
function titleBar(kicker,title,subtitle,actions=[]){
  return div('page-titlebar',[div('',[div('page-kicker',[kicker]),el('h1',{text:title}),el('p',{text:subtitle})]),div('row',actions)]);
}
function panel(title,subtitle='',actions=[]){
  const p=div('panel');
  if(title)p.append(div('panel-head',[div('',[el('h3',{text:title}),subtitle?small(subtitle):null]),div('row',actions)]));
  return p;
}
function metric(label,value,note,name,color=''){
  return div('metric',[div('metric-top',[el('span',{text:label}),div('metric-icon '+color,[icon(name,18)])]),el('strong',{text:number(value)}),small(note)]);
}
function table(headers,rows){
  const t=el('table');const h=el('thead'),head=el('tr');
  for(const label of headers)head.append(el('th',{text:label}));h.append(head);t.append(h);
  const b=el('tbody');
  for(const cells of rows){const row=el('tr');for(const value of cells){const td=el('td');td.append(value instanceof Node ? value:document.createTextNode(String(value ?? '')));row.append(td);}b.append(row);}
  t.append(b);return div('table-wrap',[t]);
}
function empty(message,subtitle){return div('empty',[el('strong',{text:message}),el('span',{text:subtitle})]);}
function menuActive(page){
  document.querySelectorAll('.nav-item').forEach(n=>{const selected=n.dataset.page===page;n.classList.toggle('active',selected);if(selected)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});
  $('breadcrumbPage').textContent=pages[page];hideMobile();
}
async function navigate(page,updateNav=true){
  currentPage=pages[page]?page:'overview';const token=++viewToken;
  if(updateNav)menuActive(currentPage);
  const root=$('mainContent');root.replaceChildren(div('empty',[el('strong',{text:'Loading workspace…'}),'Fetching the latest Monka VR data']));
  try{
    let component;
    if(currentPage==='overview')component=await overview();
    if(currentPage==='players')component=await playersPage();
    if(currentPage==='catalog')component=await catalogPage();
    if(currentPage==='config')component=await settingsPage();
    if(currentPage==='audit')component=await auditPage();
    if(token===viewToken)root.replaceChildren(component);
  }catch(e){if(token===viewToken)root.replaceChildren(empty('Unable to load this page',e.message));}
}
function graph(rows){
  const values=rows.map(r=>Number(r.players)||0);const max=Math.max(1,...values);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 640 230');svg.setAttribute('role','img');svg.setAttribute('aria-label','Player registrations during the past 14 days');
  for(let i=0;i<=4;i++){
    const y=20+i*43;const line=document.createElementNS(svg.namespaceURI,'line');
    for(const [k,v] of Object.entries({x1:10,x2:630,y1:y,y2:y,stroke:'#30423b','stroke-width':1,'stroke-dasharray':'3 6'}))line.setAttribute(k,v);
    svg.append(line);
  }
  rows.forEach((r,i)=>{
    const x=18+i*44.2;const h=(Number(r.players)||0)/max*168;const bar=document.createElementNS(svg.namespaceURI,'rect');
    for(const [k,v] of Object.entries({x,y:192-h,width:24,height:Math.max(3,h),rx:5,fill:i===rows.length-1?'#b5f5be':'#315c45'}))bar.setAttribute(k,v);
    const hint=document.createElementNS(svg.namespaceURI,'title');hint.textContent=r.day+': '+r.players+' new players';bar.append(hint);svg.append(bar);
    const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',x+12);label.setAttribute('y',215);label.setAttribute('fill','#739285');label.setAttribute('font-size','10');label.setAttribute('text-anchor','middle');
    label.textContent=(i%3===0||i===rows.length-1)?shortDate(r.day+'T12:00:00'):'';svg.append(label);
  });
  return div('chart',[svg]);
}
function activityRow(e){
  return div('activity-row',[div('activity-symbol',[icon(e.action.includes('coins')?'wallet':e.action.includes('ban')?'shield':e.action.includes('config')?'sliders':'activity',15)]),div('',[el('strong',{text:e.action.replaceAll('.',' · ')}),small(e.actor+' → '+e.target)]),el('span',{class:'activity-time',text:shortDate(e.created_at)})]);
}
async function overview(){
  const d=await api('admin/overview');
  const root=div('page');
  root.append(titleBar('WORKSPACE / HOME','Overview','Here is what is happening in Monka VR right now.',[button('Refresh',()=>navigate('overview'), 'button','refresh')]));
  const hero=div('hero',[div('hero-copy',[div('hero-badge',[el('span',{class:'pulse'}),' ALL SYSTEMS MONITORED']),el('h2',{text:'Your game. In your control.'}),el('p',{text:'Manage your community, secure multiplayer authentication and keep player progression running smoothly—all from one place.'}),div('row hero-actions',[button('Manage players',()=>navigate('players'),'primary','users'),button('Game configuration',()=>navigate('config'),'button','sliders')])])]);
  root.append(hero,div('metric-grid',[
    metric('Total players',d.players,'Registered profiles','users'),
    metric('Active today',d.active24h,'Seen during the last 24h','activity','alt'),
    metric('Monka Bucks',d.total_coins,'MB in player wallets','wallet','warm'),
    metric('Active bans',d.banned,'Currently suspended','shield','red')
  ]));
  const p=panel('New player registrations','Daily registrations · Past 14 days');
  p.append(graph(d.trend || []),div('chart-foot',[el('span',{text:'14 DAYS AGO'}),el('span',{text:'TODAY'})]));
  const a=panel('Recent activity','Administrative events and changes',[button('View all',()=>navigate('audit'),'button small','arrow')]);
  if(!d.recent?.length)a.append(empty('No activity yet','Actions you take will be recorded here.'));
  else for(const row of d.recent)a.append(activityRow(row));
  root.append(div('layout-two',[p,a]));
  const status=panel('Infrastructure','MonkaMemory is your private Monka VR backend.');
  status.append(div('setting-row',[div('',[el('div',{class:'setting-name',text:'Neon PostgreSQL'}),el('div',{class:'setting-description',text:'Player identity, inventory, coins and configuration'})]),badge('CONNECTED')]),div('foot-stats',[el('span',{text:'API STATUS · ONLINE'}),el('span',{text:'PHOTON MULTIPLAYER · EXTERNAL SERVICE'})]));
  root.append(status);return root;
}
async function playersPage(){
  const d=await api('admin/players?q='+encodeURIComponent(searchTerm)+'&offset='+playerOffset);
  const root=div('page');
  root.append(titleBar('COMMUNITY / ACCOUNTS','Player management','Search, moderate and manage game profiles.',[button('Refresh',()=>navigate('players'),'button','refresh')]));
  const p=panel('Player directory','Found '+number(d.total)+' matching player profiles');
  const search=el('input',{placeholder:'Search by player name or UUID',value:searchTerm,'aria-label':'Search players'});
  const wrap=div('search-wrap',[icon('search',17),search]);
  const searchNow=()=>{searchTerm=search.value.trim();playerOffset=0;navigate('players')};
  search.addEventListener('keydown',e=>{if(e.key==='Enter')searchNow();});
  p.append(div('toolbar',[wrap,div('row',[button('Search',searchNow,'primary','search'),small(number(d.total)+' PLAYERS','page-count')])]));
  const rows=d.players.map(p=>{
    const avatar=div('table-avatar',[p.display_name.slice(0,1).toUpperCase()]);
    return [div('table-identity',[avatar,div('',[el('strong',{text:p.display_name}),el('small',{text:p.id})])]),el('span',{class:'mono',text:number(p.coins)+' MB'}),isBanned(p)?badge('BANNED',true):badge('ACTIVE'),timestamp(p.last_seen_at),button('Manage',()=>openPlayer(p.id),'button small','edit')];
  });
  p.append(rows.length?table(['PLAYER','WALLET','STATUS','LAST SEEN','ACTIONS'],rows):empty('No players found','Try another name or player ID.'));
  p.append(div('pagination',[el('span',{text:number(d.offset+1)+'–'+number(Math.min(d.offset+d.players.length,d.total))+' of '+number(d.total)}),button('Previous',()=>{playerOffset=Math.max(0,playerOffset-50);navigate('players')},'button small'),button('Next',()=>{playerOffset+=50;navigate('players')},'button small')]));
  const pager=p.querySelector('.pagination');const buttons=pager.querySelectorAll('button');buttons[0].disabled=d.offset===0;buttons[1].disabled=d.offset+d.players.length>=d.total;
  root.append(p);return root;
}
function modal(title,subtitle){
  $('modalRoot').replaceChildren();
  const back=div('modal-backdrop'),box=div('modal');
  const close=()=>{$('modalRoot').replaceChildren();modalClose=null;document.removeEventListener('keydown',esc);};
  const esc=e=>{if(e.key==='Escape')close();};
  const head=div('modal-head',[div('',[el('h3',{text:title}),el('p',{text:subtitle})]),button('Close',close,'button small','close')]);
  box.append(head);back.append(box);$('modalRoot').append(back);
  back.addEventListener('click',e=>{if(e.target===back)close();});document.addEventListener('keydown',esc);modalClose=close;
  return {box,close};
}
async function openPlayer(id){
  try{
    const d=await api('admin/players/'+id);
    const p=d.player;const {box,close}=modal(p.display_name,p.id);
    const info=div('modal-section',[div('detail-chips',[badge(isBanned(p)?'BANNED':'ACTIVE',isBanned(p)),el('span',{class:'chip',text:number(p.coins)+' MB'}),el('span',{class:'chip',text:'Joined '+shortDate(p.created_at)})]),el('p',{class:'hint',text:'Last seen: '+timestamp(p.last_seen_at)})]);
    box.append(info);
    const currency=div('modal-section',[el('h4',{text:'Adjust Monka Bucks'})]);
    const amount=field('Amount to add or subtract','Example: 200 or -100','number');
    amount.input.setAttribute('step','1');const reason=field('Reason for adjustment','Staff adjustment');
    currency.append(amount.wrapper,reason.wrapper,button('Apply currency change',async()=>{
      const delta=Number(amount.input.value);
      if(!Number.isInteger(delta)||delta===0){toast('Enter a nonzero whole-number amount',true);return;}
      try{await api('admin/players/'+id+'/coins','POST',{delta,reason:reason.input.value});toast('Currency balance updated');close();navigate('players');}catch(e){toast(e.message,true);}
    },'primary','wallet'));box.append(currency);
    const items=div('modal-section',[el('h4',{text:'Cosmetic inventory'})]);
    const owned=div('detail-chips',d.inventory.length?d.inventory.map(item=>el('span',{class:'chip',text:item.display_name+' ('+item.item_id+')'})):[small('No cosmetics owned yet.')]);
    const selection=el('select',{'aria-label':'Choose catalog item'});selection.append(el('option',{value:'',text:'Select a cosmetic'}));
    const inventoryCatalog=(await api('admin/catalog')).items;
    for(const item of inventoryCatalog)selection.append(el('option',{value:item.item_id,text:item.display_name+' · '+item.item_id,disabled:!item.enabled}));
    items.append(owned,div('field',[el('label',{text:'Catalog item'}),selection]),div('action-grid',[
      button('Grant cosmetic',async()=>{if(!selection.value){toast('Choose a cosmetic first',true);return;}try{await api('admin/players/'+id+'/items','POST',{itemId:selection.value});toast('Cosmetic granted');close();navigate('players');}catch(e){toast(e.message,true);}},'primary','plus'),
      button('Revoke cosmetic',async()=>{if(!selection.value){toast('Choose a cosmetic first',true);return;}try{await api('admin/players/'+id+'/items','DELETE',{itemId:selection.value});toast('Cosmetic revoked');close();navigate('players');}catch(e){toast(e.message,true);}},'button','close')
    ]));box.append(items);
    const bans=div('modal-section',[el('h4',{text:'Access and moderation'})]);
    const bReason=field('Ban reason','Rule violation');
    const until=field('Ban expiration in UTC (blank = permanent)','YYYY-MM-DDTHH:MM:SSZ');
    bans.append(bReason.wrapper,until.wrapper,div('action-grid',[
      button('Ban player',async()=>{
        if(!window.confirm('Ban '+p.display_name+' from Monka VR?'))return;
        try{await api('admin/players/'+id+'/ban','POST',{reason:bReason.input.value||'Rule violation',until:until.input.value||null});toast('Player banned');close();navigate('players');}catch(e){toast(e.message,true);}
      },'button danger','shield'),
      button('Unban player',async()=>{try{await api('admin/players/'+id+'/unban','POST',{});toast('Player unbanned');close();navigate('players');}catch(e){toast(e.message,true);}},'button','check')
    ]));box.append(bans);
    const ledger=div('modal-section',[el('h4',{text:'Currency history'})]);
    if(!d.ledger.length)ledger.append(small('No currency adjustments recorded.'));
    else ledger.append(div('ledger-list',d.ledger.map(t=>div('ledger-row',[div('',[el('strong',{text:t.reason}),small(timestamp(t.created_at)+' · '+t.actor)]),div(t.delta>0?'plus':'minus',[el('strong',{text:(t.delta>0?'+':'')+number(t.delta)+' MB'}),small('Balance '+number(t.balance_after))])]))));
    box.append(ledger);
  }catch(e){toast(e.message,true);}
}
async function catalogPage(){
  const d=await api('admin/catalog');catalog=d.items;
  const root=div('page');root.append(titleBar('ITEMS / COLLECTION','Cosmetic catalog','Create and manage Monka VR cosmetics and unlockable items.'));
  const p=panel('Add or update a cosmetic','Item IDs must match Unity GameObject names exactly.');
  const id=field('Item ID','Example: party_hat'),cat=field('Catalog','main','text','main'),name=field('Display name','Party Hat');
  const status=el('select');status.append(el('option',{value:'true',text:'Enabled'}),el('option',{value:'false',text:'Disabled'}));
  const statusWrap=div('field',[el('label',{text:'Availability'}),status]);
  const form=el('form',{class:'form-grid'},[id.wrapper,cat.wrapper,name.wrapper,statusWrap,div('form-actions',[el('button',{class:'primary',type:'submit'},[icon('plus'),'Save cosmetic'])])]);
  const saveButton=form.querySelector('button[type=submit]');
  form.addEventListener('submit',async e=>{
    e.preventDefault();saveButton.disabled=true;
    try{await api('admin/catalog','POST',{itemId:id.input.value.trim(),catalog:cat.input.value.trim(),displayName:name.input.value.trim(),enabled:status.value==='true'});toast('Catalog updated successfully');navigate('catalog');}
    catch(err){toast(err.message,true);}finally{saveButton.disabled=false;}
  });
  p.append(form);root.append(p);
  const list=panel('Catalog items',number(catalog.length)+' items configured');
  list.append(catalog.length?table(['ITEM','CATALOG','AVAILABILITY','ACTIONS'],catalog.map(item=>[
    div('table-identity',[div('table-avatar',[icon('box',16)]),div('',[el('strong',{text:item.display_name}),el('small',{text:item.item_id})])]),
    el('span',{class:'mono',text:item.catalog}),badge(item.enabled?'ENABLED':'DISABLED',!item.enabled),
    button('Edit',()=>{id.input.value=item.item_id;cat.input.value=item.catalog;name.input.value=item.display_name;status.value=String(item.enabled);id.input.focus();window.scrollTo({top:0,behavior:'smooth'});},'button small','edit')
  ])):empty('Your catalog is empty','Add your first cosmetic using the form above.'));
  root.append(list);return root;
}
async function settingsPage(){
  const {config:cfg}=await api('admin/config');
  const root=div('page');root.append(titleBar('GAME / CONFIGURATION','Game settings','Changes are saved to Neon and served to Monka VR clients.'));
  const p=panel('Public game configuration','Configure in-game messages, version gating and maintenance.');
  const motd=field('Message of the day','Welcome to Monka VR','textarea',cfg.MOTD||'');
  motd.input.setAttribute('maxlength','1000');const version=field('Minimum client version','0.0.0','text',cfg.MinimumClientVersion||'0.0.0');
  const maintenance=el('select');maintenance.append(el('option',{value:'false',text:'Off — players can join'}),el('option',{value:'true',text:'On — new logins blocked'}));maintenance.value=cfg.MaintenanceMode||'false';
  const form=el('form',{class:'form-grid'},[div('field span',[motd.wrapper]),version.wrapper,div('field',[el('label',{text:'Maintenance mode'}),maintenance]),div('form-actions',[el('button',{class:'primary',type:'submit'},[icon('check'),'Save game settings'])])]);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const b=form.querySelector('button[type=submit]');b.disabled=true;
    try{
      const values={MOTD:motd.input.value,MinimumClientVersion:version.input.value,MaintenanceMode:maintenance.value};
      for(const [key,value] of Object.entries(values))if(value!==cfg[key])await api('admin/config','PUT',{key,value});
      toast('Game settings saved');navigate('config');
    }catch(err){toast(err.message,true);}finally{b.disabled=false;}
  });
  p.append(form);root.append(p);
  const notice=panel('How updates work','Realtime and multiplayer behavior');
  notice.append(div('note',[el('strong',{text:'Configuration is stored on Neon.'}),el('p',{text:'The dashboard receives live refresh notifications through server-sent events. Unity refreshes player state on an interval. Photon PUN 2 still manages room networking and its custom-auth provider must be configured separately.'})]));
  root.append(notice);return root;
}
async function auditPage(){
  const d=await api('admin/audit');const root=div('page');
  root.append(titleBar('SYSTEM / HISTORY','Activity log','Trace account moderation, inventory and game configuration updates.',[button('Refresh',()=>navigate('audit'),'button','refresh')]));
  const p=panel('Administrative actions',number(d.events.length)+' recent entries');
  p.append(d.events.length?table(['EVENT','ACTOR','TARGET','WHEN'],d.events.map(r=>[
    div('table-identity',[div('table-avatar',[icon('activity',15)]),el('strong',{text:r.action.replaceAll('.',' / ')})]),
    el('span',{text:r.actor}),el('span',{class:'mono',text:r.target}),timestamp(r.created_at)
  ])):empty('No activity recorded','Moderation and settings changes appear here.'));
  root.append(p);return root;
}
document.querySelectorAll('[data-icon]').forEach(n=>n.replaceChildren(icon(n.dataset.icon)));
document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>navigate(n.dataset.page)));
$('sidebarOpen').addEventListener('click',()=>{$('sidebar').classList.add('open');$('mobileBackdrop').classList.remove('hidden');});
$('sidebarClose').addEventListener('click',hideMobile);$('mobileBackdrop').addEventListener('click',hideMobile);
$('togglePassword').addEventListener('click',()=>{const p=$('loginPassword');p.type=p.type==='password'?'text':'password';$('togglePassword').textContent=p.type==='password'?'Show':'Hide';});
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();$('loginError').textContent='';
  const b=$('loginButton');b.disabled=true;
  try{const d=await api('admin/login','POST',{username:$('loginUsername').value,password:$('loginPassword').value});showDashboard(d.username);}
  catch(err){$('loginError').textContent=err.message;}finally{b.disabled=false;}
});
$('logoutBtn').addEventListener('click',async()=>{try{await api('admin/logout','POST',{});}catch{}showLogin();});
api('admin/me').then(x=>showDashboard(x.username)).catch(()=>showLogin());
