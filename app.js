const API='https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1';
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const state={fixtures:[],filter:'past',search:'',match:null,summary:null,minute:0,home:null,away:null};
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
      return {id:e.id,date:e.date||c?.date,home:home?.team,away:away?.team}; // scores intentionally discarded here
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
  state.match=fixture; state.summary=null; show(els.listView,false);show(els.matchView);show(els.back);show(els.matchLoading);show(els.matchContent,false);show(els.matchError,false);window.scrollTo({top:0,behavior:'instant'});
  if(push) history.pushState({match:fixture.id},'',`#match=${fixture.id}`);
  try{
    const r=await fetch(`${API}/summary?event=${fixture.id}`);if(!r.ok)throw new Error(`Match feed returned ${r.status}`);const data=await r.json();state.summary=data;
    const comp=data.header?.competitions?.[0]; state.home=comp?.competitors?.find(x=>x.homeAway==='home'); state.away=comp?.competitors?.find(x=>x.homeAway==='away');
    if(!state.home||!state.away)throw new Error('Team data is not available for this match yet.');
    const key=`catchup:${fixture.id}`; state.minute=Math.max(0,Math.min(105,Number(localStorage.getItem(key)||0)));
    hydrateMatch(); show(els.matchLoading,false);show(els.matchContent); renderAtMinute(state.minute);
  }catch(err){show(els.matchLoading,false);els.matchError.innerHTML=`<strong>Couldn't build this match timeline.</strong><br>${escapeHtml(err.message)}`;show(els.matchError)}
}

