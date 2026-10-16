const API='https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1';
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const state={fixtures:[],filter:'past',search:'',match:null,summary:null,minute:0,home:null,away:null,completed:false,endMinute:null};
const els={listView:$('#listView'),matchView:$('#matchView'),matchList:$('#matchList'),loadingMatches:$('#loadingMatches'),listError:$('#listError'),matchLoading:$('#matchLoading'),matchContent:$('#matchContent'),matchError:$('#matchError'),back:$('#backBtn'),slider:$('#minuteSlider'),minute:$('#minuteInput')};

function monthKey(offset=0){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+offset);return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`}
function dateParts(iso){const d=new Date(iso);return {day:d.toLocaleDateString(undefined,{weekday:'short'}).toUpperCase(),date:d.toLocaleDateString(undefined,{month:'short',day:'numeric'}).toUpperCase(),time:d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function show(el,yes=true){el.classList.toggle('hidden',!yes)}

async function loadFixtures(){
  show(els.loadingMatches); show(els.listError,false); els.matchList.innerHTML='';
  try{
    const months=[-3,-2,-1,0,1].map(monthKey);
    const payloads=await Promise.all(months.map(async m=>{const r=await fetch(`${API}/scoreboard?dates=${m}`);if(!r.ok)throw new Error(`Fixture feed returned ${r.status}`);return r.json()}));
    const seen=new Set(); state.fixtures=payloads.flatMap(x=>x.events||[]).filter(e=>!seen.has(e.id)&&seen.add(e.id)).map(e=>{
      const c=e.competitions?.[0]; const home=c?.competitors?.find(x=>x.homeAway==='home'); const away=c?.competitors?.find(x=>x.homeAway==='away');
      return {id:e.id,date:e.date||c?.date,home:home?.team,away:away?.team};
    }).filter(x=>x.home&&x.away&&x.date);
    show(els.loadingMatches,false); renderFixtures();
    const id=new URLSearchParams(location.hash.replace(/^#/,'')).get('match'); if(id) openMatch({id},false);
  }catch(err){show(els.loadingMatches,false); els.listError.innerHTML=`<strong>Couldn't load Premier League fixtures.</strong><br>${escapeHtml(err.message)}<br><small>Try refresh. This app uses ESPN's public soccer feed directly from your browser.</small>`;show(els.listError)}
}

function renderFixtures(){
  const now=Date.now(); const q=state.search.toLowerCase().trim();
  let items=state.fixtures.filter(f=>state.filter==='past'?new Date(f.date).getTime()<=now:new Date(f.date).getTime()>now)
    .filter(f=>!q||f.home.displayName.toLowerCase().includes(q)||f.away.displayName.toLowerCase().includes(q));
  items.sort((a,b)=>state.filter==='past'?new Date(b.date)-new Date(a.date):new Date(a.date)-new Date(b.date));
  items=items.slice(0,50); els.matchList.innerHTML='';
  if(!items.length){els.matchList.innerHTML='<div class="empty-events">No matches found.</div>';return}
  const tpl=$('#matchTemplate'); items.forEach(f=>{const node=tpl.content.cloneNode(true);const card=node.querySelector('.match-card');const d=dateParts(f.date);node.querySelector('.day').textContent=d.day;node.querySelector('.date').textContent=d.date;node.querySelector('.time').textContent=d.time;node.querySelector('.home-name').textContent=f.home.shortDisplayName||f.home.displayName;node.querySelector('.away-name').textContent=f.away.shortDisplayName||f.away.displayName;node.querySelector('.home-logo').src=f.home.logo||'';node.querySelector('.away-logo').src=f.away.logo||'';card.addEventListener('click',()=>openMatch(f));els.matchList.appendChild(node)})
}

async function openMatch(fixture,push=true){
  state.match=fixture; state.summary=null; state.endMinute=null; state.completed=false; show(els.listView,false);show(els.matchView);show(els.back);show(els.matchLoading);show(els.matchContent,false);show(els.matchError,false);window.scrollTo({top:0,behavior:'instant'});
  if(push) history.pushState({match:fixture.id},'',`#match=${fixture.id}`);
  try{
    const r=await fetch(`${API}/summary?event=${fixture.id}`);if(!r.ok)throw new Error(`Match feed returned ${r.status}`);const data=await r.json();state.summary=data;
    const comp=data.header?.competitions?.[0]; state.home=comp?.competitors?.find(x=>x.homeAway==='home'); state.away=comp?.competitors?.find(x=>x.homeAway==='away');
    if(!state.home||!state.away)throw new Error('Team data is not available for this match yet.');
    state.completed=Boolean(comp?.status?.type?.completed); state.endMinute=detectEndMinute();
    const key=`catchup:${fixture.id}`; state.minute=Math.max(0,Math.min(120,Number(localStorage.getItem(key)||0)));
    hydrateMatch(); show(els.matchLoading,false);show(els.matchContent); renderAtMinute(state.minute);
  }catch(err){show(els.matchLoading,false);els.matchError.innerHTML=`<strong>Couldn't build this match timeline.</strong><br>${escapeHtml(err.message)}`;show(els.matchError)}
}

