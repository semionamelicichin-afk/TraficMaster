import type { ZoneKind } from '../domain/model';
import type { Controller } from './controller';

export function updateZoneStatus(root: HTMLElement, c: Controller): void {
  const zone = c.selection ? c.network.zones[c.selection.id] : undefined;
  const status = root.querySelector<HTMLElement>('[data-testid="zone-status"]');
  if (status) status.textContent = zone ? `${c.traffic.zones.status(zone)} ${c.traffic.zones.reservations(zone.id)} / ${zone.capacity} spaces reserved. ${c.traffic.zones.freight.status(zone)}` : 'A dedicated two-way endpoint provides entry and exit. Parking stays off the road.';
}
export function syncZonePanel(root: HTMLElement, c: Controller): void {
  const zone = c.selection ? c.network.zones[c.selection.id] : undefined;
  root.hidden = !(c.selection?.kind === 'node' && (c.isEndpoint || zone) && (c.tool === 'zone' || zone));
  if (root.hidden) return;
  root.innerHTML = `<h3>Destination zone</h3>
    <label for="zone-kind">Zone type</label><select id="zone-kind" data-testid="zone-kind"><option value="residential">Residential</option><option value="business">Business</option><option value="retail">Retail</option><option value="warehouse">Warehouse</option><option value="industrial">Industrial</option></select>
    <label for="zone-capacity" data-testid="zone-capacity-label">Off-road parking spaces</label><select id="zone-capacity" data-testid="zone-capacity">${[1, 2, 3, 4].map(n => `<option value="${n}">${n}</option>`).join('')}</select>
    <label for="zone-demand">Trip / delivery demand</label><select id="zone-demand" data-testid="zone-demand"><option value="1">Low</option><option value="2">Medium</option><option value="3">High</option></select>
    <p class="field-help" data-testid="zone-status"></p>
    <div class="button-pair"><button data-testid="apply-zone">${zone ? 'Update zone' : 'Add zone'}</button><button data-testid="remove-zone" ${zone ? '' : 'disabled'}>Remove zone</button></div>
    <p class="field-help">Homes generate trips to work or shops and back. City visitors stop, then leave through an exit. Warehouses load trucks for shops and industry; each parking space supports one truck. Deliveries share parking with cars. Demand sets order size (4/8/12 units). Blocked orders wait. Removing a zone cancels its trips.</p>`;
  const kind = root.querySelector<HTMLSelectElement>('#zone-kind')!, capacity = root.querySelector<HTMLSelectElement>('#zone-capacity')!, demand = root.querySelector<HTMLSelectElement>('#zone-demand')!;
  kind.value = zone?.kind ?? 'residential'; capacity.value = String(zone?.capacity ?? 2); demand.value = String(zone?.demand ?? 1);
  const syncDemand = () => {
    demand.disabled = kind.value === 'warehouse';
    root.querySelector<HTMLElement>('[data-testid="zone-capacity-label"]')!.textContent = kind.value === 'warehouse' ? 'Truck fleet size (parking spaces)' : 'Off-road parking spaces';
  };
  kind.onchange = syncDemand; syncDemand();
  root.querySelector<HTMLButtonElement>('[data-testid="apply-zone"]')!.onclick = () => c.zone(kind.value as ZoneKind, Number(capacity.value), Number(demand.value));
  root.querySelector<HTMLButtonElement>('[data-testid="remove-zone"]')!.onclick = () => c.removeZone();
  updateZoneStatus(root, c);
}
