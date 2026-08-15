import { SYSTEM_DESIGN_NODE_DEFINITIONS } from "../constants/system-design-palette";
import { SYSTEM_DESIGN_EDGE_SEMANTICS } from "../constants/system-design-edge-registry";
import {
  SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS,
  SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
  getSystemDesignNodeVisual,
} from "../constants/system-design-visual-registry";
import type {
  SystemDesignDocument,
  SystemDesignIconKey,
  SystemDesignProblem,
} from "../types/system-design.types";
import { parseSystemDesignDocument } from "./diagram-validation";

export interface InteractiveSystemDesignHtmlExport {
  filename: string;
  html: string;
}

interface InteractiveViewerPayload {
  document: SystemDesignDocument;
  problem: Pick<
    SystemDesignProblem,
    | "title"
    | "summary"
    | "requirements"
    | "scaleAssumptions"
    | "difficulty"
  >;
  visuals: Record<string, ReturnType<typeof getSystemDesignNodeVisual>>;
  technologies: typeof SYSTEM_DESIGN_TECHNOLOGY_REGISTRY;
  technologyPaths: typeof SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS;
  semanticGlyphs: Record<
    string,
    { key: SystemDesignIconKey; path: string; style: "fill" | "stroke" }
  >;
  edgeSemantics: typeof SYSTEM_DESIGN_EDGE_SEMANTICS;
}

interface SystemDesignSemanticGlyphPath {
  path: string;
  style: "fill" | "stroke";
}

/**
 * Export-safe, code-native glyphs. These paths are bundled into the inert JSON
 * payload, so the offline viewer never needs a CDN, a remote image, or a DOM
 * HTML injection sink to give technology-less components a semantic identity.
 */
const SYSTEM_DESIGN_SEMANTIC_GLYPH_PATHS = {
  user: { path: "M12 11A4 4 0 1 0 12 3A4 4 0 0 0 12 11ZM4 21C4 16 7 13 12 13C17 13 20 16 20 21", style: "stroke" },
  browser: { path: "M3 4H21V20H3V4ZM3 9H21M7 6.5H7.01M10 6.5H10.01", style: "stroke" },
  mobile: { path: "M7 2H17V22H7V2ZM10 5H14M11 19H13", style: "stroke" },
  admin: { path: "M12 2L20 5V11C20 16 17 20 12 22C7 20 4 16 4 11V5L12 2ZM8 12L11 15L16 9", style: "stroke" },
  globe: { path: "M12 2A10 10 0 1 0 12 22A10 10 0 0 0 12 2ZM2 12H22M4 7H20M4 17H20M12 2C16 6 16 18 12 22M12 2C8 6 8 18 12 22", style: "stroke" },
  network: { path: "M12 3A2 2 0 1 0 12 7A2 2 0 0 0 12 3ZM4 17A2 2 0 1 0 4 21A2 2 0 0 0 4 17ZM20 17A2 2 0 1 0 20 21A2 2 0 0 0 20 17ZM12 7V12M4 17V14H20V17", style: "stroke" },
  route: { path: "M4 4V9C4 11 6 12 8 12H16C18 12 20 13 20 15V20M16 17L20 21L24 17M8 9L4 13L0 9", style: "stroke" },
  gateway: { path: "M7 3H3V21H7M17 3H21V21H17M8 12H16M13 8L17 12L13 16", style: "stroke" },
  server: { path: "M4 3H20V9H4V3ZM4 9H20V15H4V9ZM4 15H20V21H4V15ZM7 6H7.01M7 12H7.01M7 18H7.01", style: "stroke" },
  boxes: { path: "M3 3H10V10H3V3ZM14 3H21V10H14V3ZM8.5 14H15.5V21H8.5V14ZM6.5 10V12H12V14M17.5 10V12H12", style: "stroke" },
  box: { path: "M12 2L21 7V17L12 22L3 17V7L12 2ZM3 7L12 12L21 7M12 12V22", style: "stroke" },
  worker: { path: "M12 7A5 5 0 1 0 12 17A5 5 0 0 0 12 7ZM12 2V5M12 19V22M2 12H5M19 12H22M5 5L7 7M17 17L19 19M19 5L17 7M7 17L5 19", style: "stroke" },
  function: { path: "M5 21L10 3H15M8 11H15M14 9L20 15M20 9L14 15", style: "stroke" },
  database: { path: "M4 5C4 2 20 2 20 5V19C20 22 4 22 4 19V5ZM4 5C4 8 20 8 20 5M4 12C4 15 20 15 20 12", style: "stroke" },
  "document-database": { path: "M4 3H15L20 8V21H4V3ZM14 3V9H20M8 13H16M8 17H16", style: "stroke" },
  cache: { path: "M6 6H18V18H6V6ZM9 2V6M15 2V6M9 18V22M15 18V22M2 9H6M18 9H22M2 15H6M18 15H22M9 10H15M9 14H15", style: "stroke" },
  search: { path: "M10 3A7 7 0 1 0 10 17A7 7 0 0 0 10 3ZM15 15L21 21M7 8H13M7 11H12", style: "stroke" },
  storage: { path: "M4 4H20V20H4V4ZM7 8H17M7 12H17M7 16H13", style: "stroke" },
  warehouse: { path: "M3 9L12 3L21 9V21H3V9ZM7 11V18M12 11V18M17 11V18M3 18H21", style: "stroke" },
  queue: { path: "M3 7H21V17H3V7ZM7 12H7.01M12 12H12.01M17 12H17.01", style: "stroke" },
  stream: { path: "M2 7H7L11 12H13L17 17H22M2 17H7L11 12H13L17 7H22", style: "stroke" },
  broadcast: { path: "M12 10A2 2 0 1 0 12 14A2 2 0 0 0 12 10ZM8 8C6 10 6 14 8 16M16 8C18 10 18 14 16 16M5 5C1 9 1 15 5 19M19 5C23 9 23 15 19 19", style: "stroke" },
  "external-link": { path: "M14 4H20V10M20 4L11 13M18 13V20H4V6H11", style: "stroke" },
  payment: { path: "M3 5H21V19H3V5ZM3 10H21M7 15H12", style: "stroke" },
  notification: { path: "M5 8C5 4 8 2 12 2C16 2 19 4 19 8V15L22 18H2L5 15V8ZM9 21H15", style: "stroke" },
  email: { path: "M3 5H21V19H3V5ZM3 7L12 14L21 7", style: "stroke" },
  sms: { path: "M6 3H18V21H6V3ZM9 7H15V14H12L9 17V7ZM11 19H13", style: "stroke" },
  "identity-provider": { path: "M12 2L20 5V11C20 16 17 20 12 22C7 20 4 16 4 11V5L12 2ZM12 7A2.5 2.5 0 1 0 12 12A2.5 2.5 0 0 0 12 7ZM8 17C8 14 10 13 12 13C14 13 16 14 16 17", style: "stroke" },
  module: { path: "M3 7H13V17H3V7ZM11 3H21V13H11V3ZM11 11H21V21H11V11", style: "stroke" },
  "logical-module": { path: "M3 5H10V12H3V5ZM14 5H21V12H14V5ZM8.5 16H15.5V21H8.5V16ZM6.5 12L10 16M17.5 12L14 16", style: "stroke" },
  "feature-module": { path: "M9 3H15V8H21V14H16V21H10V15H3V9H9V3Z", style: "stroke" },
  "domain-module": { path: "M12 2L20 7V17L12 22L4 17V7L12 2ZM8 9H16V15H8V9Z", style: "stroke" },
  boundary: { path: "M3 3H21V21H3V3ZM7 7H17V17H7V7Z", style: "stroke" },
  "module-boundary": { path: "M3 5H21V20H3V5ZM3 9H21M8 9V20", style: "stroke" },
  vpc: { path: "M5 18C2 15 4 10 8 10C9 5 16 4 18 9C23 9 24 16 20 18H5ZM8 14H16M11 11L8 14L11 17M13 11L16 14L13 17", style: "stroke" },
  region: { path: "M12 22S19 15 19 9A7 7 0 1 0 5 9C5 15 12 22 12 22ZM12 6A3 3 0 1 0 12 12A3 3 0 0 0 12 6Z", style: "stroke" },
  "availability-zone": { path: "M3 5H9V19H3V5ZM9 8H15V19H9V8ZM15 3H21V19H15V3ZM5 9H7M11 12H13M17 7H19", style: "stroke" },
  "kubernetes-cluster": { path: "M12 2L20 7V17L12 22L4 17V7L12 2ZM12 7V17M7 12H17M8.5 8.5L15.5 15.5M15.5 8.5L8.5 15.5", style: "stroke" },
  "deployment-group": { path: "M3 3H10V9H3V3ZM14 3H21V9H14V3ZM8.5 15H15.5V21H8.5V15ZM6.5 9V12H12V15M17.5 9V12H12", style: "stroke" },
  swimlane: { path: "M3 4H21V20H3V4ZM8 4V20M8 9H21M8 15H21", style: "stroke" },
  container: { path: "M12 2L21 7L12 12L3 7L12 2ZM3 7V17L12 22L21 17V7M12 12V22", style: "stroke" },
  text: { path: "M4 5H20M12 5V20M8 20H16", style: "stroke" },
  note: { path: "M4 3H16L20 7V21H4V3ZM16 3V7H20M8 12H16M8 16H14", style: "stroke" },
  "warning-note": { path: "M12 3L22 21H2L12 3ZM12 9V14M12 18H12.01", style: "stroke" },
  "assumption-note": { path: "M9 18H15M10 21H14M12 2A7 7 0 0 0 8 15C9 16 9 17 9 18H15C15 17 15 16 16 15A7 7 0 0 0 12 2Z", style: "stroke" },
  rectangle: { path: "M3 5H21V19H3V5Z", style: "stroke" },
  "rounded-rectangle": { path: "M6 5H18A3 3 0 0 1 21 8V16A3 3 0 0 1 18 19H6A3 3 0 0 1 3 16V8A3 3 0 0 1 6 5Z", style: "stroke" },
  ellipse: { path: "M12 4A10 8 0 1 0 12 20A10 8 0 0 0 12 4Z", style: "stroke" },
  diamond: { path: "M12 2L22 12L12 22L2 12L12 2Z", style: "stroke" },
  callout: { path: "M3 4H21V17H9L5 21V17H3V4Z", style: "stroke" },
  divider: { path: "M3 12H21", style: "stroke" },
  label: { path: "M3 5H14L21 12L14 19H3V5ZM8 9A2 2 0 1 0 8 13A2 2 0 0 0 8 9Z", style: "stroke" },
  image: { path: "M3 4H21V20H3V4ZM3 16L8 11L12 15L15 12L21 18M16 8A2 2 0 1 0 16 12A2 2 0 0 0 16 8Z", style: "stroke" },
} as const satisfies Record<SystemDesignIconKey, SystemDesignSemanticGlyphPath>;