function hydrateMatch(){
  const comp=state.summary.header.competitions[0]; const ht=state.home.team,at=state.away.team;
  $('#homeName').textContent=ht.shortDisplayName||ht.displayName;$('#awayName').textContent=at.shortDisplayName||at.displayName;$('#homeLogo').src=ht.logos?.[0]?.href||ht.logo||'';$('#awayLogo').src=at.logos?.[0]?.href||at.logo||'';
  $('#matchDate').textContent=new Date(comp.date).toLocaleString(undefined,{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'});
  const homeColor=pickTeamColor(ht,'#91ffc8'); const awayColor=pickTeamColor(at,'#d8ff58',homeColor); document.documentElement.style.setProperty('--home-color',homeColor);document.documentElement.style.setProperty('--away-color',awayColor);
  const sliderMax=state.completed&&state.endMinute?state.endMinute:105;els.slider.max=sliderMax;els.slider.value=Math.min(state.minute,sliderMax);els.minute.value=state.minute;$('#ftTick').textContent=state.completed&&state.endMinute?`${state.endMinute}' FT`:'FT';
  const hasCommentary=(state.summary.commentary||[]).length>0;$('#dataCaveat').textContent=hasCommentary?'':'Detailed timestamped commentary is unavailable for this match, so only major events can be shown safely.';show($('#dataCaveat'),!hasCommentary);
}

function cleanHex(v){const s=String(v||'').replace('#','').trim();return /^[0-9a-f]{6}$/i.test(s)?`#${s}`:null}
function rgb(hex){const n=parseInt(hex.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]}
function brightness(hex){const [r,g,b]=rgb(hex);return .299*r+.587*g+.114*b}
function colorDistance(a,b){const x=rgb(a),y=rgb(b);return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])}
function pickTeamColor(team,fallback,against=null){const choices=[cleanHex(team?.color),cleanHex(team?.alternateColor)].filter(Boolean);let chosen=choices.find(c=>brightness(c)>48)||choices[0]||fallback;if(against&&colorDistance(chosen,against)<55){const alt=choices.find(c=>c!==chosen&&colorDistance(c,against)>=55&&brightness(c)>48);if(alt)chosen=alt}return chosen}

