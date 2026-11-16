/* EAGLENEST_GRADE_COURSE_AVERAGES_V2
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
    return Number.isFinite(n)&&n>0&&n<=200?n:null;
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
  function pointsForLegacy(current,snapshots){
    const data=[];
    for (const [index,s] of (Array.isArray(snapshots)?snapshots:[]).entries()) {
      const g=findGrade(s,current);
      if(!g)continue;
      const key=String(s.snapshot_date||s.date||s.received_at_iso||'').slice(0,10);
      data.push({key:key||`undated-${index}`,seq:index,val:score(g),avg:score(g.course_average)});
    }
    data.sort((a,b)=>a.key.localeCompare(b.key)||a.seq-b.seq);
    const byDate=new Map();for(const p of data)byDate.set(p.key,p);
    const seq=[...byDate.values()];
    const live=score(current),avg=score(current?.course_average);
    if((live!==null||avg!==null)&&(!seq.length||seq[seq.length-1].val!==live||seq[seq.length-1].avg!==avg))
      seq.push({key:'zz-current',val:live,avg,seq:999999});
    return seq.slice(-12);
  }
  // EAGLENEST_STUDENT_TREND_SOURCE_CODE_MAPPING_V1
  // The Grade Hub indexes trends by ORIGINAL course_code. Academic mapping is
  // for display and roster grouping, so it must never obscure source identity.
  function findTrendCourse(current,courses){
    if(!current||!courses||typeof courses!=='object')return null;
    const key=v=>String(v??'').trim().toUpperCase();
    const keys=[current.course_code,current.mapped_course_code,
      current.academic_course_code,current.course_number]
      .map(key).filter(Boolean);
    // Exact source code always wins. For example DNC1001, not DANCE.
    for(const id of keys){if(Object.prototype.hasOwnProperty.call(courses,id))return courses[id];}
    const records=Object.values(courses).filter(Boolean);
    // Accommodate an API payload whose object keys differ from course_code.
    for(const id of keys){
      const matches=records.filter(row=>key(row.course_code)===id);
      if(matches.length===1)return matches[0];
    }
    // Name fallback is safe ONLY when exactly one source course shares it.
    const name=courseName(current).replace(/\s+/g,' ').trim();
    if(!name)return null;
    const matches=records.filter(row=>courseName(row).replace(/\s+/g,' ').trim()===name);
    return matches.length===1?matches[0]:null;
  }

  // EAGLENEST_TERM_AWARE_STUDENT_GRADE_TRENDS_V1
  function pointsFor(current, payload, term){
    const t=String(term||'').trim().toUpperCase();
    // MTSS has no reporting-term selector; preserve its existing historic graph.
    if(!t)return pointsForLegacy(current,payload);
    if(!payload?.courses)return [];
    const found=findTrendCourse(current,payload.courses);
    if(!found)return [];
    return (found.points||[]).map((p,i)=>({
      key:String(p.date||''),seq:i,
      val:score(p.student),avg:score(p.course_average),
      y1:t!=='Q1'&&t!=='Y1'?score(p.y1):null
    })).slice(-12);
  }
  function svg(tag, attrs){
    const el=document.createElementNS(NS,tag);
    for(const [key,value] of Object.entries(attrs||{}))el.setAttribute(key,String(value));
    return el;
  }
  function sparkline(points,term){
    const t=String(term||'').trim().toUpperCase();
    const box=document.createElement('span');box.className='engv-spark';
    const active=points.filter(p=>p.val!==null||p.avg!==null||p.y1!==null);
    const seriesCount=(['val','avg','y1'].filter(key=>points.filter(p=>p[key]!==null).length>=2)).length;
    if(active.length<2||!seriesCount){
      box.classList.add('engv-spark-empty');box.textContent='—';
      box.setAttribute('aria-label','Not enough stored snapshots for a trend');
      return box;
    }
    const w=112,h=42,padX=4,padY=2;
    const y=v=>padY+(100-Math.max(0,Math.min(100,v)))/100*(h-2*padY);
    const x=i=>padX+(points.length<=1?0:i/(points.length-1)*(w-2*padX));
    const label=t==='Y1'?'Y1 grade':(t||'Student')+' grade';
    const chartLabel=`${label} solid charcoal; course average dashed steel blue${t!=='Q1'&&t!=='Y1'?'; running Y1 dash-dot purple':''}`;
    const node=svg('svg',{viewBox:`0 0 ${w} ${h}`,width:w,height:h,role:'img',
      'aria-label':chartLabel,focusable:'false'});
    node.classList.add('engv-spark-svg');
    const title=svg('title',{});title.textContent=chartLabel;node.appendChild(title);
    for(const z of ZONES){
      const top=y(z.max===59.999?60:z.max===69.999?70:z.max===79.999?80:z.max===89.999?90:z.max);
      const bottom=y(z.min);
      node.appendChild(svg('rect',{x:0,y:top,width:w,height:bottom-top,fill:z.color,'fill-opacity':'.34'}));
    }
    function draw(key,stroke,width,dashes,marker){
      let segment=[];
      const flush=()=>{
        if(segment.length>=2){
          const attrs={points:segment.join(' '),fill:'none',stroke,'stroke-width':width,
            'stroke-linecap':'round','stroke-linejoin':'round'};
          if(dashes)attrs['stroke-dasharray']=dashes;
          node.appendChild(svg('polyline',attrs));
        }
        segment=[];
      };
      for(let i=0;i<points.length;i++){
        const v=points[i][key];
        if(v===null||v===undefined){flush();continue;}
        segment.push(`${x(i).toFixed(2)},${y(v).toFixed(2)}`);
      }
      flush();
      const last=points.map((p,i)=>({...p,i})).filter(p=>p[key]!==null).at(-1);
      if(last&&marker==='circle')node.appendChild(svg('circle',
        {cx:x(last.i),cy:y(last[key]),r:3.2,fill:stroke,stroke:'#fff','stroke-width':1}));
      if(last&&marker==='diamond'){
        const cx=x(last.i),cy=y(last[key]),r=3.5;
        node.appendChild(svg('polygon',{points:`${cx},${cy-r} ${cx+r},${cy} ${cx},${cy+r} ${cx-r},${cy}`,
          fill:stroke,stroke:'#fff','stroke-width':.8}));
      }
    }
    draw('avg','#5a7293',2,'4 3','');          // dashed: course average
    if(t!=='Q1'&&t!=='Y1')draw('y1','#8b5cf6',2.3,'7 3 2 3','diamond'); // dash-dot annual
    draw('val','#17243a',2.7,'','circle');      // solid: student
    box.title=chartLabel;box.appendChild(node);return box;
  }
  function ensureTrendLegend(host,term){
    if(!host)return;
    const t=String(term||'').toUpperCase();
    let legend=[...host.children].find(c=>c.classList?.contains('engv-line-legend'));
    if(!t){legend?.remove();return;}
    if(!legend){legend=document.createElement('div');legend.className='engv-line-legend';
      host.prepend(legend);}
    const entries=[['student',t==='Y1'?'Student Y1':`Student ${t}`],
      ['course',t==='Y1'?'Y1 course average':`Course ${t} average`]];
    if(t!=='Q1'&&t!=='Y1')entries.push(['year','Running Y1 average']);
    legend.replaceChildren();
    for(const [kind,label] of entries){
      const item=document.createElement('span');item.className='engv-legend-key';
      const line=document.createElement('span');line.className=`engv-legend-line ${kind}`;
      line.setAttribute('aria-hidden','true');
      const text=document.createElement('span');text.textContent=label;
      item.append(line,text);legend.appendChild(item);
    }
  }
  function enhanceRow(strong,current,snapshots,term=''){
    if(!strong)return;
    paint(strong,score(current));
    let wrap=strong.closest('.engv-grade-row');
    if(!wrap){wrap=document.createElement('div');wrap.className='engv-grade-row';
      strong.parentNode.insertBefore(wrap,strong);wrap.appendChild(strong);}
    wrap.querySelector('.engv-spark')?.remove();
    wrap.appendChild(sparkline(pointsFor(current,snapshots,term),term));
  }
  function decorateGradeCards(host,currentGrades,trends=null,term=''){
    if(!host||!Array.isArray(currentGrades))return;
    ensureTrendLegend(host,term);
    host.querySelectorAll('.currentCourse').forEach((card,i)=>{
      enhanceRow(card.querySelector('strong'),currentGrades[i],trends,term);
    });
    decorate(host);
  }
  function decorateLookupCourses(host,currentGrades,trends=null,term=''){
    if(!host||!Array.isArray(currentGrades))return;
    ensureTrendLegend(host,term);
    host.querySelectorAll('.lookupAcademicCourse').forEach((card,i)=>{
      enhanceRow(card.querySelector('.lookupAcademicGrade'),currentGrades[i],trends,term);
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
