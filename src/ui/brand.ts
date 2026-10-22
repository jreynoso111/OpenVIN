import { svgEl } from './dom';

/** Orbital road and vehicle file mark shared by the header, favicon, and previews. */
export function createBrandMark(className = 'brand-mark'): SVGElement {
  return svgEl(
    'svg',
    { class: className, viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('rect', { width: '64', height: '64', rx: '16', fill: '#14243A' }),
    svgEl('ellipse', {
      cx: '32',
      cy: '32',
      rx: '23',
      ry: '10',
      transform: 'rotate(-34 32 32)',
      fill: 'none',
      stroke: '#85D7EC',
      'stroke-width': '2.5',
    }),
    svgEl('ellipse', {
      cx: '32',
      cy: '32',
      rx: '17',
      ry: '7',
      transform: 'rotate(38 32 32)',
      fill: 'none',
      stroke: '#E9A95B',
      'stroke-width': '1.5',
      opacity: '0.8',
    }),
    svgEl('path', {
      d: 'M24 23 32 42 40 23',
      fill: 'none',
      stroke: '#F5F3EA',
      'stroke-width': '4',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
    svgEl('circle', { cx: '48', cy: '18', r: '3.5', fill: '#F4A64D' }),
  );
}