function clockMinute(clock){const s=clock?.displayValue||clock||'';const m=String(s).match(/(\d+)'?(?:\+(\d+))?/);if(m)return Number(m[1])+(Number(m[2])||0);const val=clock?.value;return Number.isFinite(val)?Math.floor(val/60):0}
function eventMinute(e){return clockMinute(e.clock||e.time)}
function detectEndMinute(){
  const commentary=state.summary?.commentary||[];const ending=commentary.filter(c=>/^(match ends|second half ends)/i.test((c.text||'').trim())).map(eventMinute).filter(Boolean);
  if(ending.length)return Math.max(...ending);
  if(!state.completed)return null;
  const all=[...commentary,...(state.summary.keyEvents||[]),...(state.summary.header?.competitions?.[0]?.details||[])].map(eventMinute).filter(n=>Number.isFinite(n)&&n>0);return all.length?Math.max(...all):90;
}
function normalizeName(s=''){return String(s).toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
function sideByName(name){const n=normalizeName(name);if(!n)return null;const teams=[['home',state.home?.team],['away',state.away?.team]];for(const [side,t] of teams){const names=[t?.displayName,t?.shortDisplayName,t?.name,t?.location].map(normalizeName).filter(Boolean);if(names.some(x=>x===n||x.includes(n)||n.includes(x)))return side}return null}
function teamSideFrom(item){const p=item?.play||item||{};const id=String(p.team?.id||item?.team?.id||'');if(id&&id===String(state.home?.team?.id))return'home';if(id&&id===String(state.away?.team?.id))return'away';return sideByName(p.team?.displayName||p.team?.name||item?.team?.displayName||item?.team?.name)}
function cornerSide(item){const text=(item?.text||item?.play?.text||'');const m=text.match(/^Corner,\s*(.+?)(?:\.|\n|$)/i);return m?sideByName(m[1]):null}
function isGoal(e){const t=typeText(e);return e.scoringPlay===true||(t.includes('goal')&&!t.includes('goal-kick'))}
function typeText(e){return String(e?.type?.type||e?.type?.text||'').toLowerCase()}
function filteredMajor(minute){return (state.summary.keyEvents||state.summary.header?.competitions?.[0]?.details||[]).filter(e=>eventMinute(e)<=minute).filter(e=>{const t=typeText(e);return isGoal(e)||t.includes('substitution')||t.includes('yellow')||t.includes('red-card')||t.includes('red card')||t.includes('penalty-missed')||e.yellowCard||e.redCard||e.substitution})}

function reconstruct(minute){
  const stats={home:{shots:0,onTarget:0,corners:0,fouls:0,offsides:0,yellow:0,red:0},away:{shots:0,onTarget:0,corners:0,fouls:0,offsides:0,yellow:0,red:0}};
  const commentary=(state.summary.commentary||[]).filter(c=>eventMinute(c)<=minute);const seen=new Set();
  commentary.forEach(c=>{const p=c.play||c;const key=p.id?String(p.id):`seq:${c.sequence}`;if(seen.has(key))return;seen.add(key);const t=typeText(p);const txt=String(c.text||p.text||'').trim();const lower=txt.toLowerCase();
    const shot=t.includes('shot')||t.includes('goal')||/^attempt\b/i.test(txt)||/^goal!/i.test(txt);if(shot){const side=teamSideFrom(c);if(side){stats[side].shots++;if(t.includes('on-target')||t.includes('on target')||t.includes('goal')||/^attempt saved/i.test(txt)||/^goal!/i.test(txt))stats[side].onTarget++}}
    if(t.includes('corner')||lower.startsWith('corner,')){const side=cornerSide(c);if(side)stats[side].corners++}
    if(t==='foul'||t.includes('foul')||lower.startsWith('foul by')){const side=teamSideFrom(c);if(side)stats[side].fouls++}
    if(t.includes('offside')||lower.startsWith('offside,')){const side=teamSideFrom(c);if(side)stats[side].offsides++}
  });
  const major=filteredMajor(minute);major.forEach(e=>{const side=teamSideFrom(e);if(!side)return;const t=typeText(e);if(t.includes('yellow')||e.yellowCard)stats[side].yellow++;if(t.includes('red-card')||t.includes('red card')||e.redCard)stats[side].red++});
  const score={home:0,away:0};major.filter(isGoal).forEach(e=>{const side=teamSideFrom(e);if(side)score[side]++});
  return {stats,major,score};
}

function renderAtMinute(value){
  const requested=Math.max(0,Math.min(120,Math.round(Number(value)||0)));const effective=state.completed&&state.endMinute?Math.min(requested,state.endMinute):requested;state.minute=requested;els.slider.value=Math.min(requested,Number(els.slider.max));els.minute.value=requested;localStorage.setItem(`catchup:${state.match.id}`,requested);
  const r=reconstruct(effective);$('#homeScore').textContent=r.score.home;$('#awayScore').textContent=r.score.away;
  const ended=Boolean(state.completed&&state.endMinute&&requested>=state.endMinute);if(ended){$('#scoreAsOf').textContent=`FULL TIME · ${state.endMinute}'`;$('#statsStatus').textContent=`FINAL · ${state.endMinute}'`;$('#matchEndedNotice').textContent=requested>state.endMinute?`The match was already over by ${requested}'. Full time was ${state.endMinute}'.`:`Full time · the match ended at ${state.endMinute}'.`;show($('#matchEndedNotice'))}else{$('#scoreAsOf').textContent=`AT ${requested}'`;$('#statsStatus').textContent=`THROUGH ${requested}'`;show($('#matchEndedNotice'),false)}
  renderStats(r.stats);renderTimeline(r.major);$('#eventCount').textContent=`${r.major.length} EVENT${r.major.length===1?'':'S'}`;
}
function statRow(label,key,h,a){const total=h+a||1;const hp=Math.round(h/total*100),ap=100-hp;return `<div class="stat-row"><span class="num">${h}</span><span class="bar"><i style="width:${hp}%"></i></span><span class="stat-label">${label}</span><span class="bar away"><i style="width:${ap}%"></i></span><span class="num">${a}</span></div>`}
function renderStats(s){const rows=[['Shots','shots'],['On target','onTarget'],['Corners','corners'],['Fouls','fouls'],['Offsides','offsides'],['Yellow cards','yellow'],['Red cards','red']];$('#statsRows').innerHTML=rows.map(([l,k])=>statRow(l,k,s.home[k],s.away[k])).join('')}
function eventInfo(e){const t=typeText(e),txt=e.text||'';if(isGoal(e)){const scorer=e.participants?.[0]?.athlete?.displayName||'Goal';const assist=(txt.match(/Assisted by ([^.]+)/i)||[])[1];return{icon:'⚽',title:`Goal · ${scorer}`,detail:assist?`Assist: ${assist}`:(t.includes('own')?'Own goal':'')}}if(t.includes('substitution')||e.substitution)return{icon:'↔',title:'Substitution',detail:txt};if(t.includes('red-card')||t.includes('red card')||e.redCard)return{icon:'■',title:'Red card',detail:txt};if(t.includes('yellow')||e.yellowCard)return{icon:'▪',title:'Yellow card',detail:txt};if(t.includes('penalty-missed'))return{icon:'×',title:'Penalty missed',detail:txt};return{icon:'•',title:e.type?.text||'Event',detail:txt}}
function renderTimeline(events){const el=$('#timeline');if(!events.length){el.innerHTML='<div class="empty-events">Nothing major has happened yet. Safe to keep watching.</div>';return}el.innerHTML=events.sort((a,b)=>eventMinute(a)-eventMinute(b)).map(e=>{const x=eventInfo(e);const side=teamSideFrom(e);const team=side==='home'?state.home.team.shortDisplayName:side==='away'?state.away.team.shortDisplayName:'';return `<article class="event ${side?`${side}-event`:''}"><span class="event-icon">${x.icon}</span><span class="event-minute">${escapeHtml(e.clock?.displayValue||`${eventMinute(e)}'`)}</span><div class="event-card"><strong>${escapeHtml(x.title)}${team?` · ${escapeHtml(team)}`:''}</strong>${x.detail?`<p>${escapeHtml(x.detail)}</p>`:''}</div></article>`}).join('')}

function goHome(push=true){state.match=null;state.summary=null;show(els.matchView,false);show(els.listView);show(els.back,false);if(push)history.pushState({},'',location.pathname+location.search);window.scrollTo({top:0,behavior:'instant'})}
$$('.segment').forEach(b=>b.addEventListener('click',()=>{$$('.segment').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;renderFixtures()}));
$('#teamSearch').addEventListener('input',e=>{state.search=e.target.value;renderFixtures()});$('#refreshBtn').addEventListener('click',loadFixtures);els.back.addEventListener('click',()=>history.back());$('#homeLink').addEventListener('click',e=>{e.preventDefault();goHome()});els.slider.addEventListener('input',e=>renderAtMinute(e.target.value));els.minute.addEventListener('change',e=>renderAtMinute(e.target.value));$$('.quick-times button').forEach(b=>b.addEventListener('click',()=>renderAtMinute(b.dataset.minute)));
window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.hash.replace(/^#/,'')).get('match');if(id)openMatch({id},false);else goHome(false)});
loadFixtures();