function safeFilename(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "diagram"
  );
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

/**
 * The payload is inert JSON, but HTML-significant characters are escaped so
 * no imported label or metadata value can terminate its script element.
 */
function serializeForHtml(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("The system-design viewer payload could not be serialized.");
  }
  return serialized
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

const VIEWER_STYLES = String.raw`
:root{color-scheme:dark;--bg:#09090b;--surface:#18181b;--raised:#27272a;--border:#3f3f46;--fg:#fafafa;--muted:#a1a1aa;--accent:#a78bfa;--accent-soft:#2e2350;--success:#22c55e;--warning:#f59e0b;--danger:#ef4444;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--fg)}button,input{font:inherit}button{min-height:34px;padding:0 10px;border:1px solid var(--border);border-radius:7px;background:var(--raised);color:var(--fg);cursor:pointer}button:hover{border-color:#6d5d87;background:#302b38}button:focus-visible,input:focus-visible,svg:focus-visible{outline:2px solid var(--accent);outline-offset:2px}button[aria-pressed=true]{border-color:var(--accent);background:var(--accent-soft);color:#ddd6fe}.app{display:grid;grid-template-rows:auto auto 1fr;height:100%}.topbar{display:flex;align-items:center;gap:8px;min-height:52px;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--surface)}.brand{min-width:220px}.brand strong{display:block;font-size:14px}.brand span{display:block;margin-top:2px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.tools{display:flex;align-items:center;gap:6px;margin-left:auto}.tools .zoom{min-width:54px;text-align:center;color:var(--muted);font-size:12px}.search{width:min(250px,24vw);height:34px;padding:0 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg);color:var(--fg)}.breadcrumbs{display:flex;align-items:center;gap:4px;min-height:38px;padding:5px 12px;border-bottom:1px solid var(--border);background:rgba(24,24,27,.94);font-size:12px}.breadcrumbs button{min-height:26px;padding:0 7px;border-color:transparent;background:transparent;color:var(--muted)}.breadcrumbs button:last-of-type{color:var(--fg);font-weight:600}.crumb-separator{color:#52525b}.workspace{display:grid;grid-template-columns:minmax(0,1fr) 310px;min-height:0}.canvas-wrap{position:relative;min-width:0;min-height:0;overflow:hidden;background-color:var(--bg);background-image:radial-gradient(circle at 1px 1px,rgba(161,161,170,.17) 1px,transparent 0);background-size:24px 24px;touch-action:none}.canvas{display:block;width:100%;height:100%;user-select:none}.canvas .node,.canvas .edge{cursor:pointer}.canvas .module{cursor:zoom-in}.canvas .boundary-node>:not(.selection){pointer-events:none}.canvas .boundary-node>rect:first-child,.canvas .boundary-node>path:first-child{pointer-events:stroke}.canvas .selected>.selection{display:block}.selection{display:none;fill:none;stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 4px rgba(167,139,250,.55));pointer-events:none}.node-title{font-size:14px;font-weight:650;fill:var(--fg);pointer-events:none}.node-subtitle{font-size:10px;fill:var(--muted);pointer-events:none}.node-meta{font-size:9px;fill:var(--muted);pointer-events:none}.edge-label{font-size:10px;pointer-events:none}.edge.selected .edge-path{filter:drop-shadow(0 0 3px rgba(167,139,250,.7))}.edge-motion{pointer-events:none}.edge-direction-pulse{filter:drop-shadow(0 0 5px currentColor)}.animations-off .edge-motion,.document-hidden .edge-motion{display:none}@media(prefers-reduced-motion:reduce){.edge-motion{display:none}}.inspector{min-height:0;overflow:auto;border-left:1px solid var(--border);background:var(--surface)}.inspector-header{position:sticky;top:0;z-index:2;padding:14px;border-bottom:1px solid var(--border);background:rgba(24,24,27,.97)}.inspector-header h2{margin:0;font-size:13px}.inspector-header p{margin:4px 0 0;color:var(--muted);font-size:11px}.details{padding:14px}.detail-row{padding:9px 0;border-bottom:1px solid rgba(63,63,70,.65)}.detail-row dt{margin-bottom:4px;color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.detail-row dd{margin:0;font-size:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.brief h3{margin:16px 0 6px;color:#c4b5fd;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.brief p,.brief li{color:var(--muted);font-size:12px;line-height:1.55}.brief ul{margin:6px 0;padding-left:18px}.hint{position:absolute;left:14px;bottom:14px;padding:7px 9px;border:1px solid var(--border);border-radius:7px;background:rgba(24,24,27,.9);color:var(--muted);font-size:10px;pointer-events:none}.empty{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px;pointer-events:none}.empty[hidden],.minimap[hidden],.search-results[hidden]{display:none}.minimap{position:absolute;right:14px;bottom:14px;width:190px;height:120px;border:1px solid var(--border);border-radius:9px;background:rgba(9,9,11,.92);box-shadow:0 14px 35px rgba(0,0,0,.35);cursor:crosshair}.search-results{position:absolute;right:14px;top:14px;z-index:4;width:250px;max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:9px;background:rgba(24,24,27,.98);box-shadow:0 16px 40px rgba(0,0,0,.45)}.search-result{display:block;width:100%;padding:9px 11px;border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent;text-align:left}.search-result small{display:block;margin-top:2px;color:var(--muted)}.search-empty{padding:12px;color:var(--muted);font-size:11px}.badge{display:inline-flex;align-items:center;min-height:20px;padding:0 7px;border:1px solid #6d5d87;border-radius:999px;background:var(--accent-soft);color:#ddd6fe;font-size:9px;text-transform:uppercase;letter-spacing:.06em}@media(max-width:900px){.workspace{grid-template-columns:1fr}.inspector{position:absolute;right:0;top:91px;bottom:0;width:min(310px,86vw);box-shadow:-14px 0 30px rgba(0,0,0,.35)}.brand{min-width:140px}.tools button span{display:none}.search{width:150px}}`;

