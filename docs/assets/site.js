(() => {
  'use strict';
  const data = window.FAMILY;
  const base = document.body.dataset.base;
  const people = new Map(data.nodes.map(person => [person.id, person]));
  const $ = id => document.getElementById(id);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fold = text => String(text ?? '').toLocaleLowerCase('ru').replaceAll('ё','е');
  const url = person => base + 'people/' + person.id.toLowerCase() + '/index.html';
  const initials = name => name.split(/[\s,]+/).slice(0,2).map(part => part[0]).join('');
  const image = (person, mode = '') => person.portrait
    ? `<img class="avatar ${mode}" src="${base + esc(person.portrait)}" alt="" loading="lazy">`
    : `<span class="avatar initials ${mode}" aria-hidden="true">${esc(initials(person.full))}</span>`;
  const groups = [['birth','Рождение'],['residence','Проживание'],['death','Смерть и память'],['other','Другие события']];
  const kindLabel = kind => groups.find(([key]) => key === kind)?.[1] || 'Событие';
  const relationNames = {
    parent:['Родители','Дети'], spouse:['Супруги','Супруги'], 'reported-spouse':['Супруги','Супруги'],
    'reported-sibling':['Братья и сёстры','Братья и сёстры'], 'possible-same-person':['Возможное тождество','Возможное тождество']
  };
  const supported = data.edges.filter(edge => !['hypothesis','unresolved'].includes(edge.status));
  const familyLinks = supported.filter(edge => edge.type !== 'possible-same-person');
  function groupBy(items, key) {
    const groups = new Map();
    for (const item of items) {
      const id = key(item);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(item);
    }
    return groups;
  }
  const neighbors = new Map(data.nodes.map(p => [p.id,new Set()]));
  familyLinks.forEach(({a,b}) => {neighbors.get(a).add(b); neighbors.get(b).add(a);});
  const parents = id => supported.filter(e => e.type === 'parent' && e.b === id).map(e => e.a).sort();
  const partners = id => familyLinks.filter(e=>e.type.includes('spouse') && (e.a===id || e.b===id))
    .map(e=>e.a===id?e.b:e.a);
  const siblings = (id, visible) => {
    const family = parents(id).join('|');
    return family && [...visible].filter(peer => peer !== id && parents(peer).join('|') === family);
  };
  const colors = ['#8c4d31','#426553','#7b5d87','#9a772a','#457178','#9a5464'];
  function familyColor(id) {
    const key = parents(id).join('|');
    let hash = 0;
    for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return key ? colors[hash % colors.length] : '#b8ac97';
  }
  function card(person, extra = '') {
    return `<a class="archive-card" href="${url(person)}">${image(person)}<span><strong>${esc(person.full)}</strong><small>${esc(extra || person.years || person.role || 'Даты уточняются')}</small></span><span aria-hidden="true" class="arrow">↗</span></a>`;
  }
  function toggleButtons(container, selected, key) {
    container.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === selected)));
  }
  function roundedPath(points, radius=9) {
    const clean=points.filter((p,i)=>!i || p.x!==points[i-1].x || p.y!==points[i-1].y);
    const move=(from,to,length)=>{
      const distance=Math.hypot(to.x-from.x,to.y-from.y);
      const t=Math.min(.5,length/distance);
      return [from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t];
    };
    return clean.map((point,i)=>{
      if (!i) return `M${point.x},${point.y}`;
      if (i===clean.length-1) return `L${point.x},${point.y}`;
      return `L${move(point,clean[i-1],radius)} Q${point.x},${point.y} ${move(point,clean[i+1],radius)}`;
    }).join(' ');
  }

  function viewport(svg, options = {}) {
    let view = [0,0,1,1], origin, moved = false;
    function set(box) {
      view = box;
      svg.setAttribute('viewBox', box.join(' '));
    }
    function fit(box) {
      const {width,height} = svg.getBoundingClientRect();
      const ratio = width / (height || 1) || 1;
      let [x,y,w,h] = box;
      const fw = Math.max(w,h*ratio), fh = fw/ratio;
      set([x+(w-fw)/2,y+(h-fh)/2,fw,fh]);
    }
    function zoom(factor, xPct = .5, yPct = .5) {
      const [x,y,w,h] = view;
      if (w*factor < (options.min || 90) || w*factor > (options.max || 90000)) return;
      set([x + w*xPct*(1-factor), y + h*yPct*(1-factor),w*factor,h*factor]);
    }
    svg.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const bounds = svg.getBoundingClientRect();
      zoom(e.deltaY > 0 ? 1.15 : .87,(e.clientX-bounds.x)/bounds.width,(e.clientY-bounds.y)/bounds.height);
    }, {passive:false});
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      origin = {id:e.pointerId,x:e.clientX,y:e.clientY,box:view};
      moved = false;
    });
    svg.addEventListener('pointermove', e => {
      if (origin?.id !== e.pointerId) return;
      const dx=e.clientX-origin.x, dy=e.clientY-origin.y;
      if (!moved && Math.hypot(dx,dy)<5) return;
      if (!moved) svg.setPointerCapture(e.pointerId);
      moved = true;
      const [x,y,w,h] = origin.box;
      const ratio = w / svg.getBoundingClientRect().width;
      set([x-dx*ratio,y-dy*ratio,w,h]);
    });
    for (const type of ['pointerup','pointercancel','lostpointercapture']) svg.addEventListener(type, () => { origin = null; });
    svg.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopImmediatePropagation(); moved = false; } }, true);
    return {fit,zoom,get:()=>view};
  }

  function setupTree() {
    const svg = $('graph'), view = viewport(svg);
    const modes = $('tree-modes');
    const focusQuery = new URLSearchParams(location.search).get('person');
    let focus = people.has(focusQuery) ? focusQuery : data.focus;
    let mode = people.get(focus).candidate ? 'candidates' : 'focus';
    let visible, bounds, positions;
    const expanded = new Set();
    function closeSet() {
      const set = new Set([focus]);
      let frontier = [focus];
      for (let distance=0; distance<2; distance++) {
        const next = [];
        for (const node of frontier) {
          for (const peer of neighbors.get(node)) {
            const p = people.get(peer);
            if (p.candidate || set.has(peer)) continue;
            if (distance>=1 && !p.ancestor && peer!==data.focus) continue;
            set.add(peer);
            next.push(peer);
          }
        }
        frontier = next;
      }
      for (const id of expanded) {
        if (set.has(id)) neighbors.get(id).forEach(peer=>{if(!people.get(peer).candidate)set.add(peer);});
      }
      return set;
    }
    function layout() {
      positions = new Map();
      const rank = person => person.generation == null
        ? (familyLinks.some(e=>e.type==='parent'&&e.a===person.id&&visible.has(e.b))?2:3)
        : -person.generation;
      const rows = groupBy([...visible].map(id=>people.get(id)),rank);
      const hint = new Map();
      for (const [level,row] of [...rows].sort((a,b)=>b[0]-a[0])) {
        const score = p => hint.get(p.id) ?? 10000 + data.nodes.indexOf(p);
        row.sort((a,b)=>score(a)-score(b));
        const assigned = new Set();
        const arranged = [];
        row.forEach(person => {
          if (assigned.has(person.id)) return;
          const available = new Set(row.map(p=>p.id).filter(id=>!assigned.has(id)));
          const chain = [person.id];
          available.delete(person.id);
          const extend = (at,insert) => {
            let other;
            while ((other=partners(at()).find(id=>available.has(id)))) {
              available.delete(other);
              insert(other);
            }
          };
          extend(()=>chain[0],id=>chain.unshift(id));
          extend(()=>chain.at(-1),id=>chain.push(id));
          chain.forEach(id=>{assigned.add(id);arranged.push(people.get(id));});
        });
        arranged.forEach((p,i) => {
          const x=(i-(row.length-1)/2)*246;
          positions.set(p.id,{x,y:level*176});
          parents(p.id).forEach((id,j) => hint.set(id,(hint.get(id) ?? x) / 2 + (x+(j-.5)*130)/2));
        });
      }
      const points=[...positions.values()];
      const left=Math.min(...points.map(p=>p.x))-36, top=Math.min(...points.map(p=>p.y))-52;
      bounds=[left,top,Math.max(...points.map(p=>p.x))+248-left,Math.max(...points.map(p=>p.y))+132-top];
    }
    function connectors() {
      const markup = [];
      const center = id => positions.get(id).x+106;
      const grouped = new Map();
      const lanes = new Map();
      const path=(className,points)=>markup.push(`<path class="${className}" d="${roundedPath(points)}"/>`);
      for (const child of visible) {
        const pp = parents(child).filter(p=>visible.has(p)).filter(p=>positions.get(p).y<positions.get(child).y);
        if (!pp.length) continue;
        const key=pp.join('|');
        if (!grouped.has(key)) grouped.set(key,{pp,children:[]});
        grouped.get(key).children.push(child);
      }
      for (const {pp,children} of grouped.values()) {
        const jointX=pp.reduce((sum,id)=>sum+center(id),0)/pp.length;
        const yBottom=Math.max(...pp.map(id=>positions.get(id).y))+96;
        const adjacentCouple=pp.length===2 && partners(pp[0]).includes(pp[1]) &&
          positions.get(pp[0]).y===positions.get(pp[1]).y && Math.abs(center(pp[0])-center(pp[1]))<247;
        const junctionY=adjacentCouple?yBottom-49:yBottom+16;
        if (!adjacentCouple) pp.forEach(id=>{
          const x=center(id);
          path('parent-line',[{x,y:positions.get(id).y+96},{x,y:junctionY},{x:jointX,y:junctionY}]);
        });
        const left=Math.min(jointX,...children.map(center)),right=Math.max(jointX,...children.map(center));
        const childTop=Math.min(...children.map(id=>positions.get(id).y));
        if (!lanes.has(childTop)) lanes.set(childTop,[]);
        const tracks=lanes.get(childTop);
        let lane=tracks.findIndex(ranges=>ranges.every(([start,end])=>right+7<start || left-7>end));
        if (lane<0) {lane=tracks.length;tracks.push([]);}
        tracks[lane].push([left,right]);
        const busY=childTop-22-(lane%6)*6;
        path('parent-line',[{x:jointX,y:junctionY},{x:jointX,y:busY}]);
        if (left!==right) path('parent-line',[{x:left,y:busY},{x:right,y:busY}]);
        children.forEach(id=>path('parent-line',[{x:center(id),y:busY},{x:center(id),y:positions.get(id).y}]));
        if (children.length>1 || (!adjacentCouple && pp.length>1)) {
          const y=children.length>1?busY:junctionY;
          markup.push(`<circle class="family-junction" cx="${jointX}" cy="${y}" r="3.5"/>`);
        }
      }
      familyLinks.filter(e=>visible.has(e.a)&&visible.has(e.b)&&e.type.includes('spouse')).forEach(e=>{
        const a=positions.get(e.a), b=positions.get(e.b);
        const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x);
        const adjacent=a.y===b.y && right-left<247;
        const y=adjacent?a.y+47:Math.min(a.y,b.y)-28;
        const x=(left+212+right)/2;
        path('partner-line',adjacent?[{x:left+212,y},{x:right,y}]:
          [{x:a.x+106,y:a.y},{x:a.x+106,y},{x:b.x+106,y},{x:b.x+106,y:b.y}]);
        markup.push(`<g class="partner-symbol" transform="translate(${x} ${y})"><title>Супружеская связь</title><circle class="partner-ground" r="11"/><circle cx="-3.2" r="4.6"/><circle cx="3.2" r="4.6"/></g>`);
      });
      familyLinks.filter(e=>e.type==='reported-sibling' && visible.has(e.a) && visible.has(e.b) && !siblings(e.a,visible)?.includes(e.b)).forEach(e=>{
        const a=positions.get(e.a),b=positions.get(e.b);
        if (a.y===b.y) {
          const y=a.y-13;
          path('sibling-line',[{x:center(e.a),y:a.y},{x:center(e.a),y},{x:center(e.b),y},{x:center(e.b),y:b.y}]);
        }
      });
      return `<g class="connectors" aria-hidden="true">${markup.join('')}</g>`;
    }
    function render(centerOn=null) {
      layout();
      svg.innerHTML = connectors()+[...positions].map(([id,p])=>{
        const person=people.get(id);
        const open=expanded.has(id);
        const hidden=[...neighbors.get(id)].filter(peer=>!visible.has(peer)&&!people.get(peer).candidate).length;
        const action=open?'Свернуть ветвь':'Раскрыть родственников';
        const label=open?'−':'+'+hidden;
        return `<foreignObject x="${p.x-2}" y="${p.y-2}" width="221" height="109"><div xmlns="http://www.w3.org/1999/xhtml" class="tree-node ${id===focus?'is-focus':''}" style="--family:${familyColor(id)}">
          <a href="${url(person)}" class="tree-person" title="${esc(person.full)}">${image(person)}<span><strong>${esc(person.full)}</strong><small>${esc(person.years || 'Даты уточняются')}</small></span></a>
          ${(hidden || open) && mode==='focus'?`<button class="expand" data-expand="${id}" aria-expanded="${open}" aria-label="${action}: ${esc(person.full)}${open?'':', '+hidden}">${label}</button>`:''}
        </div></foreignObject>`;
      }).join('');
      $('tree-status').textContent=`Карточек на схеме: ${visible.size} из ${data.nodes.length}`;
      toggleButtons(modes,mode,'mode');
      if (centerOn && positions.has(centerOn)) {
        const point=positions.get(centerOn);
        const width=svg.clientWidth<580?480:972;
        view.fit([point.x+106-width/2,point.y-235,width,540]);
      } else if (svg.clientWidth < 580 && mode==='focus') {
        const point=positions.get(focus);
        view.fit([point.x-120,point.y-275,452,420]);
      } else view.fit(bounds);
    }
    function activate(next) {
      mode=next;
      visible=mode==='focus'?closeSet():new Set(data.nodes.filter(p=>mode==='candidates'?p.candidate:!p.candidate).map(p=>p.id));
      render();
    }
    if (!data.nodes.some(p=>p.candidate)) modes.querySelector('[data-mode="candidates"]').hidden=true;
    modes.addEventListener('click',e=>{const modeButton=e.target.closest('[data-mode]');if(modeButton) activate(modeButton.dataset.mode);});
    svg.addEventListener('click', e=>{
      const button=e.target.closest('[data-expand]');
      if (!button) return;
      const id=button.dataset.expand;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      visible=closeSet();
      for (const branch of expanded) if (!visible.has(branch)) expanded.delete(branch);
      render(id);
      svg.querySelector(`[data-expand="${id}"]`)?.focus({preventScroll:true});
    });
    $('tree-reset').addEventListener('click',()=>{expanded.clear();activate(people.get(focus).candidate?'candidates':'focus');});
    document.querySelectorAll('[data-tree-zoom]').forEach(b=>b.addEventListener('click',()=>b.dataset.treeZoom==='fit'?view.fit(bounds):view.zoom(b.dataset.treeZoom==='in'?.8:1.25)));
    window.addEventListener('resize',()=>view.fit(bounds));
    activate(mode);
  }

  function setupMap(root, selectedPeople) {
    const mapEvents=selectedPeople.flatMap(person=>person.events.filter(e=>data.places[e.place]).map(e=>({...e,person})));
    if (!mapEvents.length) {
      root.innerHTML='<p class="empty">Для этого профиля места пока не привязаны к карте.</p>';
      return;
    }
    const isFamilyMap=root.id==='family-map';
    root.innerHTML=`<div class="panel map-panel"><div class="toolbar map-toolbar">
      ${isFamilyMap?'<div class="pills map-branches" aria-label="Ветвь семьи"><button data-branch="all" aria-pressed="true">Вся семья</button><button data-branch="maternal" aria-pressed="false">По маме</button><button data-branch="paternal" aria-pressed="false">По папе</button></div>':''}
      <label class="visually-hidden" for="map-query">Найти место или человека</label><input type="search" id="map-query" placeholder="Место или человек">
      <div class="pills map-filters" aria-label="Тип события"><button data-kind="all" aria-pressed="true">Все события</button>
      ${groups.map(([k,label])=>`<button data-kind="${k}" aria-pressed="false">${label}</button>`).join('')}</div></div>
      <div class="map-layout"><div class="map-canvas"><svg class="map" aria-label="Карта семейных мест"></svg><span class="map-attribution">Подложка Natural Earth</span><div class="zoom"><button data-map-zoom="out" aria-label="Отдалить">−</button><button data-map-zoom="fit" aria-label="Уместить точки карты">⌖</button><button data-map-zoom="in" aria-label="Приблизить">+</button></div></div>
      <div class="map-results" aria-live="polite"></div></div></div>`;
    const svg=root.querySelector('svg'), view=viewport(svg,{min:1,max:640});
    const filters=root.querySelector('.map-filters'), query=root.querySelector('input'), results=root.querySelector('.map-results');
    const branches=root.querySelector('.map-branches');
    let kind='all', branch='all', selected, boxes, fitBox;
    const land=data.land.map(p=>`<path d="${p}"/>`).join('');
    function list(filtered, refit) {
      boxes=groupBy(filtered,e=>e.place);
      if (!boxes.has(selected)) selected=boxes.keys().next().value;
      const coordinates=[...boxes.keys()].map(key=>data.places[key]);
      if (coordinates.length) {
        const xs=coordinates.map(p=>p.x),ys=coordinates.map(p=>p.y);
        const lo=Math.min(...xs),hi=Math.max(...xs),bottom=Math.min(...ys),top=Math.max(...ys);
        const w=Math.max(7,hi-lo+12),h=Math.max(7,top-bottom+12);
        fitBox=[(lo+hi-w)/2,(bottom+top-h)/2,w,h];
      } else fitBox=[-20,-126,130,104];
      if (refit) view.fit(fitBox);
      draw();
    }
    function draw() {
      const scale=view.get()[2]/Math.max(svg.clientWidth,1);
      const markers=[...boxes].map(([key,events])=>{
        const p=data.places[key], active=key===selected;
        return {active,markup:`<g class="pin ${active?'active':''}" transform="translate(${p.x} ${p.y}) scale(${scale})" data-place="${esc(key)}" role="button" tabindex="0" aria-label="${esc(p.label)}, событий: ${events.length}"><circle r="17" opacity="0"/><circle r="${active?7:5.5}"/>${active?`<text y="-14" text-anchor="middle">${esc(p.label)}</text>`:''}</g>`};
      }).sort((a,b)=>Number(a.active)-Number(b.active));
      svg.innerHTML='<g class="map-land" fill-rule="evenodd">'+land+'</g>'+markers.map(p=>p.markup).join('');
      if (!selected) {
        const emptyBranch=branch!=='all' && !mapEvents.some(e=>e.person.branch===branch);
        results.innerHTML=`<p class="muted">${emptyBranch?'Для этой ветви в данной версии нет нанесённых мест.':'Места по этому запросу не найдены.'}</p>`;
        return;
      }
      const place=data.places[selected];
      results.innerHTML=`<label class="place-select"><span>Населённый пункт или область</span><select>${[...boxes].map(([key,events])=>`<option value="${esc(key)}" ${key===selected?'selected':''}>${esc(data.places[key].label)} (${events.length})</option>`).join('')}</select></label>
        <h3>${esc(place.label)}</h3><p class="muted">${esc(place.source||'Точка обозначает населённый пункт.')}</p>
        <ul class="map-events">${boxes.get(selected).map(e=>`<li><time>${esc(e.date)}</time><strong>${esc(e.title)}</strong><a href="${url(e.person)}">${esc(e.person.full)}</a></li>`).join('')}</ul>`;
    }
    function filter() {
      const term=fold(query.value.trim());
      list(mapEvents.filter(e=>(branch==='all'||e.person.branch===branch)&&(kind==='all'||e.kind===kind)&&fold(data.places[e.place].label+' '+e.person.full+' '+e.title).includes(term)),true);
    }
    branches?.addEventListener('click',e=>{const b=e.target.closest('[data-branch]');if(b){branch=b.dataset.branch;toggleButtons(branches,branch,'branch');filter();}});
    filters.addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(b){kind=b.dataset.kind;toggleButtons(filters,kind,'kind');filter();}});
    query.addEventListener('input',filter);
    function selectPin(event) {
      const marker=event.target.closest('[data-place]');
      if (marker) {selected=marker.dataset.place;draw();if(event.type==='keydown') svg.querySelector(`[data-place="${selected}"]`)?.focus();}
    }
    svg.addEventListener('click',selectPin);
    svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){ e.preventDefault();selectPin(e);}});
    results.addEventListener('change',e=>{if(e.target.matches('select')){selected=e.target.value;draw();results.querySelector('select')?.focus();}});
    root.querySelectorAll('[data-map-zoom]').forEach(b=>b.addEventListener('click',()=>{b.dataset.mapZoom==='fit'?view.fit(fitBox):view.zoom(b.dataset.mapZoom==='in'?.8:1.25);draw();}));
    svg.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey)draw();},{passive:true});
    window.addEventListener('resize',()=>{view.fit(fitBox);draw();});
    filter();
  }

  function setupArchive() {
    const input=$('archive-query'), filters=$('archive-filters'), more=$('archive-more');
    let filter='all', limit=12;
    const sorted = [...data.nodes].sort((a,b)=>a.full.localeCompare(b.full,'ru'));
    function update() {
      const term=fold(input.value.trim());
      const found=sorted.filter(p=>(filter==='all'||(filter==='candidate'?p.candidate:p.branch===filter&&!p.candidate))&&fold(p.full+' '+p.job+' '+p.nationality).includes(term));
      $('archive-results').innerHTML=found.slice(0,limit).map(p=>card(p,p.candidate?'Кандидат · связь проверяется':'')).join('') || '<p class="empty">По этому запросу ничего не найдено.</p>';
      $('archive-status').textContent=`Найдено: ${found.length}`;
      more.hidden=found.length<=limit;
    }
    if (!data.nodes.some(p=>p.candidate)) filters.querySelector('[data-filter="candidate"]').hidden=true;
    for (const branch of ['paternal','maternal']) if(!data.nodes.some(p=>p.branch===branch&&!p.candidate)) filters.querySelector(`[data-filter="${branch}"]`).hidden=true;
    filters.addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;limit=12;toggleButtons(filters,filter,'filter');update();}});
    input.addEventListener('input',()=>{limit=12;update();});
    more.addEventListener('click',()=>{limit+=12;update();});
    update();
  }

  function sourceLink(id) {
    const source = data.sources[id];
    if (!source) return esc(id);
    if (source.url) return `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>`;
    if (source.image) return `<button class="link-button" data-image="${esc(source.image)}" data-caption="${esc(source.title)}">${esc(source.title)}</button>`;
    return esc(source.title)+(source.archive?' · '+esc(source.archive):'');
  }

  function setupProfile(person) {
    const relationships=data.edges.filter(e=>e.a===person.id||e.b===person.id).map(e=>{
      const first=e.a===person.id, peer=people.get(first?e.b:e.a);
      return {peer,type:relationNames[e.type]?.[first?1:0] || 'Другие связи'};
    });
    if (parents(person.id).length >= 2) {
      for (const id of siblings(person.id,people.keys())) {
        if (!relationships.some(r=>r.peer.id===id)) relationships.push({peer:people.get(id),type:'Братья и сёстры'});
      }
    }
    const kinds=[...new Set(relationships.map(r=>r.type))];
    const gallery = person.gallery;
    const citations = data.publicSources[person.id] || [];
    const body = $('profile-content');
    body.innerHTML = `<section class="profile-hero"><div class="profile-photo">${image(person,'large')}</div><div><p class="eyebrow">${esc(person.candidate?'СВЯЗЬ С СЕМЬЁЙ ПРОВЕРЯЕТСЯ':'СЕМЕЙНЫЙ ПРОФИЛЬ')}</p><h1>${esc(person.full)}</h1><p class="profile-years">${esc(person.years)}</p>
      ${person.role&&!person.candidate?`<p class="muted">${esc(person.role)}</p>`:''}
      <div class="traits">${person.job&&person.job!=='Пока неизвестно'?`<div><span>Занятие</span><strong>${esc(person.job)}</strong></div>`:''}${person.nationality&&person.nationality!=='Не установлена'?`<div><span>Национальность / происхождение</span><strong>${esc(person.nationality)}</strong></div>`:''}</div></div></section>
      <section class="profile-section biography"><h2>Биография</h2>${person.story.map(p=>`<p>${esc(p)}</p>`).join('')}${person.warning?`<p class="notice">${esc(person.warning)}</p>`:''}</section>
      <section class="profile-section"><h2>Родственные связи</h2>${relationships.length?`<div class="pills" id="relations"><button data-rel="all" aria-pressed="true">Все · ${relationships.length}</button>${kinds.map(k=>`<button data-rel="${esc(k)}" aria-pressed="false">${esc(k)}</button>`).join('')}</div><div id="relation-list" class="archive-grid relation-list"></div>`:'<p class="muted">В этой версии профиля связанных карточек нет.</p>'}</section>
      ${person.events.length?`<section class="profile-section"><h2>Места и события</h2><div id="profile-map"></div><ol class="timeline">${person.events.map(e=>`<li><time>${esc(e.date)}</time><div><strong>${esc(e.title)}</strong>${e.text?`<p>${esc(e.text)}</p>`:''}${e.uncertainty?`<small>${esc(e.uncertainty)}</small>`:''}</div></li>`).join('')}</ol></section>`:''}
      ${gallery.length?`<section class="profile-section"><h2>Фотографии и документы</h2><div class="gallery">${gallery.map(item=>`<figure><button data-image="${esc(item.path)}" data-caption="${esc(item.caption)}"><img loading="lazy" src="${base+esc(item.path)}" alt="${esc(item.caption)}"></button><figcaption>${esc(item.caption)}</figcaption></figure>`).join('')}</div></section>`:''}
      ${person.facts.length||citations.length?`<section class="profile-section"><h2>Сведения и источники</h2><ul class="evidence">${person.facts.map(f=>`<li><p>${esc(f.text)}</p><small>${(f.sources||[]).filter(id=>data.sources[id]).map(sourceLink).join(' · ')}</small></li>`).join('')}${citations.map(([label,link])=>`<li><a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`).join('')}</ul></section>`:''}`;
    if (relationships.length) {
      const filters=$('relations');
      const update = key=>{$('relation-list').innerHTML=relationships.filter(r=>key==='all'||r.type===key).map(r=>card(r.peer,r.type)).join('');toggleButtons(filters,key,'rel');};
      filters.addEventListener('click',event=>{const button=event.target.closest('[data-rel]');if(button)update(button.dataset.rel);});
      update('all');
    }
    if ($('profile-map')) setupMap($('profile-map'),[person]);
  }

  document.addEventListener('click',e=>{
    const trigger=e.target.closest('[data-image]');
    if (!trigger) return;
    $('lightbox-content').innerHTML=`<img src="${base+esc(trigger.dataset.image)}" alt="${esc(trigger.dataset.caption)}"><figcaption>${esc(trigger.dataset.caption)}</figcaption>`;
    $('lightbox').showModal();
  });
  if ($('graph')) {
    setupTree();
    setupMap($('family-map'),data.nodes);
    setupArchive();
  } else {
    const profile=document.querySelector('[data-person]');
    if (profile && people.has(profile.dataset.person)) setupProfile(people.get(profile.dataset.person));
  }
})();
