(function () {
  'use strict';

  const charts = { trend: null, types: null, severity: null };
  const typeLabels = { SHORTAGE:'Faltante', EXCESS:'Sobrante', DAMAGED:'Avería', WRONG_ITEM:'Material incorrecto', DOCUMENT:'Documento / factura', QUALITY:'Calidad', OTHER:'Otra', SIN_NOVEDAD:'Sin novedad' };
  const severityLabels = { LOW:'Baja', MEDIUM:'Media', HIGH:'Alta', CRITICAL:'Crítica', SIN_NOVEDAD:'Sin novedad' };
  const number = value => Number(value || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const isoDate = date => date.toISOString().slice(0,10);
  const byId = id => document.getElementById(id);

  function setText(id,value) { const el=byId(id); if(el)el.textContent=String(value); }
  function destroyCharts(){ Object.keys(charts).forEach(key=>{try{charts[key]?.destroy()}catch{} charts[key]=null;}); }

  function chart(canvasId,key,config){
    const canvas=byId(canvasId);
    if(!canvas||!window.Chart)return;
    try{charts[key]?.destroy()}catch{}
    charts[key]=new window.Chart(canvas,config);
  }

  function renderCharts(data){
    const trend=Array.isArray(data.trend)?data.trend:[];
    chart('crmTrendChart','trend',{
      type:'line',
      data:{
        labels:trend.map(row=>row.date),
        datasets:[
          {label:'Recepciones',data:trend.map(row=>Number(row.receipts||0)),borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,.10)',tension:.3,fill:true},
          {label:'Novedades',data:trend.map(row=>Number(row.novelties||0)),borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.08)',tension:.3,fill:false}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true,ticks:{precision:0}}}}
    });

    const types=(Array.isArray(data.noveltyTypes)?data.noveltyTypes:[]).filter(row=>row.label!=='SIN_NOVEDAD');
    chart('crmNoveltyTypeChart','types',{
      type:'doughnut',
      data:{labels:types.map(row=>typeLabels[row.label]||row.label),datasets:[{data:types.map(row=>Number(row.value||0)),backgroundColor:['#2563eb','#ef4444','#f59e0b','#8b5cf6','#06b6d4','#10b981','#64748b']}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}
    });

    const severities=(Array.isArray(data.severities)?data.severities:[]).filter(row=>row.label!=='SIN_NOVEDAD');
    chart('crmSeverityChart','severity',{
      type:'bar',
      data:{labels:severities.map(row=>severityLabels[row.label]||row.label),datasets:[{label:'Recepciones',data:severities.map(row=>Number(row.value||0)),backgroundColor:'#0f1e45',borderRadius:7}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{precision:0}},x:{grid:{display:false}}}}
    });
  }

  async function refresh(){
    const endpoint=window.ERP_CONFIG?.CRM_SUMINISTROS?.METRICS_URL;
    const status=byId('crmMetricsStatus');
    if(!endpoint){if(status)status.textContent='La conexión con CRM Suministros no está configurada.';return;}
    const from=byId('crmMetricsFrom')?.value||'';
    const to=byId('crmMetricsTo')?.value||'';
    if(status){status.textContent='Actualizando indicadores desde CRM Suministros…';status.className='bi-crm-status loading';}
    try{
      const url=new URL(endpoint);
      if(from)url.searchParams.set('from',from);
      if(to)url.searchParams.set('to',to);
      const response=await fetch(url.toString(),{method:'GET',headers:{'Accept':'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload?.success===false)throw new Error(payload?.error||`HTTP ${response.status}`);
      const data=payload?.data||{};
      const k=data.kpis||{};
      setText('crmKpiReceipts',number(k.receipts));
      setText('crmKpiNovelties',number(k.novelties));
      setText('crmKpiNoveltyRate',`${number(k.noveltyRate)} %`);
      setText('crmKpiAccepted',number(k.acceptedQuantity));
      setText('crmKpiRejected',number(k.rejectedQuantity));
      renderCharts(data);
      if(status){status.textContent=`Conectado · ${data.range?.from||from} a ${data.range?.to||to} · datos agregados sin información personal`;status.className='bi-crm-status ok';}
    }catch(error){
      console.warn('CRM Suministros BI:',error);
      destroyCharts();
      if(status){status.textContent='No fue posible consultar CRM Suministros. El BI local y la carga de Excel continúan disponibles.';status.className='bi-crm-status error';}
    }
  }

  function init(root){
    if(!root||root.dataset.crmBiInit==='1')return;
    root.dataset.crmBiInit='1';
    destroyCharts();
    const today=new Date();
    const from=new Date(today.getTime()-29*864e5);
    const fromInput=byId('crmMetricsFrom'),toInput=byId('crmMetricsTo');
    if(fromInput&&!fromInput.value)fromInput.value=isoDate(from);
    if(toInput&&!toInput.value)toInput.value=isoDate(today);
    byId('crmMetricsRefresh')?.addEventListener('click',refresh);
    [fromInput,toInput].forEach(input=>input?.addEventListener('change',()=>{if(fromInput?.value&&toInput?.value)refresh()}));
    refresh();
  }

  function discover(){ init(document.getElementById('crmSuministrosPanel')); }
  const main=document.getElementById('mainContent');
  if(main){
    const observer=new MutationObserver(discover);
    observer.observe(main,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',discover,{once:true});else discover();
  window.actualizarMetricasCrmSuministros=refresh;
})();
