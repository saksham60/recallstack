import type { DiagramShapeDefinition, DiagramShapeElement } from "../../core/types";

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderGenericShapeSvg(element: DiagramShapeElement, definition: DiagramShapeDefinition): string {
  const { width: width, height } = element;
  const style = { ...definition.defaultStyle, ...element.style };
  const fill = escape(style.fill ?? "transparent");
  const stroke = escape(style.stroke ?? "#a78bfa");
  const strokeWidth = style.strokeWidth ?? 1.5;
  const opacity = style.opacity ?? 1;
  const dash = style.strokeStyle === "dashed" ? ' stroke-dasharray="8 5"' : style.strokeStyle === "dotted" ? ' stroke-dasharray="2 4"' : "";
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${dash}`;
  switch (definition.rendererId) {
    case "generic.rounded-rectangle": return `<rect width="${width}" height="${height}" rx="${style.cornerRadius ?? 12}" ${common}/>`;
    case "generic.circle": return `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 2}" ${common}/>`;
    case "generic.ellipse": return `<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" ${common}/>`;
    case "generic.diamond": return `<polygon points="${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}" ${common}/>`;
    case "generic.triangle": return `<polygon points="${width / 2},0 ${width},${height} 0,${height}" ${common}/>`;
    case "generic.hexagon": return `<polygon points="${width * .22},0 ${width * .78},0 ${width},${height / 2} ${width * .78},${height} ${width * .22},${height} 0,${height / 2}" ${common}/>`;
    case "generic.parallelogram": return `<polygon points="${width * .16},0 ${width},0 ${width * .84},${height} 0,${height}" ${common}/>`;
    case "generic.trapezoid": return `<polygon points="0,0 ${width},${height * .16} ${width * .86},${height} ${width * .14},${height}" ${common}/>`;
    case "generic.cylinder": return `<path d="M0 ${height * .12} A${width / 2} ${height * .12} 0 0 1 ${width} ${height * .12} V${height * .88} A${width / 2} ${height * .12} 0 0 1 0 ${height * .88}Z" ${common}/><ellipse cx="${width / 2}" cy="${height * .12}" rx="${width / 2}" ry="${height * .12}" ${common}/>`;
    case "generic.document": return `<path d="M0 0H${width}V${height * .82}Q${width * .75} ${height * 1.06} ${width * .5} ${height * .82}Q${width * .25} ${height * .58} 0 ${height * .82}Z" ${common}/>`;
    case "generic.cloud": return `<path d="M${width * .25} ${height * .87}C${width * .12} ${height * .87} ${width * .05} ${height * .73} ${width * .05} ${height * .57}C${width * .05} ${height * .4} ${width * .13} ${height * .27} ${width * .24} ${height * .27}C${width * .29} ${height * .12} ${width * .38} ${height * .05} ${width * .48} ${height * .08}C${width * .57} ${height * .1} ${width * .64} ${height * .2} ${width * .68} ${height * .33}C${width * .82} ${height * .3} ${width * .94} ${height * .45} ${width * .95} ${height * .65}C${width * .96} ${height * .78} ${width * .88} ${height * .9} ${width * .79} ${height * .9}Z" ${common}/>`;
    case "generic.person": return `<circle cx="${width / 2}" cy="${height * .23}" r="${Math.min(width, height) * .15}" ${common}/><path d="M${width * .16} ${height * .9}L${width * .2} ${height * .64}L${width * .36} ${height * .49}H${width * .64}L${width * .8} ${height * .64}L${width * .84} ${height * .9}Z" ${common}/>`;
    case "generic.note": return `<path d="M0 0H${width - 18}L${width} 18V${height}H0Z M${width - 18} 0V18H${width}" ${common}/>`;
    case "generic.frame": {
      const frameDash = dash || ' stroke-dasharray="8 5"';
      return `<rect width="${width}" height="${height}" rx="${style.cornerRadius ?? 10}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}"${frameDash}/>`;
    }
    case "generic.text": return "";
    default: return `<rect width="${width}" height="${height}" rx="${style.cornerRadius ?? 0}" ${common}/>`;
  }
}