const VIEWER_SCRIPT = String.raw`
(function(){
  'use strict';
  var NS='http://www.w3.org/2000/svg';
  var payload=JSON.parse(document.getElementById('system-design-data').textContent);
  var doc=payload.document;
  var activeDiagramId=doc.rootDiagramId;
  var navigationStack=[];
  var selected=null;
  var viewport={x:0,y:0,zoom:1};
  var panning=null;
  var animationsEnabled=true;
  var minimapEnabled=true;
  var minimapLayout=null;
  var markerSequence=0;
  var animatedEdges=[];
  var animationElapsed=0;
  var animationLastTime=null;
  var reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
  var svg=document.getElementById('canvas');
  var world=document.getElementById('world');
  var defs=document.getElementById('defs');
  var inspector=document.getElementById('details');
  var breadcrumbs=document.getElementById('breadcrumbs');
  var minimap=document.getElementById('minimap');
  var search=document.getElementById('search');
  var searchResults=document.getElementById('search-results');
  var zoomOutput=document.getElementById('zoom-output');

  function el(name,attrs,parent){var node=document.createElementNS(NS,name);if(attrs){Object.keys(attrs).forEach(function(key){if(attrs[key]!==undefined&&attrs[key]!==null)node.setAttribute(key,String(attrs[key]));});}if(parent)parent.appendChild(node);return node;}
  function number(value,fallback){var parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
  function text(parent,value,x,y,cls,extra){var node=el('text',Object.assign({x:x,y:y,'class':cls},extra||{}),parent);node.textContent=value===undefined||value===null?'':String(value);return node;}
  function multilineText(parent,value,x,y,cls,extra,lineHeight){var node=el('text',Object.assign({x:x,y:y,'class':cls},extra||{}),parent);String(value||'').split('\n').slice(0,16).forEach(function(line,index){var span=el('tspan',{x:x,dy:index===0?0:(lineHeight||18)},node);span.textContent=line;});return node;}
  function textAttributes(node){var style=node.textStyle||{};return{fill:style.color,'font-family':style.fontFamily,'font-size':style.fontSize,'font-weight':style.fontWeight,'font-style':style.fontStyle,'text-decoration':style.textDecoration&&style.textDecoration!=='none'?style.textDecoration:undefined};}
  function textLayout(node,defaultPadding){var style=node.textStyle||{},padding=number(style.padding,defaultPadding),align=style.align||'left',anchor=align==='center'?'middle':align==='right'?'end':'start',x=align==='center'?node.width/2:align==='right'?node.width-padding:padding,fontSize=number(style.fontSize,14),lines=Math.max(1,String(node.label||'').split('\n').slice(0,16).length),lineHeight=fontSize*number(style.lineHeight,1.35),totalHeight=fontSize+(lines-1)*lineHeight,vertical=style.verticalAlign||'middle',y=vertical==='top'?padding+fontSize:vertical==='bottom'?node.height-padding-totalHeight+fontSize:(node.height-totalHeight)/2+fontSize;return{x:x,y:y,anchor:anchor,fontSize:fontSize,lineHeight:lineHeight};}
  function borderDash(node,fallback){var kind=node.style&&node.style.borderStyle;if(kind==='dashed')return'8 5';if(kind==='dotted')return'2 4';return fallback||'';}
  function activeDiagram(){return doc.diagrams[activeDiagramId]||doc.diagrams[doc.rootDiagramId];}
  function nodeById(id){return activeDiagram().nodes.find(function(node){return node.id===id;});}
  function semantic(edge){return payload.edgeSemantics[edge.type]||payload.edgeSemantics.custom;}
  function edgeColor(edge){if(edge.color)return edge.color;var roles={muted:'#a1a1aa',accent:'#a78bfa',success:'#22c55e',warning:'#f59e0b',danger:'#ef4444',blue:'#60a5fa',cyan:'#22d3ee',orange:'#fb923c'};return roles[semantic(edge).colorRole]||'#a1a1aa';}
  function resolvedEdge(edge){var definition=semantic(edge);return{definition:definition,routing:edge.routing||definition.routing||'straight',lineStyle:edge.lineStyle||definition.lineStyle||'solid',strokeWidth:number(edge.strokeWidth,definition.strokeWidth||2),opacity:edge.opacity===undefined?.9:number(edge.opacity,.9),startArrowhead:edge.startArrowhead||definition.startArrowhead||'none',endArrowhead:edge.endArrowhead||definition.endArrowhead||'standard',labelIcon:edge.labelIcon||definition.labelIcon||'none',labelPosition:edge.labelPosition===undefined?.5:Math.max(0,Math.min(1,number(edge.labelPosition,.5))),animationMode:edge.animationMode||definition.animationMode||'none',animationSpeed:Math.max(.25,Math.min(8,number(edge.animationSpeed,1))),animationDirection:edge.animationDirection||'forward'};}
  function dash(edge,resolved){if(Array.isArray(edge.dashPattern)&&edge.dashPattern.length)return edge.dashPattern.join(' ');var unit=Math.max(1,resolved.strokeWidth),patterns={dashed:(unit*4)+' '+(unit*3),dotted:unit+' '+(unit*2.5),dash_dot:(unit*5)+' '+(unit*2.5)+' '+unit+' '+(unit*2.5)};return patterns[resolved.lineStyle]||'';}
  function animationDash(edge,resolved){if(resolved.animationMode==='moving_dots')return'1 11';return dash(edge,resolved)||(Math.max(1,resolved.strokeWidth)*5)+' '+(Math.max(1,resolved.strokeWidth)*3);}
  function port(node,side){if(side==='top')return{x:node.x+node.width/2,y:node.y};if(side==='bottom')return{x:node.x+node.width/2,y:node.y+node.height};if(side==='left')return{x:node.x,y:node.y+node.height/2};return{x:node.x+node.width,y:node.y+node.height/2};}
  function edgePath(edge,source,target,routing){var a=port(source,edge.sourcePort||'right'),b=port(target,edge.targetPort||'left');if(routing==='curved'){var dx=Math.max(48,Math.abs(b.x-a.x)*.45);return'M '+a.x+' '+a.y+' C '+(a.x+dx)+' '+a.y+' '+(b.x-dx)+' '+b.y+' '+b.x+' '+b.y;}if(routing==='elbow'||routing==='orthogonal'||routing==='step'){if(routing==='step'){var first=a.x+(b.x-a.x)*.34,second=a.x+(b.x-a.x)*.66;return'M '+a.x+' '+a.y+' L '+first+' '+a.y+' L '+first+' '+b.y+' L '+second+' '+b.y+' L '+b.x+' '+b.y;}var mid=(a.x+b.x)/2;return'M '+a.x+' '+a.y+' L '+mid+' '+a.y+' L '+mid+' '+b.y+' L '+b.x+' '+b.y;}return'M '+a.x+' '+a.y+' L '+b.x+' '+b.y;}
  function arrowShape(marker,type,color){if(type==='circle'){el('circle',{cx:7,cy:5,r:3,fill:color},marker);return;}if(type==='diamond'){el('path',{d:'M 1 5 L 6 1 L 11 5 L 6 9 Z',fill:color},marker);return;}if(type==='open'){el('path',{d:'M 1 1 L 9 5 L 1 9',fill:'none',stroke:color,'stroke-width':1.6},marker);return;}el('path',{d:'M 0 0 L 10 5 L 0 10 Z',fill:type==='standard'?'none':color,stroke:color,'stroke-width':type==='standard'?1.4:0},marker);}
  function marker(type,position,color){if(type==='none')return null;var id='arrow-'+(++markerSequence),markerNode=el('marker',{id:id,viewBox:'0 0 12 10',refX:position==='start'?2:10,refY:5,markerWidth:8,markerHeight:8,orient:'auto-start-reverse'},defs);arrowShape(markerNode,type,color);return'url(#'+id+')';}
  function iconLabel(icon){return{http:'HTTP',grpc:'gRPC',websocket:'WS',database:'DB',message:'MSG',event:'EVT',stream:'STREAM',replication:'REPL',batch:'BATCH',failure:'FAIL'}[icon]||'';}
  function drawEdge(edge,nodeMap){var source=nodeMap[edge.sourceNodeId],target=nodeMap[edge.targetNodeId];if(!source||!target||source.visible===false||target.visible===false)return;var resolved=resolvedEdge(edge),color=edgeColor(edge),animation=resolved.animationMode!=='none',pathData=edgePath(edge,source,target,resolved.routing),group=el('g',{'class':'edge','data-id':edge.id,'data-render-plane':'edges','data-routing':resolved.routing,'data-line-style':resolved.lineStyle,'data-animation':resolved.animationMode,'data-label-position':resolved.labelPosition,'data-read-only':'true'},world),path=el('path',{d:pathData,fill:'none',stroke:color,'stroke-width':resolved.strokeWidth,'stroke-opacity':resolved.opacity,'stroke-dasharray':dash(edge,resolved),'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke','class':'edge-path','marker-start':marker(resolved.startArrowhead,'start',color),'marker-end':marker(resolved.endArrowhead,'end',color)},group);if(animation){var motion=null;if(resolved.animationMode==='direction_pulse'){motion=el('circle',{cx:0,cy:0,r:Math.max(3,resolved.strokeWidth+1),fill:color,'class':'edge-motion edge-direction-pulse','data-motion-kind':'travelling-particle',style:'color:'+color},group);}else{motion=el('path',{d:pathData,fill:'none',stroke:color,'stroke-width':resolved.strokeWidth+1,'stroke-opacity':resolved.animationMode==='flow_pulse'?.3:.85,'stroke-dasharray':resolved.animationMode==='flow_pulse'?'':animationDash(edge,resolved),'stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke','class':'edge-motion','data-motion-kind':resolved.animationMode},group);}animatedEdges.push({mode:resolved.animationMode,motion:motion,guide:path,speed:resolved.animationSpeed,direction:resolved.animationDirection,strokeWidth:resolved.strokeWidth});}
    var a=port(source,edge.sourcePort||'right'),b=port(target,edge.targetPort||'left'),pos=resolved.labelPosition,label=edge.label||edge.protocol,icon=iconLabel(resolved.labelIcon);if(label){var display=(icon?icon+'  ':'')+label,x=a.x+(b.x-a.x)*pos,y=a.y+(b.y-a.y)*pos-7,width=Math.max(30,display.length*6.1+12);el('rect',{x:x-width/2,y:y-12,width:width,height:17,rx:5,fill:edge.labelBackground||'#09090b','fill-opacity':.94},group);text(group,display,x,y,'edge-label',{'text-anchor':'middle',fill:edge.labelTextColor||'#a1a1aa','data-icon':resolved.labelIcon});}group.addEventListener('click',function(event){event.stopPropagation();selectElement('edge',edge.id);});}

  function animationProgress(elapsed,speed,direction){var raw=elapsed*speed/1800;if(direction==='reverse')return 1-(raw%1);if(direction==='alternate'){var cycle=raw%2;return cycle<=1?cycle:2-cycle;}return raw%1;}
  function renderAnimationFrame(elapsed){animatedEdges.forEach(function(item){if(item.mode==='moving_dash'||item.mode==='moving_dots'){var multiplier=item.direction==='reverse'?-1:1,offset=elapsed*item.speed/35*multiplier;item.motion.setAttribute('stroke-dashoffset',String(-offset));return;}if(item.mode==='flow_pulse'){var pulse=(Math.sin(elapsed*item.speed*.006)+1)/2;item.motion.setAttribute('stroke-opacity',String(.15+pulse*.6));item.motion.setAttribute('stroke-width',String(item.strokeWidth+pulse*2));return;}if(item.mode==='direction_pulse'){var length=item.guide.getTotalLength(),point=item.guide.getPointAtLength(length*animationProgress(elapsed,item.speed,item.direction));item.motion.setAttribute('cx',String(point.x));item.motion.setAttribute('cy',String(point.y));}});}
  function tickAnimations(now){if(animationLastTime===null)animationLastTime=now;var active=animationsEnabled&&!document.hidden&&!(reduceMotion&&reduceMotion.matches);if(active){animationElapsed+=Math.min(64,Math.max(0,now-animationLastTime));renderAnimationFrame(animationElapsed);}animationLastTime=now;requestAnimationFrame(tickAnimations);}

  function surface(group,node,visual){var w=node.width,h=node.height,style=node.style||{},accent=visual.accent||'#a78bfa',soft=visual.softAccent||'#2e2350',fill=style.fill||'#18181b',stroke=style.stroke||accent,sw=number(style.strokeWidth,1),radius=number(style.borderRadius,10),chrome=visual.chrome,dashes=borderDash(node,''),common={fill:fill,stroke:stroke,'stroke-width':sw,'stroke-dasharray':dashes};
    if(chrome==='identity'){el('rect',Object.assign({x:8,y:4,width:w-16,height:h-8,rx:Math.min(24,(h-8)/2)},common),group);el('circle',{cx:30,cy:h/2,r:20,fill:soft,stroke:stroke,'stroke-width':sw},group);return;}
    if(chrome==='client'){el('rect',Object.assign({x:0,y:0,width:w,height:h,rx:radius},common),group);el('rect',{x:7,y:7,width:w-14,height:h-14,rx:Math.max(0,radius-4),fill:'none',stroke:stroke,'stroke-opacity':.4},group);el('circle',{cx:14,cy:14,r:2,fill:accent},group);return;}
    if(chrome==='network'){el('rect',Object.assign({x:0,y:0,width:w,height:h,rx:radius},common),group);el('line',{x1:8,y1:h/2,x2:w-8,y2:h/2,stroke:accent,'stroke-opacity':.3,'stroke-dasharray':'3 5'},group);return;}
    if(chrome==='gateway'){el('path',Object.assign({d:'M 12 0 H '+(w-12)+' L '+w+' '+(h/2)+' L '+(w-12)+' '+h+' H 12 L 0 '+(h/2)+' Z'},common),group);return;}
    if(chrome==='datastore'){el('rect',{x:0,y:10,width:w,height:Math.max(1,h-20),fill:fill},group);el('ellipse',Object.assign({cx:w/2,cy:10,rx:w/2,ry:10,fill:soft},common),group);el('ellipse',Object.assign({cx:w/2,cy:h-10,rx:w/2,ry:10},common),group);el('line',{x1:0,y1:10,x2:0,y2:h-10,stroke:stroke,'stroke-width':sw},group);el('line',{x1:w,y1:10,x2:w,y2:h-10,stroke:stroke,'stroke-width':sw},group);return;}
    if(chrome==='object-storage'){el('path',Object.assign({d:'M 8 8 H '+(w-8)+' L '+(w-14)+' '+(h-5)+' H 14 Z'},common),group);el('ellipse',{cx:w/2,cy:8,rx:w/2-8,ry:8,fill:soft,stroke:stroke,'stroke-width':sw},group);return;}
    if(chrome==='module'){el('path',Object.assign({d:'M 0 8 H 14 L 24 0 H '+Math.min(88,w*.45)+' L '+Math.min(98,w*.52)+' 8 H '+w+' V '+h+' H 0 Z'},common),group);el('rect',{x:7,y:15,width:w-14,height:h-22,rx:7,fill:soft,'fill-opacity':.45},group);return;}
    if(chrome==='note'||chrome==='warning-note'||chrome==='assumption-note'){el('path',Object.assign({d:'M 0 0 H '+(w-18)+' L '+w+' 18 V '+h+' H 0 Z',fill:style.fill||soft},common),group);el('path',{d:'M '+(w-18)+' 0 V 18 H '+w,fill:accent,'fill-opacity':.35,stroke:stroke},group);return;}
    if(chrome==='ellipse'){el('ellipse',Object.assign({cx:w/2,cy:h/2,rx:w/2,ry:h/2},common),group);return;}
    if(chrome==='diamond'){el('path',Object.assign({d:'M '+(w/2)+' 0 L '+w+' '+(h/2)+' L '+(w/2)+' '+h+' L 0 '+(h/2)+' Z'},common),group);return;}
    if(chrome==='divider'){el('line',{x1:0,y1:h/2,x2:w,y2:h/2,stroke:stroke,'stroke-width':Math.max(1,sw),'stroke-dasharray':dashes},group);return;}
    if(chrome==='callout'){el('path',Object.assign({d:'M 0 0 H '+w+' V '+(h-18)+' H 28 L 14 '+h+' V '+(h-18)+' H 0 Z'},common),group);return;}
    if(chrome==='text'||chrome==='label'){el('rect',{x:0,y:0,width:w,height:h,fill:'transparent'},group);return;}
    if(chrome==='cluster-boundary'){el('path',Object.assign({d:'M 14 0 H '+(w-14)+' L '+w+' 14 V '+(h-14)+' L '+(w-14)+' '+h+' H 14 L 0 '+(h-14)+' V 14 Z',fill:style.fill||soft,'fill-opacity':style.fill?1:.25,'stroke-dasharray':borderDash(node,'7 4')},common),group);return;}
    var isBoundary=chrome==='boundary'||chrome==='module-boundary'||chrome==='vpc-boundary'||chrome==='region-boundary'||chrome==='availability-zone-boundary'||chrome==='deployment-boundary'||chrome==='swimlane'||chrome==='container';if(isBoundary){var fallback=chrome==='region-boundary'?'2 5':chrome==='container'?'':'8 5';el('rect',Object.assign({x:0,y:0,width:w,height:h,rx:radius,fill:style.fill||soft,'fill-opacity':style.fill?1:(chrome==='container'?.4:.2),'stroke-dasharray':borderDash(node,fallback)},common),group);if(chrome==='swimlane')el('line',{x1:0,y1:30,x2:w,y2:30,stroke:stroke,'stroke-width':sw},group);else el('rect',{x:6,y:6,width:w-12,height:Math.max(1,h-12),rx:Math.max(0,radius-3),fill:'none',stroke:stroke,'stroke-opacity':.3},group);return;}
    el('rect',Object.assign({x:0,y:0,width:w,height:h,rx:chrome==='rectangle'?0:radius,'stroke-dasharray':borderDash(node,chrome==='external'?'6 4':'')},common),group);if(chrome==='cache'){[10,18,26].forEach(function(y){el('line',{x1:6,y1:y,x2:w-6,y2:y,stroke:accent,'stroke-opacity':.45},group);});}if(chrome==='messaging'){[w-34,w-25,w-16].forEach(function(x){el('circle',{cx:x,cy:h/2,r:2,fill:accent},group);});}}

  function technologyMark(group,node,x,y){if(!node.technology)return false;var definition=payload.technologies[node.technology.id],brand=payload.technologyPaths[node.technology.id],color=definition?definition.color:'#475569',onColor=definition?definition.onColor:'#f8fafc',mark=definition?definition.mark:String(node.technology.name||'?').split(/\s+/).map(function(part){return part.charAt(0);}).join('').slice(0,2).toUpperCase(),badge=el('g',{'data-technology':node.technology.id},group);el('rect',{x:x,y:y,width:26,height:26,rx:7,fill:color},badge);if(brand){el('path',{d:brand.path,transform:'translate('+(x+4)+' '+(y+4)+') scale(.75)',fill:brand.style==='fill'?onColor:'none',stroke:brand.style==='stroke'?onColor:'none','stroke-width':brand.style==='stroke'?1.8:0,'stroke-linecap':'round','stroke-linejoin':'round'},badge);}else{text(badge,mark,x+13,y+17,'node-meta',{'text-anchor':'middle',fill:onColor,'font-weight':700});}return true;}
  function semanticMark(group,node,x,y,visual){var glyph=payload.semanticGlyphs[node.type];if(!glyph)return false;var color=visual.accent||'#a78bfa',badge=el('g',{'data-semantic-icon':node.type,'data-icon-key':glyph.key,'aria-hidden':'true'},group);el('rect',{x:x,y:y,width:26,height:26,rx:7,fill:visual.softAccent||'#27272a',stroke:color,'stroke-opacity':.45},badge);el('path',{d:glyph.path,transform:'translate('+(x+4)+' '+(y+4)+') scale(.75)',fill:glyph.style==='fill'?color:'none',stroke:glyph.style==='stroke'?color:'none','stroke-width':glyph.style==='stroke'?1.65:0,'stroke-linecap':'round','stroke-linejoin':'round'},badge);return true;}
  function boundaryNode(node){var visual=payload.visuals[node.type],chromes=['boundary','module-boundary','vpc-boundary','region-boundary','availability-zone-boundary','cluster-boundary','deployment-boundary','swimlane','container'];return !!visual&&chromes.indexOf(visual.chrome)>=0;}
  function drawNode(node){if(node.visible===false)return;var visual=payload.visuals[node.type]||{chrome:'compute',accent:'#a78bfa',softAccent:'#2e2350'},isBoundary=boundaryNode(node),group=el('g',{transform:'translate('+Math.round(node.x)+' '+Math.round(node.y)+')','class':'node '+(isBoundary?'boundary-node ':'')+(node.childDiagramId?'module ':'')+(selected&&selected.kind==='node'&&selected.id===node.id?'selected':''),'data-id':node.id,'data-type':node.type,'data-render-plane':isBoundary?'background':'foreground','data-read-only':'true',opacity:node.style&&node.style.opacity},world);if(!node.asset)surface(group,node,visual);el('rect',{x:-3,y:-3,width:node.width+6,height:node.height+6,rx:12,'class':'selection'},group);
    if(node.asset){var assetHref=node.asset.kind==='raster'?node.asset.dataUrl:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(node.asset.svg);el('image',{href:assetHref,x:0,y:0,width:node.width,height:node.height,preserveAspectRatio:'xMidYMid meet','data-asset-kind':node.asset.kind},group);}else{var annotation=['text','label','note','warning_note','assumption_note','rectangle','rounded_rectangle','ellipse','diamond','callout'].indexOf(node.type)>=0;if(annotation){var layout=textLayout(node,12),attrs=Object.assign(textAttributes(node),{'text-anchor':layout.anchor});multilineText(group,node.label,layout.x,layout.y,'node-title',attrs,layout.lineHeight);if(node.description)multilineText(group,node.description,layout.x,layout.y+layout.lineHeight,'node-subtitle',{'text-anchor':layout.anchor},15);}else{var iconY=isBoundary?8:Math.max(12,(node.height-26)/2),marked=technologyMark(group,node,12,iconY)||semanticMark(group,node,12,iconY,visual),titleX=marked?48:14,titleY=isBoundary?25:node.subtitle||node.technology?Math.max(25,node.height/2-3):node.height/2+5,titleAttrs=textAttributes(node),explicitLayout=node.textStyle&&(node.textStyle.align||node.textStyle.verticalAlign)?textLayout(node,14):null;if(explicitLayout){titleX=explicitLayout.x;titleY=explicitLayout.y;titleAttrs['text-anchor']=explicitLayout.anchor;}text(group,node.label,titleX,titleY,'node-title',titleAttrs);if(node.subtitle)text(group,node.subtitle,titleX,titleY+17,'node-subtitle',{'text-anchor':titleAttrs['text-anchor']});else if(node.technology)text(group,node.technology.name,titleX,titleY+16,'node-subtitle',{'text-anchor':titleAttrs['text-anchor']});if(node.metadata&&node.metadata.status)text(group,node.metadata.status,node.width-12,15,'node-meta',{'text-anchor':'end'});}}
    if(node.childDiagramId){var child=doc.diagrams[node.childDiagramId];text(group,(child?child.nodes.length:0)+' internal',14,node.height-14,'node-meta');text(group,'Open >',node.width-14,node.height-14,'node-meta',{'text-anchor':'end',fill:visual.accent});}group.addEventListener('click',function(event){event.stopPropagation();selectElement('node',node.id);});group.addEventListener('dblclick',function(event){event.stopPropagation();if(node.childDiagramId)openModule(node.id);});}

  function savedViewport(){var stored=activeDiagram().viewport||{};return{x:number(stored.x,0),y:number(stored.y,0),zoom:Math.max(.2,Math.min(2.5,number(stored.zoom,1)))};}
  function renderActiveDiagram(){var diagram=activeDiagram();defs.textContent='';world.textContent='';selected=null;markerSequence=0;animatedEdges=[];var nodeMap={},orderedNodes=diagram.nodes.slice().sort(function(a,b){return number(a.layer,0)-number(b.layer,0);});diagram.nodes.forEach(function(node){nodeMap[node.id]=node;});orderedNodes.filter(boundaryNode).forEach(drawNode);diagram.edges.forEach(function(edge){drawEdge(edge,nodeMap);});orderedNodes.filter(function(node){return !boundaryNode(node);}).forEach(drawNode);viewport=savedViewport();applyViewport();updateBreadcrumbs();renderDetails();document.getElementById('empty').hidden=diagram.nodes.some(function(node){return node.visible!==false;});}
  function selectElement(kind,id){selected={kind:kind,id:id};renderActiveSelection();renderDetails();}
  function renderActiveSelection(){world.querySelectorAll('.selected').forEach(function(node){node.classList.remove('selected');});if(!selected)return;var target=Array.from(world.querySelectorAll('.'+selected.kind)).find(function(node){return node.getAttribute('data-id')===selected.id;});if(target)target.classList.add('selected');}
  function clearDetails(){while(inspector.firstChild)inspector.removeChild(inspector.firstChild);}
  function detail(label,value){if(value===undefined||value===null||value==='')return;var row=document.createElement('div'),term=document.createElement('dt'),description=document.createElement('dd');row.className='detail-row';term.textContent=label;description.textContent=String(value);row.appendChild(term);row.appendChild(description);inspector.appendChild(row);}
  function metadataDetails(metadata){if(!metadata)return;Object.keys(metadata).sort().forEach(function(key){detail('Metadata / '+key,metadata[key]);});}
  function renderProblem(){var problem=payload.problem,brief=document.createElement('div'),badge=document.createElement('span');brief.className='brief';badge.className='badge';badge.textContent=problem.difficulty;brief.appendChild(badge);[['Problem',[problem.summary]],['Functional requirements',problem.requirements||[]],['Scale assumptions',problem.scaleAssumptions||[]]].forEach(function(section){var heading=document.createElement('h3');heading.textContent=section[0];brief.appendChild(heading);if(section[1].length===1&&section[0]==='Problem'){var paragraph=document.createElement('p');paragraph.textContent=section[1][0];brief.appendChild(paragraph);}else{var list=document.createElement('ul');section[1].forEach(function(value){var item=document.createElement('li');item.textContent=value;list.appendChild(item);});brief.appendChild(list);}});inspector.appendChild(brief);}
  function renderDetails(){clearDetails();var diagram=activeDiagram();if(selected&&selected.kind==='node'){var node=diagram.nodes.find(function(item){return item.id===selected.id;});if(node){var child=node.childDiagramId&&doc.diagrams[node.childDiagramId];detail('Type',node.type.replace(/_/g,' '));detail('Label',node.label);detail('Subtitle',node.subtitle);detail('Technology',node.technology&&node.technology.name);detail('Technology category',node.technology&&node.technology.category);detail('Description',node.description);detail('Position',node.x+', '+node.y);detail('Size',node.width+' x '+node.height);detail('Layer',node.layer);detail('Locked in source',node.locked?'Yes':'No');detail('Collapsed in source',node.isCollapsed===undefined?undefined:(node.isCollapsed?'Yes':'No'));detail('Internal components',child&&child.nodes.length);detail('Asset',node.asset&&node.asset.mimeType);detail('Fill',node.style&&node.style.fill);detail('Stroke',node.style&&node.style.stroke);detail('Stroke width',node.style&&node.style.strokeWidth);detail('Border radius',node.style&&node.style.borderRadius);detail('Border style',node.style&&node.style.borderStyle);detail('Opacity',node.style&&node.style.opacity);detail('Text color',node.textStyle&&node.textStyle.color);detail('Font family',node.textStyle&&node.textStyle.fontFamily);detail('Font size',node.textStyle&&node.textStyle.fontSize);detail('Font weight',node.textStyle&&node.textStyle.fontWeight);detail('Font style',node.textStyle&&node.textStyle.fontStyle);detail('Text decoration',node.textStyle&&node.textStyle.textDecoration);detail('Line height',node.textStyle&&node.textStyle.lineHeight);detail('Text padding',node.textStyle&&node.textStyle.padding);detail('Text alignment',node.textStyle&&node.textStyle.align);detail('Vertical alignment',node.textStyle&&node.textStyle.verticalAlign);metadataDetails(node.metadata);return;}}
    if(selected&&selected.kind==='edge'){var edge=diagram.edges.find(function(item){return item.id===selected.id;});if(edge){var resolved=resolvedEdge(edge),source=diagram.nodes.find(function(node){return node.id===edge.sourceNodeId;}),target=diagram.nodes.find(function(node){return node.id===edge.targetNodeId;});detail('Semantic type',resolved.definition.label);detail('Label',edge.label);detail('Protocol',edge.protocol);detail('Description',edge.description);detail('Source',source&&source.label);detail('Target',target&&target.label);detail('Source port',edge.sourcePort);detail('Target port',edge.targetPort);detail('Routing',resolved.routing);detail('Line style',resolved.lineStyle);detail('Stroke width',resolved.strokeWidth);detail('Opacity',resolved.opacity);detail('Start arrowhead',resolved.startArrowhead);detail('End arrowhead',resolved.endArrowhead);detail('Label icon',resolved.labelIcon);detail('Label position',resolved.labelPosition);detail('Label background',edge.labelBackground);detail('Label text color',edge.labelTextColor);detail('Animation',resolved.animationMode);detail('Animation speed',resolved.animationSpeed);detail('Animation direction',resolved.animationDirection);return;}}renderProblem();}

  function diagramPathFor(diagramId){var path=[],current=doc.diagrams[diagramId]||doc.diagrams[doc.rootDiagramId],guard=0;while(current&&guard++<100){path.unshift(current);if(!current.parentNodeId)break;var parent=null;Object.keys(doc.diagrams).some(function(id){var candidate=doc.diagrams[id],owner=candidate.nodes.find(function(node){return node.id===current.parentNodeId;});if(owner){parent=candidate;return true;}return false;});current=parent;}return path;}
  function diagramPath(){return diagramPathFor(activeDiagramId);}
  function updateBreadcrumbs(){breadcrumbs.textContent='';diagramPath().forEach(function(diagram,index,array){var button=document.createElement('button');button.type='button';button.textContent=diagram.name;button.addEventListener('click',function(){activeDiagramId=diagram.id;navigationStack=array.slice(0,index).map(function(item){return item.id;});renderActiveDiagram();});breadcrumbs.appendChild(button);if(index<array.length-1){var separator=document.createElement('span');separator.className='crumb-separator';separator.textContent='/';breadcrumbs.appendChild(separator);}});document.getElementById('back').disabled=activeDiagramId===doc.rootDiagramId;}
  function openModule(nodeId){var node=nodeById(nodeId);if(!node||!node.childDiagramId||!doc.diagrams[node.childDiagramId])return;navigationStack.push(activeDiagramId);activeDiagramId=node.childDiagramId;renderActiveDiagram();}
  function goBack(){var parent=navigationStack.pop();if(parent&&doc.diagrams[parent]){activeDiagramId=parent;renderActiveDiagram();return;}var path=diagramPath();if(path.length>1){activeDiagramId=path[path.length-2].id;renderActiveDiagram();}}
  function applyViewport(){world.setAttribute('transform','translate('+viewport.x+' '+viewport.y+') scale('+viewport.zoom+')');zoomOutput.textContent=Math.round(viewport.zoom*100)+'%';renderMinimap();}
  function fit(){var nodes=activeDiagram().nodes.filter(function(node){return node.visible!==false;});if(!nodes.length){viewport=savedViewport();applyViewport();return;}var rect=svg.getBoundingClientRect(),left=Math.min.apply(null,nodes.map(function(n){return n.x;})),top=Math.min.apply(null,nodes.map(function(n){return n.y;})),right=Math.max.apply(null,nodes.map(function(n){return n.x+n.width;})),bottom=Math.max.apply(null,nodes.map(function(n){return n.y+n.height;})),zoom=Math.min((rect.width-100)/Math.max(1,right-left),(rect.height-100)/Math.max(1,bottom-top),1.5);zoom=Math.max(.2,Math.min(2.5,zoom));viewport={zoom:zoom,x:rect.width/2-(left+(right-left)/2)*zoom,y:rect.height/2-(top+(bottom-top)/2)*zoom};applyViewport();}
  function zoomBy(factor){var rect=svg.getBoundingClientRect(),cx=rect.width/2,cy=rect.height/2,next=Math.max(.2,Math.min(2.5,viewport.zoom*factor)),wx=(cx-viewport.x)/viewport.zoom,wy=(cy-viewport.y)/viewport.zoom;viewport={x:cx-wx*next,y:cy-wy*next,zoom:next};applyViewport();}
  function renderMinimap(){if(!minimapEnabled)return;var diagram=activeDiagram(),nodes=diagram.nodes.filter(function(node){return node.visible!==false;});while(minimap.firstChild)minimap.removeChild(minimap.firstChild);minimapLayout=null;if(!nodes.length)return;var left=Math.min.apply(null,nodes.map(function(n){return n.x;})),top=Math.min.apply(null,nodes.map(function(n){return n.y;})),right=Math.max.apply(null,nodes.map(function(n){return n.x+n.width;})),bottom=Math.max.apply(null,nodes.map(function(n){return n.y+n.height;})),width=Math.max(1,right-left),height=Math.max(1,bottom-top),scale=Math.min(174/width,104/height),ox=8-left*scale,oy=8-top*scale,nodeMap={};nodes.forEach(function(node){nodeMap[node.id]=node;});diagram.edges.forEach(function(edge){var source=nodeMap[edge.sourceNodeId],target=nodeMap[edge.targetNodeId];if(source&&target)el('line',{x1:(source.x+source.width/2)*scale+ox,y1:(source.y+source.height/2)*scale+oy,x2:(target.x+target.width/2)*scale+ox,y2:(target.y+target.height/2)*scale+oy,stroke:'#52525b','stroke-width':1},minimap);});nodes.forEach(function(node){var visual=payload.visuals[node.type]||{accent:'#a78bfa'};el('rect',{x:node.x*scale+ox,y:node.y*scale+oy,width:Math.max(2,node.width*scale),height:Math.max(2,node.height*scale),rx:2,fill:visual.accent,'fill-opacity':.55},minimap);});var canvasRect=svg.getBoundingClientRect();el('rect',{x:(-viewport.x/viewport.zoom)*scale+ox,y:(-viewport.y/viewport.zoom)*scale+oy,width:(canvasRect.width/viewport.zoom)*scale,height:(canvasRect.height/viewport.zoom)*scale,fill:'none',stroke:'#a78bfa','stroke-width':1},minimap);minimapLayout={scale:scale,ox:ox,oy:oy};}
  function navigateFromMinimap(event){if(!minimapLayout)return;var rect=minimap.getBoundingClientRect(),px=(event.clientX-rect.left)*190/rect.width,py=(event.clientY-rect.top)*120/rect.height,wx=(px-minimapLayout.ox)/minimapLayout.scale,wy=(py-minimapLayout.oy)/minimapLayout.scale,canvasRect=svg.getBoundingClientRect();viewport.x=canvasRect.width/2-wx*viewport.zoom;viewport.y=canvasRect.height/2-wy*viewport.zoom;applyViewport();}
  function runSearch(){var query=search.value.trim().toLowerCase();searchResults.textContent='';if(!query){searchResults.hidden=true;return;}var matches=[];Object.keys(doc.diagrams).forEach(function(diagramId){doc.diagrams[diagramId].nodes.forEach(function(node){var metadata=node.metadata?Object.values(node.metadata).join(' '):'',hay=[node.label,node.subtitle,node.description,node.technology&&node.technology.name,metadata,doc.diagrams[diagramId].name].filter(Boolean).join(' ').toLowerCase();if(hay.indexOf(query)>=0)matches.push({diagramId:diagramId,node:node});});});matches.slice(0,30).forEach(function(match){var button=document.createElement('button'),small=document.createElement('small');button.type='button';button.className='search-result';button.appendChild(document.createTextNode(match.node.label));small.textContent=doc.diagrams[match.diagramId].name+' / '+match.node.type.replace(/_/g,' ');button.appendChild(small);button.addEventListener('click',function(){var path=diagramPathFor(match.diagramId);activeDiagramId=match.diagramId;navigationStack=path.slice(0,-1).map(function(item){return item.id;});renderActiveDiagram();selectElement('node',match.node.id);searchResults.hidden=true;});searchResults.appendChild(button);});if(!matches.length){var empty=document.createElement('div');empty.className='search-empty';empty.textContent='No matching components.';searchResults.appendChild(empty);}searchResults.hidden=false;}

  svg.addEventListener('click',function(){selected=null;renderActiveSelection();renderDetails();});svg.addEventListener('wheel',function(event){event.preventDefault();var rect=svg.getBoundingClientRect(),px=event.clientX-rect.left,py=event.clientY-rect.top,wx=(px-viewport.x)/viewport.zoom,wy=(py-viewport.y)/viewport.zoom,next=Math.max(.2,Math.min(2.5,viewport.zoom*(event.deltaY>0?.9:1.1)));viewport={x:px-wx*next,y:py-wy*next,zoom:next};applyViewport();},{passive:false});svg.addEventListener('pointerdown',function(event){if(event.target!==svg&&event.target.id!=='world-background')return;svg.setPointerCapture(event.pointerId);panning={x:event.clientX,y:event.clientY,vx:viewport.x,vy:viewport.y};});svg.addEventListener('pointermove',function(event){if(!panning)return;viewport.x=panning.vx+event.clientX-panning.x;viewport.y=panning.vy+event.clientY-panning.y;applyViewport();});svg.addEventListener('pointerup',function(){panning=null;});svg.addEventListener('pointercancel',function(){panning=null;});
  document.getElementById('back').addEventListener('click',goBack);document.getElementById('fit').addEventListener('click',fit);document.getElementById('reset').addEventListener('click',function(){viewport=savedViewport();applyViewport();});document.getElementById('zoom-in').addEventListener('click',function(){zoomBy(1.15);});document.getElementById('zoom-out').addEventListener('click',function(){zoomBy(1/1.15);});document.getElementById('animations').addEventListener('click',function(event){animationsEnabled=!animationsEnabled;document.body.classList.toggle('animations-off',!animationsEnabled);event.currentTarget.setAttribute('aria-pressed',String(animationsEnabled));});document.getElementById('minimap-toggle').addEventListener('click',function(event){minimapEnabled=!minimapEnabled;minimap.toggleAttribute('hidden',!minimapEnabled);event.currentTarget.setAttribute('aria-pressed',String(minimapEnabled));});minimap.addEventListener('click',navigateFromMinimap);minimap.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();fit();}});search.addEventListener('input',runSearch);search.addEventListener('keydown',function(event){if(event.key==='Escape'){search.value='';searchResults.hidden=true;}});document.addEventListener('visibilitychange',function(){document.body.classList.toggle('document-hidden',document.hidden);});document.addEventListener('keydown',function(event){if(event.altKey&&event.key==='ArrowLeft'){event.preventDefault();goBack();}if(event.key==='Escape'){selected=null;renderActiveSelection();renderDetails();searchResults.hidden=true;}});
  document.body.classList.toggle('document-hidden',document.hidden);renderActiveDiagram();requestAnimationFrame(fit);requestAnimationFrame(tickAnimations);
})();`;

