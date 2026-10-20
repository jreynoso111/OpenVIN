/**
 * Apple-style segmented tab control + panels (WAI-ARIA tabs pattern).
 * Panels stay mounted (display:none when inactive) so hydration is
 * unaffected by which tab is visible. Switching = opacity-only crossfade.
 */

import { el } from './dom';

export interface TabSpec {
  readonly id: string;
  readonly label: string;
}

export interface Tabs {
  /** Segmented control (mount under the summary band). */
  readonly control: HTMLElement;
  /** Wrapper containing every panel (mount below the control). */
  readonly panels: HTMLElement;
  panel(id: string): HTMLElement;
  activate(id: string, options?: { readonly focusTab?: boolean }): void;
}

const NAV_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End'] as const;

export function createTabs(
  specs: readonly TabSpec[],
  defaultId: string,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
): Tabs {
  const buttons = new Map<string, HTMLButtonElement>();
  const panelMap = new Map<string, HTMLElement>();
  let activeId = defaultId;

  const indicator = el('span', { class: 'seg-indicator', 'aria-hidden': 'true' });
  const track = el(
    'div',
    {
      class: `seg-track${orientation === 'vertical' ? ' seg-track--vertical' : ''}`,
      role: 'tablist',
      'aria-label': orientation === 'vertical' ? 'Vehicle file sections' : 'Report sections',
    },
    indicator,
  );
  track.style.setProperty('--tab-count', String(specs.length));
  const panelsWrap = el('div', { class: 'tab-panels' });

  const activate = (
    id: string,
    options: { readonly focusTab?: boolean } = {},
  ): void => {
    if (!panelMap.has(id)) return;
    activeId = id;
    specs.forEach((spec, index) => {
      const button = buttons.get(spec.id);
      const panel = panelMap.get(spec.id);
      if (!button || !panel) return;
      const isSelected = spec.id === id;
      button.setAttribute('aria-selected', String(isSelected));
      button.tabIndex = isSelected ? 0 : -1;
      if (isSelected) {
        indicator.style.transform = `translateX(${index * 100}%)`;
        if (panel.hidden) {
          panel.hidden = false;
          // Retrigger the crossfade (opacity only; killed under reduced motion).
          panel.classList.remove('panel-fade');
          void panel.offsetWidth;
          panel.classList.add('panel-fade');
        }
      } else {
        panel.hidden = true;
      }
    });
    if (options.focusTab) buttons.get(id)?.focus();
  };

  track.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!(NAV_KEYS as readonly string[]).includes(event.key)) return;
    event.preventDefault();
    const current = specs.findIndex((spec) => spec.id === activeId);
    const count = specs.length;
    const next =
      event.key === 'ArrowRight'
        ? (current + 1) % count
        : event.key === 'ArrowLeft'
          ? (current - 1 + count) % count
          : event.key === 'Home'
            ? 0
            : count - 1;
    const spec = specs[next];
    if (spec) activate(spec.id, { focusTab: true });
  });

  for (const spec of specs) {
    const isDefault = spec.id === defaultId;
    const button = el(
      'button',
      {
        class: 'seg-tab',
        type: 'button',
        role: 'tab',
        id: `tab-${spec.id}`,
        'aria-selected': String(isDefault),
        'aria-controls': `panel-${spec.id}`,
        onclick: () => activate(spec.id),
      },
      spec.label,
    );
    button.tabIndex = isDefault ? 0 : -1;
    buttons.set(spec.id, button);
    track.append(button);

    const panel = el('div', {
      class: 'tab-panel',
      role: 'tabpanel',
      id: `panel-${spec.id}`,
      'aria-labelledby': `tab-${spec.id}`,
    });
    panel.hidden = !isDefault;
    panelMap.set(spec.id, panel);
    panelsWrap.append(panel);
  }

  return {
    control: el('div', { class: 'seg-wrap' }, track),
    panels: panelsWrap,
    panel(id: string): HTMLElement {
      const panel = panelMap.get(id);
      if (!panel) throw new Error(`Unknown tab panel: ${id}`);
      return panel;
    },
    activate,
  };
}