function hydrateMatch(){
  const comp=state.summary.header.competitions[0]; const ht=state.home.team,at=state.away.team;
  $('#homeName').textContent=ht.shortDisplayName||ht.displayName;$('#awayName').textContent=at.shortDisplayName||at.displayName;$('#homeLogo').src=ht.logos?.[0]?.href||ht.logo||'';$('#awayLogo').src=at.logos?.[0]?.href||at.logo||'';
  $('#matchDate').textContent=new Date(comp.date).toLocaleString(undefined,{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'});
  els.slider.value=state.minute;els.minute.value=state.minute;
  const hasCommentary=(state.summary.commentary||[]).length>0;$('#dataCaveat').textContent=hasCommentary?'Stats are reconstructed from timestamped match events, not final box-score totals. Some provider commentary can omit individual actions.':'Detailed timestamped commentary is unavailable for this match, so only major events can be shown safely.';show($('#dataCaveat'),!hasCommentary);
}

function clockMinute(clock){const s=clock?.displayValue||clock||'';const m=String(s).match(/(\d+)'?(?:\+(\d+))?/);if(m)return Number(m[1])+(Number(m[2])||0);const val=clock?.value;return Number.isFinite(val)?Math.floor(val/60):0}
function eventMinute(e){return clockMinute(e.clock||e.time)}
function teamIdFrom(item){const play=item.play||item;return String(play.team?.id||item.team?.id||'')}
function teamSide(id){if(String(id)===String(state.home.team.id))return'home';if(String(id)===String(state.away.team.id))return'away';return null}
function isGoal(e){const t=(e.type?.type||e.type?.text||'').toLowerCase();return e.scoringPlay===true||t.includes('goal')&& !t.includes('goal-kick')}
function typeText(e){return (e.type?.type||e.type?.text||'').toLowerCase()}
function filteredMajor(minute){return (state.summary.keyEvents||state.summary.header?.competitions?.[0]?.details||[]).filter(e=>eventMinute(e)<=minute).filter(e=>{const t=typeText(e);return isGoal(e)||t.includes('substitution')||t.includes('yellow')||t.includes('red-card')||t.includes('penalty-missed')||e.yellowCard||e.redCard||e.substitution})}

function reconstruct(minute){
  const stats={home:{shots:0,onTarget:0,corners:0,fouls:0,offsides:0,yellow:0,red:0},away:{shots:0,onTarget:0,corners:0,fouls:0,offsides:0,yellow:0,red:0}};
  const shots=[]; const commentary=(state.summary.commentary||[]).filter(c=>eventMinute(c)<=minute);
  commentary.forEach(c=>{const txt=(c.text||'').trim().toLowerCase();const side=teamSide(teamIdFrom(c));if(!side)return;
    if(txt.startsWith('attempt ')||txt.startsWith('goal!')){stats[side].shots++;shots.push({minute:eventMinute(c),side});if(txt.startsWith('attempt saved')||txt.startsWith('goal!'))stats[side].onTarget++}
    if(txt.startsWith('corner,'))stats[side].corners++;
    if(txt.startsWith('foul by'))stats[side].fouls++;
    if(txt.startsWith('offside,'))stats[side].offsides++;
  });
  const major=filteredMajor(minute);major.forEach(e=>{const side=teamSide(teamIdFrom(e));if(!side)return;const t=typeText(e);if(t.includes('yellow')||e.yellowCard)stats[side].yellow++;if(t.includes('red-card')||e.redCard)stats[side].red++});
  const score={home:0,away:0};major.filter(isGoal).forEach(e=>{const side=teamSide(teamIdFrom(e));if(side)score[side]++});
  return {stats,shots,major,score};
}

function renderAtMinute(minute){minute=Math.max(0,Math.min(105,Math.round(Number(minute)||0)));state.minute=minute;els.slider.value=minute;els.minute.value=minute;localStorage.setItem(`catchup:${state.match.id}`,minute);
  const r=reconstruct(minute);$('#homeScore').textContent=r.score.home;$('#awayScore').textContent=r.score.away;$('#scoreAsOf').textContent=`AT ${minute}'`;$('#statsStatus').textContent=`THROUGH ${minute}'`;
  renderStats(r.stats);renderMomentum(r.shots,minute);renderTimeline(r.major);$('#eventCount').textContent=`${r.major.length} EVENT${r.major.length===1?'':'S'}`;
}
function statRow(label,key,h,a){const total=h+a||1;const hp=Math.round(h/total*100),ap=100-hp;return `<div class="stat-row"><span class="num">${h}</span><span class="bar"><i style="width:${hp}%"></i></span><span class="stat-label">${label}</span><span class="bar away"><i style="width:${ap}%"></i></span><span class="num">${a}</span></div>`}
function renderStats(s){const rows=[['Shots','shots'],['On target','onTarget'],['Corners','corners'],['Fouls','fouls'],['Offsides','offsides'],['Yellow cards','yellow'],['Red cards','red']];$('#statsRows').innerHTML=rows.map(([l,k])=>statRow(l,k,s.home[k],s.away[k])).join('')}
function renderMomentum(shots,minute){const count=Math.max(1,Math.ceil(Math.max(minute,5)/5));const buckets=Array.from({length:count},()=>({home:0,away:0}));shots.forEach(s=>{const i=Math.min(count-1,Math.floor(Math.max(0,s.minute-.01)/5));buckets[i][s.side]++});const max=Math.max(1,...buckets.flatMap(b=>[b.home,b.away]));$('#momentum').innerHTML=buckets.map((b,i)=>`<span class="bucket" title="${i*5}-${(i+1)*5} min: ${b.home}-${b.away} shots"><i style="height:${Math.max(3,b.home/max*92)}%"></i><i style="height:${Math.max(3,b.away/max*92)}%"></i></span>`).join('')}
function eventInfo(e){const t=typeText(e),txt=e.text||'';if(isGoal(e)){const scorer=e.participants?.[0]?.athlete?.displayName||'Goal';const assist=(txt.match(/Assisted by ([^.]+)/i)||[])[1];return{icon:'⚽',title:`Goal · ${scorer}`,detail:assist?`Assist: ${assist}`:(t.includes('own')?'Own goal':'')}}if(t.includes('substitution')||e.substitution)return{icon:'↔',title:'Substitution',detail:txt};if(t.includes('red-card')||e.redCard)return{icon:'■',title:'Red card',detail:txt};if(t.includes('yellow')||e.yellowCard)return{icon:'▪',title:'Yellow card',detail:txt};if(t.includes('penalty-missed'))return{icon:'×',title:'Penalty missed',detail:txt};return{icon:'•',title:e.type?.text||'Event',detail:txt}}
function renderTimeline(events){const el=$('#timeline');if(!events.length){el.innerHTML='<div class="empty-events">Nothing major has happened yet. Safe to keep watching.</div>';return}el.innerHTML=events.sort((a,b)=>eventMinute(a)-eventMinute(b)).map(e=>{const x=eventInfo(e);const side=teamSide(teamIdFrom(e));const team=side==='home'?state.home.team.shortDisplayName:side==='away'?state.away.team.shortDisplayName:'';return `<article class="event"><span class="event-icon">${x.icon}</span><span class="event-minute">${escapeHtml(e.clock?.displayValue||`${eventMinute(e)}'`)}</span><div class="event-card"><strong>${escapeHtml(x.title)}${team?` · ${escapeHtml(team)}`:''}</strong>${x.detail?`<p>${escapeHtml(x.detail)}</p>`:''}</div></article>`}).join('')}

function goHome(push=true){state.match=null;state.summary=null;show(els.matchView,false);show(els.listView);show(els.back,false);if(push)history.pushState({},'',location.pathname+location.search);window.scrollTo({top:0,behavior:'instant'})}
$$('.segment').forEach(b=>b.addEventListener('click',()=>{$$('.segment').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.filter=b.dataset.filter;renderFixtures()}));
$('#teamSearch').addEventListener('input',e=>{state.search=e.target.value;renderFixtures()});$('#refreshBtn').addEventListener('click',loadFixtures);els.back.addEventListener('click',()=>history.back());$('#homeLink').addEventListener('click',e=>{e.preventDefault();goHome()});els.slider.addEventListener('input',e=>renderAtMinute(e.target.value));els.minute.addEventListener('change',e=>renderAtMinute(e.target.value));$$('.quick-times button').forEach(b=>b.addEventListener('click',()=>renderAtMinute(b.dataset.minute)));
window.addEventListener('popstate',()=>{const id=new URLSearchParams(location.hash.replace(/^#/,'')).get('match');if(id)openMatch({id},false);else goHome(false)});
loadFixtures();
