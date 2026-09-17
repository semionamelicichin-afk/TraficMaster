import { demoNetwork } from '../domain/demo';
import { connectedRoads, removeRoad, updateRoad } from '../domain/graph';
import { defaults, emptyNetwork, nodeId, type Network, type Point, type Settings } from '../domain/model';
import { buildRoad } from '../editor/roads';
import { loadCity, saveCity } from '../persistence/storage';
import { Traffic } from '../simulation/traffic';
import { setSignal } from '../simulation/signals';
import { roadSection } from '../editor/section';
import { setGateway, setJunction } from '../domain/controls';
import { gatewayTrips } from '../domain/routing';
import type { Gateway, RoadSign } from '../domain/model';
import type { ZoneKind } from '../domain/model';
import { setZone } from '../domain/zones';

interface Snapshot { network: Network; settings: Settings; selection: Controller['selection'] }

export type Tool = 'select' | 'build' | 'erase' | 'pan' | 'junction' | 'zone';
export class Controller {
  network = demoNetwork();
  traffic = new Traffic(this.network);
  settings: Settings = { ...defaults };
  running = false;
  tool: Tool = 'select';
  start: Point | null = null;
  selection: { kind: 'road' | 'node'; id: string } | null = null;
  message = 'Welcome to your traffic lab. Press Run to try the demo, or build your own network.';
  error = false;
  changed: () => void = () => {};
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get section() { return roadSection(this.network, this.selection?.kind === 'road' ? this.selection.id : ''); }
  private snapshot(): Snapshot { return structuredClone({ network: this.network, settings: this.settings, selection: this.selection }); }
  private edit(action: () => void): void {
    const before = this.snapshot();
    action();
    this.past.push(before); if (this.past.length > 50) this.past.shift();
    this.future = [];
  }
  undo(redo = false): void {
    const source = redo ? this.future : this.past, target = redo ? this.past : this.future;
    const saved = source.pop();
    if (!saved) return;
    target.push(this.snapshot());
    saved.network.revision = this.network.revision + 1;
    this.network = saved.network; this.settings = saved.settings; this.selection = saved.selection;
    this.traffic.network = this.network; this.start = null;
    if (this.selection?.kind === 'road') {
      const road = this.network.roads[this.selection.id];
      if (road) { this.settings.lanes = road.lanes; this.settings.oneWay = road.oneWay; }
    }
    if (this.selection?.kind === 'node' && this.network.signals[this.selection.id]) this.settings.green = this.network.signals[this.selection.id].green;
    this.notify(redo ? 'Edit redone.' : 'Edit undone.');
  }
  notify(message: string, error = false): void { this.message = message; this.error = error; this.changed(); }
  attempt(action: () => void): void {
    try { action(); } catch (error) { this.notify(error instanceof Error ? error.message : 'The action could not be completed.', true); }
  }
  setTool(tool: Tool): void {
    this.tool = tool; this.start = null;
    this.notify({ select: 'Select a road section, junction, or endpoint to configure a city gateway.', build: 'Tap a grid point, then an aligned end point. Cancel build or Escape cancels.', erase: 'Tap a road segment to remove it.', pan: 'Drag to move the map. Pinch or scroll to zoom.', junction: 'Tap any road node to manage signals, main roads, signs or city gateways.', zone: 'Tap a dedicated road endpoint to add a home, workplace, shop, warehouse or industrial zone. Use a two-way access road without a city gateway.' }[tool]);
  }
  click(point: Point, road: string | null): void {
    this.attempt(() => {
      if (this.tool === 'pan') return;
      if (this.tool === 'build') {
        if (!this.start) { this.start = point; this.notify('Start placed. Choose an aligned end point.'); return; }
        let ids: string[] = [];
        this.edit(() => { ids = buildRoad(this.network, this.start!, point, this.settings.lanes, this.settings.oneWay); });
        this.start = null; this.selection = { kind: 'road', id: ids[0] };
        this.notify(`Built ${ids.length} road segment${ids.length === 1 ? '' : 's'}.`);
      } else if (this.tool === 'erase') {
        if (!road) throw new Error('Tap the middle of a road segment to remove it.');
        this.edit(() => removeRoad(this.network, road)); this.selection = null; this.notify('Road removed. Trips will find a new route.');
      } else {
        const id = nodeId(point);
        if (this.network.zones[id] || ((this.tool === 'junction' || this.tool === 'zone') && this.network.nodes[id])) this.selection = { kind: 'node', id };
        else if (road) this.selection = { kind: 'road', id: road };
        else if (connectedRoads(this.network, id).length === 2 && !this.network.signals[id] && !this.network.junctions[id]) this.selection = { kind: 'road', id: connectedRoads(this.network, id)[0].id };
        else if (this.network.nodes[id]) this.selection = { kind: 'node', id };
        else this.selection = null;
        if (this.selection?.kind === 'road') {
          const selected = this.network.roads[this.selection.id];
          this.settings.lanes = selected.lanes; this.settings.oneWay = selected.oneWay;
        }
        if (this.selection?.kind === 'node' && this.network.signals[id]) this.settings.green = this.network.signals[id].green;
        this.notify(this.selection ? 'Selection ready. Adjust its settings in the inspector.' : 'Select a road or junction.');
      }
    });
  }
  applyRoad(): void {
    this.attempt(() => {
      if (this.selection?.kind !== 'road') throw new Error('Select a road first.');
      const section = this.section;
      this.edit(() => section.roads.forEach((id, index) => {
        updateRoad(this.network, id, this.settings.lanes, this.settings.oneWay);
        const road = this.network.roads[id];
        road.a = section.nodes[index]; road.b = section.nodes[index + 1];
      }));
      this.notify(`Road updated. ${section.roads.length} segments in this section. Traffic will re-route.`);
    });
  }
  signal(remove = false): void {
    this.attempt(() => {
      if (this.selection?.kind !== 'node') throw new Error('Select a junction first.');
      this.edit(() => setSignal(this.network, this.selection!.id, remove ? null : this.settings.green));
      this.notify(remove ? 'Signal removed.' : 'Signal timing updated.');
    });
  }
  gateway(gate: Gateway | null): void {
    this.attempt(() => {
      if (this.selection?.kind !== 'node') throw new Error('Select a road endpoint first.');
      this.edit(() => setGateway(this.network, this.selection!.id, gate));
      this.notify(gate ? `City gateway set to ${gate}.` : 'City gateway removed.');
    });
  }
  priority(main: string[], signs: Record<string, RoadSign>): void {
    this.attempt(() => {
      if (this.selection?.kind !== 'node') throw new Error('Select a junction first.');
      this.edit(() => setJunction(this.network, this.selection!.id, main, signs));
      this.notify('Junction priority updated: two main approaches; other approaches obey their signs.');
    });
  }
  toggleRunning(): void {
    this.running = !this.running;
    this.notify(this.running && !gatewayTrips(this.network).length && !Object.keys(this.network.zones).length ? 'No reachable entry-to-exit route. Assign city gateways at road endpoints and connect them.' : this.running ? 'Traffic running. Zones generate internal trips; city gateways generate through traffic.' : 'Simulation paused.');
  }
  zone(kind: ZoneKind, capacity: number, demand: number): void {
    this.attempt(() => {
      if (this.selection?.kind !== 'node') throw new Error('Select a dedicated road endpoint first.');
      const id = this.selection.id, point = this.network.nodes[id] ?? this.network.zones[id];
      if (!point) throw new Error('Select a road endpoint.');
      if (!this.traffic.zones.canResize(id, capacity)) throw new Error('Wait for reserved parking spaces to become free before reducing capacity.');
      this.edit(() => setZone(this.network, { id, x: point.x, y: point.y, kind, capacity, demand }));
      this.notify('Zone saved. Connect homes to work or shops, and warehouses to shops or industry. All trips need a return route.');
    });
  }
  removeZone(): void {
    this.attempt(() => {
      const id = this.selection?.id;
      if (!id || !this.network.zones[id]) throw new Error('Select a zone first.');
      this.edit(() => { delete this.network.zones[id]; this.network.revision++; });
      this.notify('Zone removed. Its active trips will be canceled; undo restores the zone.');
    });
  }
  replace(network: Network): void {
    this.network = network; this.traffic = new Traffic(network); this.running = false; this.start = null; this.selection = null;
  }
  save(): void { this.attempt(() => { saveCity(localStorage, this.network, this.settings); this.notify('City saved on this device.'); }); }
  load(): void { this.attempt(() => { const saved = loadCity(localStorage); this.edit(() => { this.settings = saved.settings; this.replace(saved.network); }); this.notify('Saved city loaded. Press Run to start fresh traffic.'); }); }
  reset(demo: boolean): void { this.edit(() => this.replace(demo ? demoNetwork() : emptyNetwork())); this.notify(demo ? 'Demo city ready.' : 'Empty city ready. Use Build road to connect two grid points.'); }
  get isJunction(): boolean { return this.selection?.kind === 'node' && connectedRoads(this.network, this.selection.id).length >= 2; }
  get isEndpoint(): boolean { return this.selection?.kind === 'node' && connectedRoads(this.network, this.selection.id).length === 1; }
}