export function prepareInteractiveSystemDesignHtml(
  document: SystemDesignDocument,
  problem: Pick<
    SystemDesignProblem,
    | "slug"
    | "title"
    | "summary"
    | "requirements"
    | "scaleAssumptions"
    | "difficulty"
  >,
): InteractiveSystemDesignHtmlExport {
  const parsedDocument = parseSystemDesignDocument(document);
  const payload: InteractiveViewerPayload = {
    document: parsedDocument,
    problem,
    visuals: Object.fromEntries(
      Object.values(SYSTEM_DESIGN_NODE_DEFINITIONS).map((definition) => [
        definition.type,
        getSystemDesignNodeVisual(definition.type),
      ]),
    ),
    technologies: SYSTEM_DESIGN_TECHNOLOGY_REGISTRY,
    technologyPaths: SYSTEM_DESIGN_TECHNOLOGY_BRAND_PATHS,
    semanticGlyphs: Object.fromEntries(
      Object.values(SYSTEM_DESIGN_NODE_DEFINITIONS).map((definition) => [
        definition.type,
        {
          key: definition.iconKey,
          ...SYSTEM_DESIGN_SEMANTIC_GLYPH_PATHS[definition.iconKey],
        },
      ]),
    ),
    edgeSemantics: SYSTEM_DESIGN_EDGE_SEMANTICS,
  };
  const title = `${problem.title} - Recall Stack System Design`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>${escapeHtml(title)}</title>
  <style>${VIEWER_STYLES}</style>
</head>
<body data-read-only="true">
  <main class="app">
    <header class="topbar">
      <div class="brand"><strong>${escapeHtml(problem.title)}</strong><span>Recall Stack / read-only architecture</span></div>
      <input id="search" class="search" type="search" placeholder="Search components..." aria-label="Search components">
      <div class="tools">
        <button id="back" type="button" title="Back to parent diagram">&larr; <span>Back</span></button>
        <button id="animations" type="button" aria-pressed="true" title="Toggle configured connection animations">Flow</button>
        <button id="minimap-toggle" type="button" aria-pressed="true" title="Toggle minimap">Map</button>
        <button id="fit" type="button" title="Fit to screen">Fit</button>
        <button id="reset" type="button" title="Reset to saved viewport">Reset</button>
        <button id="zoom-out" type="button" aria-label="Zoom out">&minus;</button><output id="zoom-output" class="zoom">100%</output><button id="zoom-in" type="button" aria-label="Zoom in">+</button>
      </div>
    </header>
    <nav id="breadcrumbs" class="breadcrumbs" aria-label="Diagram breadcrumb"></nav>
    <section class="workspace">
      <div class="canvas-wrap">
        <svg id="canvas" class="canvas" role="application" aria-label="Interactive read-only system design diagram">
          <defs id="defs"></defs>
          <rect id="world-background" width="100%" height="100%" fill="transparent"></rect>
          <g id="world"></g>
        </svg>
        <div id="empty" class="empty" hidden>This diagram has no visible components.</div>
        <div id="search-results" class="search-results" role="region" aria-label="Component search results" hidden></div>
        <svg id="minimap" class="minimap" viewBox="0 0 190 120" role="button" tabindex="0" aria-label="Diagram minimap"></svg>
        <div class="hint">Wheel to zoom / drag the canvas to pan / double-click a module to open it</div>
      </div>
      <aside class="inspector" aria-label="Selection details">
        <div class="inspector-header"><h2>Properties</h2><p>Click a component or connection to inspect it.</p></div>
        <dl id="details" class="details"></dl>
      </aside>
    </section>
  </main>
  <script type="application/json" id="system-design-data">${serializeForHtml(payload)}</script>
  <script>${VIEWER_SCRIPT}</script>
</body>
</html>`;
  return {
    filename: `${safeFilename(problem.slug)}-system-design.html`,
    html,
  };
}

export function downloadInteractiveSystemDesignHtml(
  documentValue: SystemDesignDocument,
  problem: Pick<
    SystemDesignProblem,
    | "slug"
    | "title"
    | "summary"
    | "requirements"
    | "scaleAssumptions"
    | "difficulty"
  >,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Diagram downloads are only available in a browser.");
  }
  const exported = prepareInteractiveSystemDesignHtml(documentValue, problem);
  const url = URL.createObjectURL(
    new Blob([exported.html], { type: "text/html;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = exported.filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
