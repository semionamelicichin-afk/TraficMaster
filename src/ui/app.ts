import { metrics } from '../simulation/metrics';
import { type Controller, type Tool } from './controller';
import type { TrafficScene } from '../rendering/TrafficScene';
import { syncJunctionPanel } from './junctionPanel';
import type { Gateway } from '../domain/model';
import { syncZonePanel, updateZoneStatus } from './zonePanel';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing interface element: ${id}`);
  return found as T;
}
export function mountUI(controller: Controller): (scene: TrafficScene) => void {
  element('app').innerHTML = `
    <header class="topbar">
      <div class="brand"><span class="brand-icon" aria-hidden="true">↗</span><div><h1>Traffic Flow <span>Manager</span></h1><p>A LITTLE CITY. A BETTER FLOW.</p></div></div>
      <div class="file-actions"><button id="demo" data-testid="demo">Demo city</button><button id="reset" data-testid="reset">New city</button><span class="divider"></span><button id="load" data-testid="load">Load</button><button id="save" data-testid="save" class="dark">Save city ↗</button></div>
    </header>
    <main class="workspace">
      <aside class="sidebar" aria-label="Road editor">
        <div class="section-heading"><span>01 / TOOLBOX</span><span class="live-dot"></span></div>
        <h2>Shape the flow.</h2><p class="muted intro">Connect a city.<br>Keep it moving.</p>
        <div class="tools" role="group" aria-label="Map tools">
          <button data-tool="zone" data-testid="tool-zone"><b aria-hidden="true">⌂</b><span>Zones<span class="tool-caption">Homes, shops & freight</span></span></button>
          <button data-tool="select" data-testid="tool-select"><b aria-hidden="true">↖</b><span>Select<span class="tool-caption">Inspect roads & junctions</span></span></button>
          <button data-tool="build" data-testid="tool-build"><b aria-hidden="true">＋</b><span>Build road<span class="tool-caption">Connect two grid points</span></span></button>
          <button data-tool="erase" data-testid="tool-erase"><b aria-hidden="true">−</b><span>Remove<span class="tool-caption">Delete a road segment</span></span></button>
          <button data-tool="pan" data-testid="tool-pan"><b aria-hidden="true">✥</b><span>Move map<span class="tool-caption">Drag to explore</span></span></button>
          <button data-tool="junction" data-testid="tool-junction"><b aria-hidden="true">⋈</b><span>Junctions<span class="tool-caption">Signals, signs & gateways</span></span></button>
        </div>
        <section class="inspector" id="road-inspector"><div class="section-heading">ROAD SETTINGS</div>
          <label for="lanes">Lanes per direction</label><select id="lanes" data-testid="lanes"><option value="1">1 lane</option><option value="2">2 lanes</option></select>
          <label for="direction">Traffic direction</label><select id="direction" data-testid="direction"><option value="two">Two-way ↔</option><option value="one">One-way →</option></select>
          <p id="direction-help" class="field-help">One-way follows your first → second point.</p>
          <button id="apply-road" data-testid="apply-road" class="full">Apply to entire section</button>
        </section>
        <section class="inspector signal-inspector" id="signal-inspector"><div class="section-heading">JUNCTION CONTROL</div>
          <label for="green">Green phase <output id="green-value">6 s</output></label><input type="range" id="green" data-testid="green" min="2" max="30" value="6" />
          <div class="button-pair"><button id="signal" data-testid="signal">Add / update signal</button><button id="remove-signal" data-testid="remove-signal">Remove signal</button></div>
          <p class="field-help">Select a junction. Signals alternate horizontal and vertical traffic.</p>
          <div id="priority-panel" data-testid="priority-panel"></div>
        </section>
        <section class="inspector" id="gateway-inspector" hidden>
          <label for="gateway-role">City gateway</label>
          <select id="gateway-role" data-testid="gateway-role"><option value="none">No gateway</option><option value="entry">Entry — generates trips</option><option value="exit">Exit — receives trips</option><option value="both">Entry & exit</option></select>
          <button id="apply-gateway" data-testid="apply-gateway" class="full">Apply gateway</button>
          <p class="field-help">Add as many entries and exits as needed. Trips respect one-way roads and only start when an exit is reachable.</p>
        </section>
        <div class="local-note"><span class="live-dot"></span> Your city stays on this device.</div>
      </aside>
      <section class="map-panel" aria-label="City simulation">
        <div class="map-heading"><div><span class="eyebrow">SANDBOX / GRID 20 × 14</span><h2>Your network <span id="road-count" data-testid="road-count"></span></h2></div><span class="state-badge" id="state" data-testid="state">PAUSED</span></div>
        <div class="map-wrap"><div id="map"></div><div class="map-legend"><span class="legend-origin"></span> Trip endpoint <span class="legend-signal"></span> Signal</div><div class="zoom-controls" aria-label="Map view"><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit" aria-label="Fit map">⌗</button><button id="zoom-in" aria-label="Zoom in">＋</button></div></div>
        <section id="context-panel" data-testid="context-panel" class="context-panel" aria-label="Selected object settings" hidden>
          <div class="context-heading"><strong id="context-title">Selected road</strong><button id="close-context" aria-label="Close selected object settings">×</button></div>
          <p id="selection" data-testid="selection" class="selection">No object selected</p>
          <p id="section-summary" data-testid="section-summary" class="field-help"></p>
        </section>
        <div class="history-controls" role="group" aria-label="Edit history"><button id="undo" data-testid="undo" title="Undo (Ctrl/Cmd+Z)">↶ Undo</button><button id="redo" data-testid="redo" title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button><button id="cancel-build" data-testid="cancel-build" hidden>Cancel build</button><span id="gateway-count" data-testid="gateway-count"></span></div>
        <div class="map-status" id="message" data-testid="message" role="status"></div>
        <div class="transport"><button id="run" data-testid="run" class="primary">▶ Run simulation</button><div class="speed-group" role="group" aria-label="Simulation speed"><button data-speed="1" data-testid="speed-1">1×</button><button data-speed="2" data-testid="speed-2">2×</button><button data-speed="4" data-testid="speed-4">4×</button></div><div class="clock"><span>SIMULATION TIME</span><strong id="time" data-testid="time">00:00</strong></div></div>
      </section>
      <section class="metrics-panel" aria-label="Live statistics"><div class="metrics-title"><span class="live-dot"></span> LIVE NETWORK<span class="muted">Make every trip count.</span></div><div class="metrics-grid">
        <article><span>Vehicles</span><strong id="metric-count" data-testid="metric-count">0</strong><small>on the network</small></article>
        <article><span>Average speed</span><strong><span id="metric-speed">0</span><em>km/h</em></strong><small>active vehicles</small></article>
        <article><span>Average trip</span><strong><span id="metric-trip">—</span><em>sec</em></strong><small>completed trips</small></article>
        <article><span>In queue</span><strong id="metric-queue">0</strong><small>waiting vehicles</small></article>
        <article><span>Network load</span><strong><span id="metric-load">0</span><em>%</em></strong><small>estimated occupancy</small></article>
      </div><p class="field-help" id="zone-summary" data-testid="zone-summary"></p><p class="field-help" id="freight-summary" data-testid="freight-summary"></p></section>
    </main>
    <dialog id="reset-dialog"><h2>Start a new city?</h2><p>This replaces the current map. Your last manual save remains available.</p><div class="button-pair"><button id="cancel-reset">Keep editing</button><button id="confirm-reset" data-testid="confirm-reset" class="primary">Start empty</button></div></dialog>`;
  const c = controller;
  const sidebar = document.querySelector<HTMLElement>('.sidebar')!;
  const panel = element('context-panel');
  const roadInspector = element('road-inspector'), signalInspector = element('signal-inspector');
  const gatewayInspector = element('gateway-inspector'); panel.append(gatewayInspector);
  const zoneInspector = document.createElement('section'); zoneInspector.className = 'inspector'; zoneInspector.id = 'zone-inspector'; zoneInspector.dataset.testid = 'zone-inspector'; panel.insertBefore(zoneInspector, gatewayInspector);
  const sync = () => {
    const contextual = !!c.selection && !c.start && (c.tool === 'select' || c.tool === 'build' || c.tool === 'junction' || c.tool === 'zone');
    panel.hidden = !contextual;
    const roadContext = contextual && c.selection?.kind === 'road';
    const signalContext = contextual && c.isJunction;
    const roadParent = roadContext ? panel : sidebar, signalParent = signalContext ? panel : sidebar;
    if (roadInspector.parentElement !== roadParent) roadParent.append(roadInspector);
    if (signalInspector.parentElement !== signalParent) signalParent.append(signalInspector);
    signalInspector.hidden = !signalContext;
    roadInspector.hidden = contextual && !roadContext;
    gatewayInspector.hidden = !contextual || !c.isEndpoint;
    element<HTMLSelectElement>('gateway-role').value = c.selection ? c.network.gates[c.selection.id] ?? 'none' : 'none';
    syncJunctionPanel(element('priority-panel'), c);
    syncZonePanel(zoneInspector, c);
    if (c.tool === 'zone' || (c.selection && c.network.zones[c.selection.id])) gatewayInspector.hidden = true;
    const gates = Object.values(c.network.gates);
    element('gateway-count').textContent = `${gates.filter(g => g !== 'exit').length} entries · ${gates.filter(g => g !== 'entry').length} exits`;
    element('context-title').textContent = roadContext ? 'Road section' : c.isJunction ? 'Junction management' : 'City gateway';
    if (c.tool === 'zone' || (c.selection && c.network.zones[c.selection.id])) element('context-title').textContent = 'Destination zone';
    const section = c.section;
    const selectedRoad = section.roads.length ? c.network.roads[c.selection!.id] : undefined;
    const mixed = selectedRoad && section.roads.some((id, i) => {
      const road = c.network.roads[id];
      return road.lanes !== selectedRoad.lanes || road.oneWay !== selectedRoad.oneWay || (road.oneWay && road.a !== section.nodes[i]);
    });
    element('section-summary').textContent = roadContext ? `${section.roads.length} segments · ${section.nodes[0]} → ${section.nodes.at(-1)}.${mixed ? ' Mixed settings; controls show the clicked segment.' : ''}` : c.isJunction ? 'Manage signals or designate two main approaches and signs.' : 'Choose whether this endpoint is an entry, exit, or both.';
    element('direction-help').textContent = roadContext ? 'One-way follows the endpoints shown above. Apply updates every segment in this section.' : 'One-way follows your first → second point.';
    if (c.tool === 'zone' || (c.selection && c.network.zones[c.selection.id])) element('section-summary').textContent = 'Use a dedicated two-way access road. Colored parking spaces stay outside traffic lanes.';
    element<HTMLButtonElement>('undo').disabled = !c.canUndo;
    element<HTMLButtonElement>('redo').disabled = !c.canRedo;
    element('cancel-build').hidden = !c.start;
    document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === c.tool)));
    document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === c.settings.speed)));
    element('run').textContent = c.running ? 'Ⅱ Pause simulation' : '▶ Run simulation';
    element('state').textContent = c.running ? 'RUNNING' : 'PAUSED'; element('state').classList.toggle('running', c.running);
    element('message').textContent = c.message; element('message').classList.toggle('error', c.error);
    element('road-count').textContent = `${Object.keys(c.network.roads).length} segments`;
    element<HTMLSelectElement>('lanes').value = String(c.settings.lanes);
    element<HTMLSelectElement>('direction').value = c.settings.oneWay ? 'one' : 'two';
    element<HTMLInputElement>('green').value = String(c.settings.green); element('green-value').textContent = `${c.settings.green} s`;
    element('selection').textContent = roadContext
      ? `Road ${section.nodes[0]} → ${section.nodes.at(-1)}`
      : c.selection ? `Node ${c.selection.id}` : 'No object selected';
    element<HTMLButtonElement>('apply-road').disabled = c.selection?.kind !== 'road';
    element<HTMLButtonElement>('signal').disabled = !c.isJunction;
    element<HTMLButtonElement>('remove-signal').disabled = !c.isJunction || !c.selection || !c.network.signals[c.selection.id];
  };
  c.changed = sync;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b => b.addEventListener('click', () => c.setTool(b.dataset.tool as Tool)));
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach(b => b.addEventListener('click', () => { c.settings.speed = Number(b.dataset.speed) as 1 | 2 | 4; sync(); }));
  element('run').onclick = () => c.toggleRunning();
  element('save').onclick = () => c.save(); element('load').onclick = () => c.load();
  element('demo').onclick = () => c.reset(true);
  element('reset').onclick = () => element<HTMLDialogElement>('reset-dialog').showModal();
  element('cancel-reset').onclick = () => element<HTMLDialogElement>('reset-dialog').close();
  element('confirm-reset').onclick = () => { c.reset(false); element<HTMLDialogElement>('reset-dialog').close(); };
  element<HTMLSelectElement>('lanes').onchange = event => { c.settings.lanes = Number((event.target as HTMLSelectElement).value) as 1 | 2; };
  element<HTMLSelectElement>('direction').onchange = event => { c.settings.oneWay = (event.target as HTMLSelectElement).value === 'one'; };
  element<HTMLInputElement>('green').oninput = event => { c.settings.green = Number((event.target as HTMLInputElement).value); element('green-value').textContent = `${c.settings.green} s`; };
  element('apply-road').onclick = () => c.applyRoad();
  element('undo').onclick = () => c.undo(); element('redo').onclick = () => c.undo(true);
  const clearSelection = () => { c.start = null; c.selection = null; c.notify('Selection and construction cleared.'); };
  element('cancel-build').onclick = clearSelection;
  element('close-context').onclick = () => { c.selection = null; sync(); document.querySelector<HTMLButtonElement>('[data-tool="select"]')?.focus(); };
  element('signal').onclick = () => c.signal(); element('remove-signal').onclick = () => c.signal(true);
  element('apply-gateway').onclick = () => { const role = element<HTMLSelectElement>('gateway-role').value; c.gateway(role === 'none' ? null : role as Gateway); };
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches('input, select, textarea') || target.isContentEditable)) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); c.undo(event.key.toLowerCase() === 'y' || event.shiftKey);
    }
    if (event.key === 'Escape') clearSelection();
  });
  setInterval(() => {
    const m = metrics(c.traffic, c.network);
    element('metric-count').textContent = String(m.count); element('metric-speed').textContent = m.averageSpeed.toFixed(0);
    element('metric-trip').textContent = m.completed ? m.averageTrip.toFixed(1) : '—';
    element('metric-queue').textContent = String(m.queued); element('metric-load').textContent = m.congestion.toFixed(0);
    updateZoneStatus(zoneInspector, c);
    element('zone-summary').textContent = `${Object.keys(c.network.zones).length} zones · ${c.traffic.zones.jobs.length} active itineraries · ${c.traffic.zones.completed} round trips · ${c.traffic.zones.externalCompleted} external visits · ${c.traffic.zones.pending.size} homes waiting · ${c.traffic.zones.pendingVisitors.size} visitor requests waiting · ${c.traffic.zones.canceled} canceled`;
    const freight = c.traffic.zones.freight;
    element('freight-summary').textContent = `Freight: ${freight.completed} deliveries · ${freight.deliveredUnits} units · ${freight.waiting} orders waiting · ${freight.delayed} delayed (60s+) · ${freight.requests.size - freight.waiting} trucks assigned · ${freight.averageSeconds.toFixed(1)}s average delivery`;
    const seconds = Math.floor(c.traffic.time);
    element('time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 150);
  sync();
  return scene => { element('zoom-out').onclick = () => scene.zoom(1 / 1.2); element('zoom-in').onclick = () => scene.zoom(1.2); element('fit').onclick = () => scene.fit(); };
}
