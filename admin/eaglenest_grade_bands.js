/* EAGLENEST_GRADE_BANDS_TRENDS_V1
 * Presentation only. Does not change course grades, missing-grade policy,
 * academic calculations, passing threshold, or permissions.
 */
(function () {
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const ZONES=[
    {id:'low',min:0,max:59.999,color:'#ff1515'},
    {id:'sixties',min:60,max:69.999,color:'#ff9900'},
    {id:'seventies',min:70,max:79.999,color:'#ffff00'},
    {id:'eighties',min:80,max:89.999,color:'#00e900'},
    {id:'nineties',min:90,max:100,color:'#00e5ea'}
  ];
  const selectTargets='.gradeChip, .currentCourse strong, .lookupAcademicGrade, .academicGradeChips strong, [data-en-grade]';

  function numeric(v) {
    if (v===null||v===undefined)return null;
    const raw=String(v).trim();
    if(!raw||/^(not\s+(graded|entered)|missing|pending|—|-|n\/?a)$/i.test(raw))return null;
    // Never turn a zero placeholder into a failing grade.
    const m=raw.match(/^(-?\d+(?:\.\d+)?)\s*%?$/);
    if(!m)return null;
    const n=Number(m[1]);
    return Number.isFinite(n)&&n>0&&n<=100?n:null;
  }
  function score(grade) {
    if (grade && typeof grade==='object') {
      const raw=grade.grade_value;
      if(raw!==undefined&&raw!==null&&String(raw).trim()!==''&&numeric(raw)===null)return null;
      return numeric(grade.grade_numeric??grade.grade??grade.score??raw);
    }
    return numeric(grade);
  }
  function band(grade) {
    const n=score(grade);
    return n===null?'ungraded':n>=90?'nineties':n>=80?'eighties':n>=70?'seventies':n>=60?'sixties':'low';
  }
  function paint(el, value) {
    if(!el)return;
    el.dataset.enBand=band(value);
    el.classList.add('engv-band');
  }
  function scoreFromLabel(label) {
    const s=String(label||'');
    if(/\bnot\s+(graded|entered)\b|\bmissing\b/i.test(s))return null;
    const m=s.match(/(-?\d+(?:\.\d+)?)\s*%/);
    return m?numeric(m[1]):null;
  }
  function decorate(root=document){
    if(!root?.querySelectorAll)return;
    if(root.matches?.(selectTargets))apply(root);
    root.querySelectorAll(selectTargets).forEach(apply);
  }
  function apply(el){
    // The element's explicit grade wins; never parse OSIS/attendance/date fields.
    const v=el.hasAttribute('data-en-grade')?score(el.getAttribute('data-en-grade')):scoreFromLabel(el.textContent);
    paint(el,v);
  }

  function courseId(g){
    return String(g?.academic_course_code||g?.course_code||g?.course_number||'').trim().toUpperCase();
  }
  function courseName(g){return String(g?.course_name||g?.name||'').trim().toLowerCase();}
  function findGrade(snap, current) {
    const rows=snap?.grades||snap?.courses||[];
    if(!Array.isArray(rows))return null;
    const code=courseId(current),name=courseName(current);
    return rows.find(g=>(code&&courseId(g)===code)||(name&&courseName(g)===name))||null;
  }
  function pointsFor(current,snapshots){
    const data=[];
    for (const [index,s] of (Array.isArray(snapshots)?snapshots:[]).entries()) {
      const g=findGrade(s,current);
      if(!g)continue;
      const key=String(s.snapshot_date||s.date||s.received_at_iso||'').slice(0,10);
      data.push({key:key||`undated-${index}`,seq:index,val:score(g)});
    }
    // Snapshot dates, not array order, determine direction on the chart.
    data.sort((a,b)=>a.key.localeCompare(b.key)||a.seq-b.seq);
    const byDate=new Map();for(const p of data)byDate.set(p.key,p);
    const seq=[...byDate.values()];
    const live=score(current);
    if(live!==null && (!seq.length||seq[seq.length-1].val!==live))
      seq.push({key:'zz-current',val:live,seq:999999});
    return seq.slice(-12);
  }
  function svg(tag, attrs){
    const el=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attrs||{}))el.setAttribute(key,String(value));
    return el;
  }
  function sparkline(points){
    const box=document.createElement('span');box.className='engv-spark';
    const good=points.filter(p=>p.val!==null);
    if(good.length<2){
      box.classList.add('engv-spark-empty');box.textContent='—';
      box.setAttribute('aria-label','Not enough stored snapshots for a trend');
      return box;
    }
    const w=112,h=42,padX=4,padY=2;
    const y=v=>padY+(100-v)/100*(h-2*padY);
    const x=i=>padX+(points.length<=1?0:i/(points.length-1)*(w-2*padX));
    const node=svg('svg',{viewBox:`0 0 ${w} ${h}`,width:w,height:h,role:'img','aria-label':'Recent grade trend with colored performance bands; dates and exact values hidden',focusable:'false'});
    node.classList.add('engv-spark-svg');
    for(const z of ZONES){
      const top=y(z.max===59.999?60:z.max===69.999?70:z.max===79.999?80:z.max===89.999?90:z.max);
      const bottom=y(z.min);
      node.appendChild(svg('rect',{x:0,y:top,width:w,height:bottom-top,fill:z.color,'fill-opacity':'.34'}));
    }
    let segment=[];
    const flush=()=>{if(segment.length>=2)node.appendChild(svg('polyline',{points:segment.join(' '),fill:'none',stroke:'#17243a','stroke-width':2.7,'stroke-linecap':'round','stroke-linejoin':'round'}));segment=[]};
    for(let i=0;i<points.length;i++){
      if(points[i].val===null){flush();continue;}
      segment.push(`${x(i).toFixed(2)},${y(points[i].val).toFixed(2)}`);
    }
    flush();
    const last=points.map((p,i)=>({...p,i})).filter(p=>p.val!==null).at(-1);
    node.appendChild(svg('circle',{cx:x(last.i),cy:y(last.val),r:3.5,fill:'#17243a',stroke:'#fff','stroke-width':1}));
    box.appendChild(node);return box;
  }
  function enhanceRow(strong, current, snapshots){
    if(!strong)return;
    paint(strong,score(current));
    let wrap=strong.closest('.engv-grade-row');
    if(!wrap){
      wrap=document.createElement('div');wrap.className='engv-grade-row';
      strong.parentNode.insertBefore(wrap,strong);wrap.appendChild(strong);
    }
    wrap.querySelector('.engv-spark')?.remove();
    wrap.appendChild(sparkline(pointsFor(current,snapshots)));
  }
  function decorateGradeCards(host, currentGrades, snapshots){
    if(!host||!Array.isArray(currentGrades))return;
    host.querySelectorAll('.currentCourse').forEach((card,i)=>{
      enhanceRow(card.querySelector('strong'),currentGrades[i],snapshots);
    });
    decorate(host);
  }
  function decorateLookupCourses(host, currentGrades, snapshots=[]){
    if(!host||!Array.isArray(currentGrades))return;
    host.querySelectorAll('.lookupAcademicCourse').forEach((card,i)=>{
      enhanceRow(card.querySelector('.lookupAcademicGrade'),currentGrades[i],snapshots);
    });
    decorate(host);
  }
  function decorateMtssAcademic(host, currentGrades, snapshots=[]){
    if(!host||!Array.isArray(currentGrades))return;
    host.querySelectorAll('.academicGradeChips > span').forEach((card,i)=>{
      enhanceRow(card.querySelector('strong'),currentGrades[i],snapshots);
    });
    decorate(host);
  }
  let scheduled=false;
  function queueDecorate(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;decorate(document)});
  }
  window.EagleNESTGradeBands=Object.freeze({band,score,decorate,decorateGradeCards,decorateLookupCourses,decorateMtssAcademic});
  function start(){decorate();const observer=new MutationObserver(queueDecorate);observer.observe(document.body,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
