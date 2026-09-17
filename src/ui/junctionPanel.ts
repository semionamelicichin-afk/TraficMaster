import { approachName, approaches, junctionControl } from '../domain/controls';
import type { RoadSign } from '../domain/model';
import type { Controller } from './controller';

export function syncJunctionPanel(root: HTMLElement, controller: Controller): void {
  const node = controller.selection?.id;
  if (!node || !controller.isJunction) { root.replaceChildren(); return; }
  const control = junctionControl(controller.network, node);
  const activeSignal = !!controller.network.signals[node];
  root.innerHTML = `<h3>Priority without signals</h3><p class="field-help">Choose exactly two main approaches. The main road may turn. Other approaches use STOP or Yield.</p><fieldset ${activeSignal ? 'disabled' : ''}><legend>Road approaches</legend><div id="approach-rows"></div><p id="main-count" data-testid="main-count" class="field-help"></p><button id="apply-priority" data-testid="apply-priority" class="full">Apply priority & signs</button></fieldset><p class="field-help">${activeSignal ? 'Signals are active and override these signs. Remove the signal to edit priority.' : 'STOP: full stop for 1 second, then yield. Yield: wait only when another approach has priority.'}</p>`;
  const rows = root.querySelector<HTMLElement>('#approach-rows')!;
  for (const from of approaches(controller.network, node)) {
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.dataset.approach = from;
    const name = approachName(controller.network, node, from);
    select.setAttribute('aria-label', `${name} approach`); select.dataset.testid = `approach-${name.toLowerCase()}`;
    label.textContent = `${name} · ${from}`;
    for (const [value, text] of [['main', '◆ Main road'], ['yield', '▽ Yield'], ['stop', 'STOP']]) select.add(new Option(text, value));
    select.value = control.main.includes(from) ? 'main' : control.signs[from];
    label.append(select); rows.append(label);
  }
  const count = () => {
    const main = [...rows.querySelectorAll('select')].filter(select => select.value === 'main').length;
    root.querySelector<HTMLElement>('#main-count')!.textContent = `${main} / 2 main approaches`;
    root.querySelector<HTMLButtonElement>('#apply-priority')!.disabled = activeSignal || main !== 2;
  };
  rows.addEventListener('change', count); count();
  root.querySelector<HTMLButtonElement>('#apply-priority')!.onclick = () => {
    const main: string[] = [], signs: Record<string, RoadSign> = {};
    rows.querySelectorAll('select').forEach(select => {
      const from = select.dataset.approach!;
      if (select.value === 'main') main.push(from); else signs[from] = select.value as RoadSign;
    });
    controller.priority(main, signs);
  };
}
