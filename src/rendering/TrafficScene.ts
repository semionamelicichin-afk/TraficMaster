import Phaser from 'phaser';
import { COLUMNS, GRID, ROWS, type Point } from '../domain/model';
import { connectedRoads } from '../domain/graph';
import { signalPhase } from '../simulation/signals';
import type { Controller } from '../ui/controller';
import { planRoad } from '../editor/roads';
import { markingInset, roadWidth } from './roadGeometry';
import { approaches, junctionControl } from '../domain/controls';
import { carPose } from '../simulation/traffic';
import { pocketDirection, pocketPosition, zoneAccess, zoneColors } from '../domain/zones';
import { vehicles } from '../domain/vehicles';

export class TrafficScene extends Phaser.Scene {
  private graphics!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private labelCount = 0;
  private pointers = new Map<number, Point>();
  private down: Point | null = null;
  private moved = false;
  private hover: Point | null = null;
  private pinch = 0;
  private viewWidth = 0;
  private viewHeight = 0;
  private cleanup: (() => void)[] = [];
  constructor(private controller: Controller) { super('traffic'); }
  create(): void {
    this.graphics = this.add.graphics();
    this.fit();
    this.scale.on('resize', this.resizeView, this);
    const canvas = this.game.canvas;
    canvas.setAttribute('data-testid', 'game-canvas');
    canvas.setAttribute('aria-label', 'Traffic map. Use Build road and choose two aligned grid points.');
    canvas.setAttribute('role', 'img');
    const local = (event: PointerEvent | WheelEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const listen = <K extends keyof HTMLElementEventMap>(name: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      canvas.addEventListener(name, handler, { passive: false });
      this.cleanup.push(() => canvas.removeEventListener(name, handler));
    };
    listen('contextmenu', event => event.preventDefault());
    listen('pointerdown', event => {
      event.preventDefault(); canvas.setPointerCapture(event.pointerId);
      const p = local(event); this.pointers.set(event.pointerId, p); this.down = p; this.moved = false;
      if (this.pointers.size > 1) { this.moved = true; this.pinch = this.pinchDistance(); }
    });
    listen('pointermove', event => {
      const p = local(event), previous = this.pointers.get(event.pointerId);
      this.hover = this.world(p);
      if (!previous) return;
      this.pointers.set(event.pointerId, p);
      if (this.pointers.size > 1) {
        const distance = this.pinchDistance();
        if (this.pinch > 0) this.zoom(distance / this.pinch);
        this.pinch = distance; this.moved = true;
      } else if (this.controller.tool === 'pan' || (event.buttons & 6) !== 0) {
        const camera = this.cameras.main;
        camera.scrollX -= (p.x - previous.x) / camera.zoom;
        camera.scrollY -= (p.y - previous.y) / camera.zoom;
        this.moved = true;
      } else if (this.down && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 8) this.moved = true;
    });
    listen('pointerup', event => {
      if (!this.moved && this.pointers.size === 1 && event.button === 0) {
        const world = this.world(local(event));
        this.hover = world;
        this.controller.click({ x: Math.round(world.x / GRID), y: Math.round(world.y / GRID) }, this.hitRoad(world));
      }
      this.pointers.delete(event.pointerId); this.pinch = 0;
      if (!this.pointers.size) this.down = null;
    });
    listen('pointercancel', event => { this.pointers.delete(event.pointerId); this.moved = true; this.pinch = 0; });
    listen('wheel', event => { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12, local(event)); });
    this.events.once('shutdown', () => { this.cleanup.forEach(fn => fn()); this.scale.off('resize', this.resizeView, this); });
    this.game.events.emit('map-ready');
  }
  private world(point: Point): Point { return this.cameras.main.getWorldPoint(point.x, point.y); }
  private pinchDistance(): number { const [a, b] = [...this.pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }
  private resizeView(): void {
    const camera = this.cameras.main;
    // Phaser also emits resize when scrolling changes the canvas bounds.
    if (camera.width !== this.viewWidth || camera.height !== this.viewHeight) this.fit();
  }
  fit(): void {
    const camera = this.cameras.main;
    this.viewWidth = camera.width; this.viewHeight = camera.height;
    camera.setZoom(Math.min(camera.width / ((COLUMNS + 2) * GRID), camera.height / ((ROWS + 2) * GRID)));
    camera.centerOn(COLUMNS * GRID / 2, ROWS * GRID / 2);
  }
  zoom(factor: number, point?: Point): void {
    const camera = this.cameras.main;
    const anchor = point ?? { x: camera.width / 2, y: camera.height / 2 };
    const before = this.world(anchor);
    camera.setZoom(Phaser.Math.Clamp(camera.zoom * factor, 0.18, 2.5));
    const after = this.world(anchor);
    camera.scrollX += before.x - after.x; camera.scrollY += before.y - after.y;
  }
  private hitRoad(point: Point): string | null {
    const gx = point.x / GRID, gy = point.y / GRID;
    if (Math.hypot(gx - Math.round(gx), gy - Math.round(gy)) < 0.22) return null;
    for (const road of Object.values(this.controller.network.roads)) {
      const a = this.controller.network.nodes[road.a], b = this.controller.network.nodes[road.b];
      const t = Phaser.Math.Clamp(((gx - a.x) * (b.x - a.x) + (gy - a.y) * (b.y - a.y)), 0, 1);
      if (Math.hypot(gx - a.x - (b.x - a.x) * t, gy - a.y - (b.y - a.y) * t) < 0.28) return road.id;
    }
    return null;
  }
  private arrow(x: number, y: number, dx: number, dy: number): void {
    const g = this.graphics;
    g.lineBetween(x - dx * 5, y - dy * 5, x + dx * 5, y + dy * 5);
    g.lineBetween(x + dx * 5, y + dy * 5, x - dx * 1 - dy * 3, y - dy * 1 + dx * 3);
    g.lineBetween(x + dx * 5, y + dy * 5, x - dx * 1 + dy * 3, y - dy * 1 - dx * 3);
  }
  private label(x: number, y: number, text: string, color = '#ffffff', size = 10): void {
    let label = this.labels[this.labelCount];
    if (!label) {
      label = this.add.text(x, y, text, { fontFamily: 'Arial, sans-serif', fontStyle: 'bold', fontSize: size, color }).setOrigin(0.5).setResolution(2);
      this.labels.push(label);
    }
    label.setPosition(x, y).setText(text).setFontSize(size).setVisible(true);
    // Phaser regenerates the text texture on setColor even if the color is unchanged.
    if (label.style.color !== color) label.setColor(color);
    this.labelCount++;
  }
  private drawPriority(node: string): void {
    const n = this.controller.network, g = this.graphics, center = n.nodes[node];
    const control = junctionControl(n, node);
    for (const from of approaches(n, node)) {
      const point = n.nodes[from], dx = point.x - center.x, dy = point.y - center.y;
      const road = connectedRoads(n, node).find(r => r.a === from || r.b === from)!;
      const main = control.main.includes(from);
      if (main) {
        g.lineStyle(3, 0xf5cd60, 0.85); g.lineBetween(center.x * GRID, center.y * GRID, center.x * GRID + dx * 16, center.y * GRID + dy * 16);
      }
      const side = roadWidth(road) / 2 + 9;
      const x = center.x * GRID + dx * 27 - dy * side, y = center.y * GRID + dy * 27 + dx * side;
      const incoming = !road.oneWay || road.a === from;
      if (main) {
        const diamond = [{ x, y: y - 7 }, { x: x + 7, y }, { x, y: y + 7 }, { x: x - 7, y }];
        g.fillStyle(0xf4ca56); g.fillPoints(diamond, true); g.lineStyle(1.5, 0xffffff); g.strokePoints(diamond, true);
      } else if (incoming && control.signs[from] === 'stop') {
        const octagon = Array.from({ length: 8 }, (_, i) => ({ x: x + Math.cos(Math.PI / 8 + i * Math.PI / 4) * 8, y: y + Math.sin(Math.PI / 8 + i * Math.PI / 4) * 8 }));
        g.fillStyle(0xcf4c44); g.fillPoints(octagon, true); g.lineStyle(1, 0xffffff); g.strokePoints(octagon, true);
        this.label(x, y, 'STOP', '#ffffff', 4.5);
      } else if (incoming) {
        const triangle = [{ x: x - 7, y: y - 5 }, { x: x + 7, y: y - 5 }, { x, y: y + 7 }];
        g.fillStyle(0xffffff); g.fillPoints(triangle, true); g.lineStyle(2, 0xcf4c44); g.strokePoints(triangle, true);
      }
      if (!main && incoming) {
        const offset = road.oneWay ? 0 : -(4 + (road.lanes - 1) * 3.5);
        const cx = center.x * GRID + dx * 16 - dy * offset, cy = center.y * GRID + dy * 16 + dx * offset;
        const half = road.lanes * 3.5;
        g.lineStyle(control.signs[from] === 'stop' ? 2.5 : 1.2, 0xffffff);
        g.lineBetween(cx - dy * half, cy + dx * half, cx + dy * half, cy - dx * half);
      }
    }
  }
  update(_time: number, delta: number): void {
    const c = this.controller;
    if (c.running) c.traffic.advance(Math.min(delta, 250) / 1000 * c.settings.speed);
    const g = this.graphics; g.clear(); this.labelCount = 0;
    g.fillStyle(0xd0ddd5);
    for (let x = 0; x <= COLUMNS; x++) for (let y = 0; y <= ROWS; y++) g.fillCircle(x * GRID, y * GRID, 1.8);
    g.lineStyle(1, 0xc5d5cb, 0.7); g.strokeRect(-32, -32, (COLUMNS + 1) * GRID, (ROWS + 1) * GRID);
    const roads = Object.values(c.network.roads);
    const selectedRoads = new Set(c.section.roads);
    const nodes = Object.values(c.network.nodes);
    // Paint the complete road border before any asphalt, so adjoining edges cannot cut each other.
    for (const border of [true, false]) {
    for (const road of roads) {
      const a = c.network.nodes[road.a], b = c.network.nodes[road.b];
      const width = roadWidth(road);
      const selected = selectedRoads.has(road.id);
      g.lineStyle(width + (border ? 6 : 0), border ? selected ? 0x13b99a : 0xc1cec7 : 0x455763);
      g.lineBetween(a.x * GRID, a.y * GRID, b.x * GRID, b.y * GRID);
    }
    for (const node of nodes) {
      const connected = connectedRoads(c.network, node.id);
      if (!connected.length) continue;
      const radius = Math.max(...connected.map(roadWidth)) / 2;
      g.fillStyle(border ? 0xc1cec7 : 0x455763);
      g.fillCircle(node.x * GRID, node.y * GRID, radius + (border ? 3 : 0));
    }
    }
    for (const road of roads) {
      const a = c.network.nodes[road.a], b = c.network.nodes[road.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const x = (a.x + b.x) * GRID / 2, y = (a.y + b.y) * GRID / 2;
      const startInset = markingInset(c.network, a.id), endInset = markingInset(c.network, b.id);
      if (!road.oneWay) { g.lineStyle(1, 0xddd1a1, 0.8); g.lineBetween(a.x * GRID + dx * startInset, a.y * GRID + dy * startInset, b.x * GRID - dx * endInset, b.y * GRID - dy * endInset); }
      for (let lane = 0; lane < road.lanes; lane++) {
        const offset = road.oneWay ? (lane - (road.lanes - 1) / 2) * 7 : 4 + lane * 7;
        g.lineStyle(1.1, 0xc0d2da, 0.85); this.arrow(x - dy * offset, y + dx * offset, dx, dy);
        if (!road.oneWay) this.arrow(x + dy * offset, y - dx * offset, -dx, -dy);
      }
      if (road.lanes === 2) {
        for (const side of road.oneWay ? [0] : [-1, 1]) {
          const offset = side * 7.5; g.lineStyle(0.8, 0x95a9b3, 0.6);
          for (const t of [0.23, 0.65]) {
            const from = Math.max(t * GRID, startInset), to = Math.min((t + 0.12) * GRID, GRID - endInset);
            if (to > from) g.lineBetween(a.x * GRID + dx * from - dy * offset, a.y * GRID + dy * from + dx * offset, a.x * GRID + dx * to - dy * offset, a.y * GRID + dy * to + dx * offset);
          }
        }
      }
    }
    for (const node of Object.values(c.network.nodes)) {
      const degree = connectedRoads(c.network, node.id).length;
      if (degree === 1) { g.fillStyle(0xf2f8f3); g.fillCircle(node.x * GRID, node.y * GRID, 7); g.fillStyle(0x1a9d85); g.fillCircle(node.x * GRID, node.y * GRID, 3); }
      if (c.tool === 'build' && degree !== 2) { g.lineStyle(2, 0x13b99a, 0.65); g.strokeCircle(node.x * GRID, node.y * GRID, 11); }
      const signal = c.network.signals[node.id];
      const managed = degree >= 3 || !!c.network.junctions[node.id] || (c.tool === 'junction' && c.selection?.id === node.id && degree >= 2);
      if (!signal && managed) this.drawPriority(node.id);
      const gate = c.network.gates[node.id];
      if (gate && degree === 1) {
        const color = gate === 'entry' ? 0x138d70 : gate === 'exit' ? 0x4589bc : 0x8060a8;
        g.lineStyle(3, color); g.strokeCircle(node.x * GRID, node.y * GRID, 11);
        g.fillStyle(color); g.fillRoundedRect(node.x * GRID - 23, node.y * GRID - 33, 46, 16, 4);
        this.label(node.x * GRID, node.y * GRID - 25, gate === 'entry' ? 'IN' : gate === 'exit' ? 'OUT' : 'IN / OUT');
        const road = connectedRoads(c.network, node.id)[0], other = c.network.nodes[road.a === node.id ? road.b : road.a];
        const dx = other.x - node.x, dy = other.y - node.y;
        g.lineStyle(2, color);
        this.arrow(node.x * GRID + dx * 16, node.y * GRID + dy * 16, gate === 'exit' ? -dx : dx, gate === 'exit' ? -dy : dy);
      }
      if (signal) {
        const horizontal = signalPhase(signal.green, c.traffic.time) === 'horizontal';
        g.fillStyle(0x172d36); g.fillRoundedRect(node.x * GRID - 11, node.y * GRID - 26, 23, 13, 4);
        g.fillStyle(horizontal ? 0x62e3ac : 0xf8796d); g.fillCircle(node.x * GRID - 5, node.y * GRID - 19, 3.5);
        g.fillStyle(horizontal ? 0xf8796d : 0x62e3ac); g.fillCircle(node.x * GRID + 5, node.y * GRID - 19, 3.5);
      }
      if (c.selection?.kind === 'node' && c.selection.id === node.id) { g.lineStyle(3, 0x13b99a); g.strokeCircle(node.x * GRID, node.y * GRID, 18); }
    }
    const colors = [0xffd47d, 0x70ddd0, 0xf7a792, 0x99c5ff, 0xf0f4ec];
    for (const zone of Object.values(c.network.zones)) {
      const color = zoneAccess(c.network, zone) ? 0xda6858 : zoneColors[zone.kind];
      g.fillStyle(color); g.fillRoundedRect(zone.x * GRID - 12, zone.y * GRID - 12, 24, 24, 5);
      this.label(zone.x * GRID, zone.y * GRID, { residential: 'H', business: 'W', retail: 'S', warehouse: 'D', industrial: 'I' }[zone.kind], '#ffffff', 13);
      for (let slot = 0; slot < zone.capacity; slot++) {
        const p = pocketPosition(c.network, zone, slot);
        g.lineStyle(1, color, 0.6); g.lineBetween(zone.x * GRID, zone.y * GRID, p.x, p.y);
        const direction = pocketDirection(c.network, zone);
        g.save(); g.translateCanvas(p.x, p.y); g.rotateCanvas(Math.atan2(direction.y, direction.x));
        const length = zone.kind === 'residential' || zone.kind === 'business' ? 14 : 24;
        g.lineStyle(1, color); g.strokeRoundedRect(-length / 2, -3, length, 6, 2); g.restore();
      }
    }
    for (const job of c.traffic.zones.jobs) {
      const p = c.traffic.zones.pose(job);
      if (p) {
        const profile = vehicles[job.vehicleType];
        g.save(); g.translateCanvas(p.x, p.y); g.rotateCanvas(p.angle); g.fillStyle(profile.color);
        g.fillRoundedRect(-profile.length / 2, -profile.width / 2, profile.length, profile.width, 1.5);
        if (job.vehicleType === 'truck') { g.fillStyle(0x20343e, 0.7); g.fillRect(profile.length / 2 - 4, -profile.width / 2 + 1, 2, profile.width - 2); }
        g.restore();
      }
    }
    for (const car of c.traffic.cars) {
      if (!car.next) continue;
      const position = carPose(c.network, car);
      if (!position) continue;
      g.save(); g.translateCanvas(position.x, position.y); g.rotateCanvas(position.angle);
      const profile = vehicles[car.vehicleType];
      g.fillStyle(car.vehicleType === 'car' ? colors[car.id % colors.length] : profile.color);
      g.fillRoundedRect(-car.length / 2, -profile.width / 2, car.length, profile.width, 1.5);
      if (car.vehicleType !== 'car') {
        g.fillStyle(0x20343e, 0.7); g.fillRect(car.length / 2 - 4, -profile.width / 2 + 1, 2, profile.width - 2);
        if (car.vehicleType === 'bus') for (let x = -car.length / 2 + 3; x < car.length / 2 - 5; x += 4) g.fillRect(x, -profile.width / 2, 2, 1);
        if (car.vehicleType === 'garbage') { g.lineStyle(1, 0xffffff, 0.7); g.lineBetween(-4, -2, 0, 2); }
      }
      g.restore();
    }
    if (c.start) {
      g.fillStyle(0x00a88b); g.fillCircle(c.start.x * GRID, c.start.y * GRID, 8);
      if (this.hover) {
        const x = Math.round(this.hover.x / GRID), y = Math.round(this.hover.y / GRID);
        let points: Point[] = [];
        let valid = true;
        try { points = planRoad(c.network, c.start, { x, y }).points; } catch { valid = false; }
        const color = valid ? 0x00a88b : 0xdc6255;
        g.lineStyle(roadWidth(c.settings), color, 0.35); g.lineBetween(c.start.x * GRID, c.start.y * GRID, x * GRID, y * GRID);
        g.lineStyle(2, color); g.strokeCircle(x * GRID, y * GRID, 10);
        for (const point of points) {
          if (c.network.nodes[`${point.x},${point.y}`]) { g.lineStyle(3, 0x00a88b); g.strokeCircle(point.x * GRID, point.y * GRID, 13); }
        }
      }
    }
    if (c.tool === 'build' && this.hover && !c.start) {
      const x = Math.round(this.hover.x / GRID), y = Math.round(this.hover.y / GRID);
      if (x >= 0 && x <= COLUMNS && y >= 0 && y <= ROWS) {
        g.lineStyle(2, 0x00a88b); g.strokeCircle(x * GRID, y * GRID, c.network.nodes[`${x},${y}`] ? 13 : 7);
      }
    }
    for (let index = this.labelCount; index < this.labels.length; index++) this.labels[index].setVisible(false);
  }
}
