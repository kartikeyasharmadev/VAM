const seedVisitors = [
  {id:1,name:'Olivia Rhye',email:'olivia@horizon.studio',host:'Maya Chen',time:'09:15 AM',status:'Inside',purpose:'Meeting',color:'#f3e5dc',initials:'OR'},
  {id:2,name:'Phoenix Baker',email:'phoenix@acme.co',host:'Ethan Wright',time:'09:30 AM',status:'Expected',purpose:'Tour',color:'#e4e9f4',initials:'PB'},
  {id:3,name:'Lana Steiner',email:'lana@brightlane.io',host:'Sofia Patel',time:'10:00 AM',status:'Inside',purpose:'Event',color:'#f5e8ca',initials:'LS'},
  {id:4,name:'Demi Wilkinson',email:'demi@northstar.co',host:'Noah Kim',time:'10:30 AM',status:'Expected',purpose:'Meeting',color:'#e9e2f3',initials:'DW'},
  {id:5,name:'Candice Wu',email:'candice@parker.com',host:'Maya Chen',time:'11:15 AM',status:'Checked out',purpose:'Delivery',color:'#e3eee7',initials:'CW'},
  {id:6,name:'Natali Craig',email:'natali@riverbend.co',host:'Ethan Wright',time:'12:00 PM',status:'Expected',purpose:'Meeting',color:'#f3e4e6',initials:'NC'},
  {id:7,name:'Drew Cano',email:'drew@studio.fm',host:'Sofia Patel',time:'01:30 PM',status:'Expected',purpose:'Tour',color:'#e9ebd8',initials:'DC'},
  {id:8,name:'Orlando Diggs',email:'orlando@oakandash.com',host:'Noah Kim',time:'02:15 PM',status:'Expected',purpose:'Meeting',color:'#e5e8ef',initials:'OD'}
];
let visitors;
try { visitors = JSON.parse(localStorage.getItem('entryflow-visitors')) || seedVisitors; } catch { visitors = seedVisitors; }
let activeView='dashboard';
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){localStorage.setItem('entryflow-visitors',JSON.stringify(visitors));}
function countInside(){return visitors.filter(v=>v.status==='Inside').length+10;}
function renderRows(list=visitors.slice(0,4)){
  const root=$('#visitor-rows');
  root.innerHTML=list.map(v=>`<tr><td><div class="visitor-cell"><span class="visitor-avatar" style="background:${v.color}">${esc(v.initials)}</span><span><div class="visitor-name">${esc(v.name)}</div><div class="visitor-email">${esc(v.email||v.purpose+' visitor')}</div></span></div></td><td><div class="host-cell"><span class="host-dot">${esc(v.host.split(' ').map(x=>x[0]).join(''))}</span>${esc(v.host)}</div></td><td class="time-cell">${esc(v.time)}</td><td><span class="status ${v.status.toLowerCase().replace(' ','-')}">${esc(v.status)}</span></td><td><button class="row-action" data-action="${v.id}" aria-label="Visitor actions">···</button></td></tr>`).join('');
  $('#nav-count').textContent=visitors.filter(v=>v.status==='Inside'||v.status==='Expected').length;
  $('#stat-inside').textContent=countInside(); $('#location-inside').textContent=countInside();
  $('#stat-expected').textContent=visitors.filter(v=>v.status==='Expected').length+4;
  $('#rows-summary').textContent=activeView==='visitors'?`Showing ${list.length} of ${visitors.length} visitors`:`Showing ${Math.min(4,list.length)} of ${visitors.length} visitors`;
}
function renderActivity(){
 const activities=[['＋','<b>Olivia Rhye</b> checked in','2 min ago'],['✓','<b>Visitor pass</b> approved by Maya Chen','18 min ago'],['↗','<b>Phoenix Baker</b> is expected at 9:30 AM','32 min ago']];
 $('#activity-list').innerHTML=activities.map(a=>`<div class="activity-item"><span class="activity-symbol">${a[0]}</span><span class="activity-content">${a[1]}</span><span class="activity-time">${a[2]}</span></div>`).join('');
}
function setView(view){
 activeView=view; document.querySelectorAll('[data-view]').forEach(a=>a.classList.toggle('active',a.dataset.view===view));
 const names={dashboard:'Overview',visitors:'Visitors',members:'Members',reports:'Reports',locations:'Locations',settings:'Settings'};
 $('#crumb').textContent=names[view]||'Overview';
 if(view==='dashboard'){ $('#visitor-rows').closest('.panel').querySelector('h2').textContent="Today’s arrivals"; renderRows(); return; }
 if(view==='visitors'){
   $('#visitor-rows').closest('.panel').querySelector('h2').textContent='Visitor log';
   renderRows(visitors); return;
 }
 toast(`${names[view]} is in the product roadmap. Visitor check-in is ready to try.`);
 setView('dashboard');
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800);}
function openModal(){const form=$('#visitor-form');form.reset();form.elements.time.value=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});$('#modal-backdrop').classList.add('open');$('#modal-backdrop').setAttribute('aria-hidden','false');setTimeout(()=>form.elements.name.focus(),40);}
function closeModal(){$('#modal-backdrop').classList.remove('open');$('#modal-backdrop').setAttribute('aria-hidden','true');}
function initials(name){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0].toUpperCase()).join('');}
function timeLabel(value){const [h,m]=value.split(':').map(Number);const ap=h>=12?'PM':'AM';return `${String(h%12||12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ap}`;}
function escapeCSV(s){return '"'+String(s).replaceAll('"','""')+'"';}
function exportVisitors(){const rows=[['Visitor','Host','Arrival','Status','Purpose'],...visitors.map(v=>[v.name,v.host,v.time,v.status,v.purpose])];const blob=new Blob([rows.map(r=>r.map(escapeCSV).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='entryflow-visitors.csv';a.click();URL.revokeObjectURL(url);toast('Visitor log exported as CSV.');}
$('#add-visitor').addEventListener('click',openModal);
$('#cancel-modal').addEventListener('click',closeModal);$('#modal-close').addEventListener('click',closeModal);
$('#modal-backdrop').addEventListener('click',e=>{if(e.target===$('#modal-backdrop'))closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('#visitor-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget);const name=f.get('name').trim();const host=f.get('host').trim();const newVisitor={id:Date.now(),name,email:'Guest visitor',host,time:timeLabel(f.get('time')),status:'Inside',purpose:f.get('purpose'),color:['#f3e5dc','#e4e9f4','#f5e8ca','#e9e2f3','#e3eee7'][visitors.length%5],initials:initials(name)};visitors.unshift(newVisitor);save();setView('dashboard');renderRows();closeModal();toast(`${name} added to today’s visitor log.`)});
document.querySelectorAll('[data-view]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();setView(a.dataset.view);$('#sidebar').classList.remove('open')}));
document.querySelectorAll('[data-view-link]').forEach(a=>a.addEventListener('click',()=>setView(a.dataset.viewLink)));
$('#export-btn').addEventListener('click',exportVisitors);
$('#mobile-menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#visitor-rows').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const v=visitors.find(x=>x.id==b.dataset.action);if(!v)return;if(v.status==='Inside'){v.status='Checked out';save();renderRows(activeView==='visitors'?visitors:visitors.slice(0,4));toast(`${v.name} checked out.`)}else if(v.status==='Expected'){v.status='Inside';save();renderRows(activeView==='visitors'?visitors:visitors.slice(0,4));toast(`${v.name} checked in.`)}else{v.status='Inside';save();renderRows(activeView==='visitors'?visitors:visitors.slice(0,4));toast(`${v.name} checked in again.`)}});
renderRows();renderActivity();
