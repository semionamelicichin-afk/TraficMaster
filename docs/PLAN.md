# Traffic Flow Manager MVP

## Scope and decisions
- Browser-only TypeScript, Phaser 3, Vite; no backend or external assets.
- Orthogonal grid roads, split into adjacent grid edges. Crossing roads share nodes automatically. One or two lanes per direction; one-way follows the order of clicks.
- Deterministic 50 ms simulation steps, Dijkstra routing, safe lane spacing, two-phase signals and exclusive intersection entry.
- Network edits re-route cars from their current edge destination; removed edges return cars to the last node. Unreachable trips wait for a connection.
- Mouse/touch editor, pan tool, wheel/pinch zoom, responsive HTML controls.
- Versioned, validated localStorage maps/settings; manual save/load; demo and empty reset. Vehicles are transient.
- PWA via a local service worker caching the production app, without another runtime dependency.

## Milestones
1. Foundation: Vite scene and scripts — implemented; typecheck passed.
2. Graph/editor: build, select, modify, delete roads and automatic junctions — implemented; 3 graph/routing tests passed.
3. Routing/traffic: directional paths, generation, spacing and rerouting — complete; 9 simulation/control tests passed, including cross-edge spacing and a 180-second demo run.
4. Control: traffic signals, timing, pause and 1/2/4 speed — implemented; signal tests passed.
5. Metrics/storage: live metrics, validated saves, demo/reset — implemented; metrics and 3 persistence tests passed.
6. Mobile/PWA: touch controls, responsive layout and offline app — complete; desktop/mobile gestures and offline reload verified.
7. Quality gate: lint, typecheck, unit tests, build, desktop/mobile Playwright — complete.

## Acceptance
Install with `npm install`, run with `npm run dev`. Build/edit a network, run and control traffic, observe metrics, save and restore. All quality checks must pass before completion.

## Next expansion: lanes, vehicle types and city destinations

Planning date: 2026-09-16. Status: Stages 0 and A complete; Stage B warehouse delivery slice complete, external supply pending. Preserve the completed MVP above as the regression baseline. Implement one playable vertical slice at a time in the order below.

### Scope and decisions
- Retain browser-only operation, deterministic 50 ms simulation steps, the existing grid and one/two lanes per direction. No new production dependencies are planned.
- Establish automatic lane behavior before specialized transport. Manual lane restrictions, dedicated bus lanes and truck bans are deferred.
- Introduce passenger cars, buses, trucks and garbage trucks through typed configuration: length, cruising speed, acceleration/braking, safe following gap, service duration and relevant capacity. Numeric tuning follows measured tests rather than fixed estimates in this plan.
- Keep road routing, lane connections, vehicle motion, trip/job generation, service operations, rendering and persistence separate. Extend existing modules where practical.
- Zones are simple selectable map objects, not building simulations. A zone attaches to a directed road-side access point with entry, exit and an off-road service pocket. Validate travel direction and available connections.
- Keep external gateway traffic alongside internal trips. Generate bounded, deterministic demand; expose unreachable destinations and pending jobs instead of silently dropping them or creating unbounded queues.
- Preserve signals, exactly two main approaches without signals, STOP/Yield behavior and intersection reservations. Long vehicles retain a reservation until their rear clears the crossing.
- Persist zone placement, access connections, fleet configuration, bus routes and player settings with save migration and undo/redo. Vehicles, passengers and live job queues remain transient and restart on load, consistent with the current save model.
- Defer individual pedestrians, daily schedules, fuel, budgets, detailed economics, manual lane editing and stops that block a traffic lane.

### Stage 0 — Automatic lanes and vehicle dimensions
Status: complete. Dependency: completed MVP.

Implemented slice (2026-09-16):
- Derived directed lanes and stable connection identifiers; single-lane turns, inner-left/outer-right rules, straight lane continuity and explicit widening/narrowing connections. No save migration or new dependency is required.
- Route-aware entry selection and automatic 0.6-second lane changes outside the first/last 16 units around nodes. Vehicles unable to change earlier may wait and maneuver at the stop line. Reserve both lanes during the maneuver and check front/rear clearance on the current and adjacent edges. Rendering interpolates the simulation's lateral position.
- Reserve the outgoing lane before passing the stop line, so simultaneous arrivals at a two-to-one merge cannot overlap. Traffic waits for its permitted lane instead of switching to another lane inside the junction.
- Road edits revalidate lanes and movements. Removing a lane during a maneuver, or invalidating a committed turn, returns the vehicle to the last node under the existing edit-recovery policy. Rerouting an occupied edge excludes an immediate U-turn; an unreachable forward route waits for a network edit.
- Cache derived connections until the network revision changes; avoid recalculating lane geometry in every simulation step.
- Verification: 50 unit tests, lint and production build/typecheck passed. All 12 desktop/mobile browser scenarios passed before the final no-change-boundary/cache adjustment; all six affected traffic/control/offline scenarios passed again on the final build. A sustained simulation test exceeded its five-second budget while running alongside browsers before caching; the final full unit suite completed with 1.31 seconds of test execution. The existing Phaser chunk-size warning remains non-blocking.

Physical movement slice (2026-09-16):
- Vehicles travel along tangent-aligned cubic connections, using a sampled arc-length table shared by simulation and rendering. Rendering rotates each vehicle along the curve. Straight continuations, width changes and two-road bends use the same transition model.
- Add physical length (11 units for current passenger cars; supported range 5–26), a five-unit bumper gap, bounded acceleration and braking-distance-based approach speed. The front stops 16 units before the node. Following and lane-change clearance account for both vehicles' lengths.
- Crossing entry reserves the node and outgoing lane. Entry requires enough room to finish the curve; the reservation remains until the rear travels beyond its end, including when a vehicle stops downstream. Signals changing after entry cannot strand a vehicle inside the crossing.
- Active, geometrically valid crossings survive unrelated edits and revalidate their remaining trip at the exit. Invalidated crossing roads return the vehicle to its last node and release its reservation. Pending rear-clearance reservations survive unrelated edits.
- Updated existing tests to assert physical positions and simulation states instead of the previous constant-speed node-transfer timing. New fixtures cover long turns, mixed-length queues/merges, rotated-body separation, blocked rear clearance, signal changes, route edits and 1x/2x/4x deterministic stepping.
- Current limit: conservative exclusive connector occupancy, rectangular vehicles of fixed width, and lengths bounded by the 64-unit grid. Specialized types/profiles and zones start in Stage A; this slice does not dispatch buses, freight or waste services.
- Verification: all 65 unit tests, lint, typecheck, production build and 12 desktop/mobile Playwright scenarios passed. Final production traffic was visually inspected with 34 active vehicles and completed trips; no browser errors were reported. The existing Phaser bundle warning remains non-blocking. Real-device Safari/iOS testing is still outside automated coverage.

Implement:
1. Explicit directed lanes and permitted connections through straight, turning and two-road junctions. Lane count changes must have defined merge connections. Use stable identifiers derived from existing roads.
2. Automatic turn rules: a single lane supports all legal movements; with two lanes, the inner lane supports left/straight and the outer lane supports straight/right. Filter movements by outgoing road direction and connectivity; do not introduce automatic U-turns.
3. Route-aware lane selection before junctions, safe lane changes using front/rear clearance, and a no-change area inside intersections. If a required lane cannot be reached safely, wait upstream or compute a legal alternative; never jump lanes at the junction.
4. Following gaps, acceleration/braking and crossing clearance based on physical vehicle length. Following checks must span adjacent edges and curved junction connections.
5. Render the same lane/turn geometry used by simulation, including continuous turns and lane changes. Recover safely from lane removal or direction edits using the existing rerouting policy.

Acceptance:
- Vehicles follow legal lane connections without overlap, instant lane jumps or conflicting intersection occupancy.
- Long-vehicle fixtures safely traverse turns and merges, stop at signals/STOP and clear intersections before the next conflicting movement.
- Equal simulated time produces equal states at different render frame rates and simulation speeds.
- Existing gateway and junction-management journeys remain playable. Validate long queues and edits while vehicles occupy affected roads.

### Stage A — Vehicle types, zones and internal passenger trips
Status: complete. Dependency: Stage 0.

Implemented internal-trip slice:
- Shared car, bus, truck and garbage-truck profiles define dimensions, speed, acceleration/braking, following gap, service duration, capacity and rendering. Existing generated road traffic and zone itineraries use passenger cars; specialized dispatch stays in Stages B–D.
- The Zones tool creates residential, business and retail destinations at dedicated two-way road endpoints. This first access model uses an endpoint as a driveway; mid-segment driveways are not part of this slice. A zone cannot share its endpoint with a city gateway. Extending/removing/reversing its access road keeps the zone visible with an accessibility reason.
- Each zone has 1–4 off-road parking spaces. Residential demand is 1–3. A round trip reserves distinct spaces at both ends before dispatch, so full destinations create bounded visible pending demand instead of overflowing parking. Transfers use a shared access aisle and serialize entry/exit per zone; road vehicles wait before the endpoint if its aisle is occupied.
- Deterministic home → work/shop → home itineraries include off-road departure, arrival, service dwell and return. Parked vehicles remain visible. Return trips wait in their reserved space when disconnected and resume on reconnection. Removing a zone or changing its residential/non-residential role cancels affected itineraries and vehicles; shrinking across a reserved slot is rejected. Undo/redo restores map configuration, not live trip history.
- Maps support at most 64 zones and 64 simultaneous internal itineraries. Waiting demand is bounded to one pending marker per home. Road and parked vehicles share the existing global 180-vehicle cap.
- v3 saves persist zone definitions and migrate v1/v2 maps to empty zone collections. Disconnected zones remain valid saved objects. Trips, parking reservations and demand timers restart on load.
- Context panels expose accessibility and reserved spaces. The statistics footer reports active itineraries, completed round trips, waiting homes and canceled trips. Compact parking remains clear of neighboring two-lane roads, including all four slots and the access aisle.
- Verification: 81 unit tests, lint, typecheck and production build passed. All 14 desktop/mobile/offline Playwright scenarios passed; both internal and gateway traffic journeys were rechecked after the vehicle-cap adjustment, and both zone journeys passed again after the adjacent-road parking fix. Desktop/mobile layouts were visually inspected. The existing Phaser bundle-size warning remains non-blocking.

External passenger visits (2026-09-17):
- Reachable entry/bidirectional gateways dispatch visitors to all three zone types. Before dispatch, reserve one destination parking slot and require a reachable exit. No residential origin is needed. Arrivals, shared-aisle access, dwell and departure reuse the internal parking lifecycle.
- After dwell, prefer the original gateway when it permits exit; otherwise choose a reachable exit in stable order. Removing the used entry does not cancel an already admitted visitor. With no exit, visitors stay parked or wait on the road; restored exits resume their trips. Returning road vehicles reassign exits removed or disconnected by edits.
- Complete each external visit exactly once at a valid exit, then release its reservation. The slot remains reserved until that completion as a conservative capacity policy. Zone deletion cancels affected external visitors and releases their vehicle and slot.
- Visitor demand is bounded to one pending marker per zone, with dispatch intervals of 18/demand simulation seconds. Internal/external dispatch precedence alternates after admissions. Both share the 64-itinerary and 180-vehicle limits; existing through-traffic generation is unchanged.
- The inspector recognizes external-only accessibility and missing exits; the footer reports completed external visits and waiting visitor requests separately from internal round trips. No save schema change: existing demand settings persist, while all live visits restart on load.
- Preserve main-road priority and signal rules. Sustained traffic can starve an unsignalized minor approach; the player must manage that junction. Mixed-load acceptance tests use signals to verify that through traffic and visits both complete without bypassing priorities.
- Verification: all 93 unit tests, lint and production build/typecheck passed. Coverage includes dwell, finite reservations, deleted/blocked exits, repurposed entry zones, multiple entries, sustained mixed traffic and deterministic stepping. The 14 existing desktop/mobile browser scenarios passed; the two new visitor scenarios passed after adding the signal required by the fixture's sustained main-road flow. All four affected internal/visitor scenarios passed again on the final build. The mobile visitor layout was visually inspected. The existing Phaser bundle-size warning remains non-blocking.

Warehouse freight dispatch is implemented in Stage B below. External freight supply, bus routes and waste jobs remain pending.

Implement:
1. Shared definitions and distinct silhouettes/colors for cars, buses, trucks and garbage trucks; specialized dispatch becomes active in its corresponding later stage.
2. Place, select, connect, edit and remove residential, business and retail zones. Show the attached road side, access direction, demand level and accessibility in the contextual inspector.
3. Off-road service pockets with finite capacity, entry/exit movement and safe merging back into traffic. Waiting vehicles queue at a modeled holding point; they must not disappear or overlap parked vehicles.
4. Deterministic car itineraries: home → work/shop → home, plus gateway ↔ zone trips. Include dwell time and both outbound and return journeys; prevent duplicate return-trip generation.
5. Revalidate access when roads/zones change. Pending trips wait when no route exists; deleted destinations cancel or redirect their jobs under an explicit, tested policy.

Acceptance:
- A city with connected residential and work/shop zones generates internal trips without any gateways.
- Cars arrive, dwell and return; service pockets cannot exceed capacity or release cars into occupied lane space.
- Disconnected or directionally inaccessible zones are visibly identified. Zone edits support undo/redo and save/load.

### Stage B — Freight deliveries
Status: in progress; warehouse delivery slice complete and verified. Dependency: Stage A.

Warehouse delivery slice (2026-09-17):
- Add warehouse and industrial zone types to the existing editor, history and validated v3 save format. Existing v1/v2 migration and passenger zone behavior remain supported. Warehouses and industry do not generate passenger trips in this slice.
- Each warehouse parking space supports one assigned truck. Before assignment reserve distinct warehouse and destination spaces, require a valid round trip, and respect the shared 64-itinerary / 180-vehicle limits. Retail parking is shared with passengers; freight/passenger dispatch precedence alternates after admissions.
- Retail and industrial zones maintain one outstanding request each, ordered by creation time. Demand sets an immutable 4/8/12-unit order within the truck's 12-unit capacity. After the truck returns, wait 30/demand simulation seconds before another order. Warehouse demand is unused. Pending requests cannot grow beyond the 64-zone bound.
- Trucks load off-road for 12 seconds, drive using the existing length-aware motion, unload for 12 seconds, and return. Count delivery and units exactly once after unloading; keep both reservations until return and a two-second fleet release. Active jobs use the common service-pocket lifecycle with explicit vehicle type; freight requests and metrics live in a separate simulation module.
- Road disruptions preserve requests and assigned trips. Deleting/changing a warehouse or losing its road vehicle requeues undelivered work with its original age; delivered work is not reissued. Removing or changing a destination to a non-freight role cancels its request and releases the vehicle and reservations. Live orders and trucks restart on load.
- Inspector/footer expose assigned trucks, load capacity, pending requests, completed deliveries/units and mean order-to-unload time. Undelivered orders older than 60 simulation seconds are marked delayed; this is a simple age threshold, not a predicted arrival deadline.
- Truck-compatible pockets use a shorter lateral aisle and a larger forward offset. A regression test reproduced the outermost long truck intruding into a neighboring two-lane road (50 units against 46 available); the corrected geometry leaves clearance throughout arrival/departure.
- Verification: all 104 unit tests, lint and production build/typecheck passed. All 18 desktop/mobile/offline Playwright scenarios passed; all six affected freight/passenger/visitor journeys passed again on the final build after the pocket-clearance and inspector adjustments. Freight layouts were visually inspected on desktop and mobile. The existing Phaser bundle-size warning remains non-blocking.
- Remaining Stage B work: explicitly configured external supply gateways and their load/entry/delivery/exit lifecycle. This slice supplies freight from warehouses only.

Implement:
- Warehouses and industrial zones; bounded delivery requests from shops/industry.
- Dispatch trucks from warehouses or configured external supply gateways, assign each request once and model loading, delivery and return/exit.
- Track vehicle capacity, outstanding requests, completed deliveries and delivery delay. Assignment must account for reachable destinations and service-pocket capacity.

Acceptance:
- A delivery completes exactly once and releases its truck for another job.
- Road disruption creates visible pending/delayed work and recovery resumes service without losing or duplicating requests.
- A controlled comparison shows that reducing travel time improves delivery completion time.

### Stage C — Bus routes and passenger service
Status: planned. Dependency: Stage A; scheduled after Stage B.

Implement:
- Bus depots and roadside stops using service pockets.
- A route editor for ordered stops, assigned buses and dispatch interval; show the complete loop, including the return connection to its first stop.
- Aggregate passenger demand tied to nearby residential/business/retail zones. Track intended destinations, boarding/alighting, bus capacity and bounded stop queues without individual pedestrians.
- Validate complete route connectivity and show disrupted routes; depot dispatch and repeat runs must not duplicate buses.

Acceptance:
- Buses visit stops in order, respect capacity, serve passengers and repeat their route.
- Route edits/deletions and inaccessible stops produce a clear recoverable state. Routes/fleet settings survive save/load and undo/redo.
- Stop waiting time and bus occupancy reflect actual service.

### Stage D — Waste collection
Status: planned. Dependencies: Stages A and B job-dispatch foundation.

Implement:
- Waste depots, unloading sites and bounded waste accumulation in residential, retail and business zones.
- Assign garbage trucks to reachable collection jobs, serve multiple zones up to capacity, unload and resume collection.
- Show waste backlog, collection status and unreachable/unserved zones. Collection uses off-road service pockets in this release.

Acceptance:
- Collection removes only the amount loaded; unloading clears the truck's load exactly once.
- A full truck visits an available unloading site before accepting further collection. Missing/unreachable sites visibly suspend dispatch or unloading.
- Fleet size and road accessibility affect the number of serviced zones without duplicate assignments.

### Stage E — Integrated management and balancing
Status: planned. Dependencies: Stages B–D.

Implement:
- Metrics by vehicle type, zone demand and service: completed trips, passenger waiting, delivery delays, waste backlog and fleet utilization.
- Filters/overlays for vehicle type, destination, active route and inaccessible zones. Keep the mobile inspector usable alongside the map.
- A demonstration city combining internal trips, multiple gateways and all four vehicle types.
- Tune demand, fleet limits and pocket capacities against repeatable scenarios. Retain the existing 180-vehicle cap initially; report pending demand separately from active vehicles.

Acceptance:
- All four transport systems operate together through signals and priority junctions; bottlenecks can be diagnosed from the UI.
- A sustained deterministic run stays within configured vehicle/job/passenger limits without overlapping vehicles or duplicating work.
- Legacy saves migrate successfully; desktop/mobile critical journeys and production offline reload pass.

### Verification and completion gates
- At every stage: unit-test new domain rules first, then typecheck/lint, production build and affected Playwright journeys. Include topology edits, deleted destinations, unreachable routes, save migration and history where relevant.
- Stage 0 tests cover lane connectivity, turns, merging, lane changes, length-aware spacing, rear clearance and deterministic stepping.
- Service-stage tests cover finite capacity, job ownership, arrivals/departures, boarding/unloading and cancellation/retry behavior.
- Before declaring the expansion complete: run lint, typecheck, all unit tests, production build and the full desktop/mobile/offline Playwright suite. Report exact failures and untested device limitations.
- Next implementation task: finish Stage B with configured external freight supply gateways, reusing bounded requests and truck service operations.

## City gateways and junction management
- User-approved: multiple entry/exit/bidirectional gateways at road endpoints. New roads require explicitly assigned gateways; demo has four entries and four exits. Only reachable entry-to-exit trips spawn.
- Junction manager supports nodes with two or more connected roads. Without signals exactly two arms are main (including a turning main road); other approaches use Yield or STOP. Signals override stored priority rules.
- STOP requires a one-second full stop. Minor approaches yield to approaching main-road traffic; equal-priority contenders use deterministic ordering and exclusive junction reservations. This is a simplified game rule, not a jurisdiction-specific traffic-law model.
- Persist controls in v2 saves, migrate legacy v1 endpoints to bidirectional gateways, and include all controls in undo/redo. Remove invalid controls after topology edits.
- Status: complete. Lint, typecheck, production build, 37 unit tests and 12 desktop/mobile Playwright scenarios passed. Layouts inspected; desktop inspector height is bounded to keep zoom controls reachable.

## Section editing and history
- User-approved: select/edit the chain between junctions or endpoints, including bends; closed loops form one bounded selection. One-way changes orient the entire chain consistently from the clicked edge's direction.
- Undo/redo stores up to 50 map edits, including roads, signals and city replacement. Failed edits do not affect history; new edits clear redo. Traffic is not rewound; restoring a map triggers routing updates.
- Context inspector sits beside the map on desktop and directly below it on mobile, with only relevant controls. Build defaults remain available without a selection.
- Status: complete. Lint, typecheck, production build, 26 unit tests and 8 Playwright scenarios passed. The final whole-section label change was additionally verified in both desktop/mobile contextual editing scenarios. Both layouts were visually inspected.

Controls audit (2026-09-17):
- Existing player controls cover road sections, signals/priority/signs, gateways, all five zone kinds, simulation speed, history, storage and map navigation. Automatic trip generation, routing, lane changes and freight assignment are controlled through the map and simulation, without manual dispatch buttons.
- Add a visible Cancel build button while a construction start is pending, sharing Escape's cancellation behavior. It preserves the map and current build tool; history controls wrap on narrow screens.
- Expose warehouse capacity as Truck fleet size (parking spaces), and update zone-tool hints to include freight destinations. Delivery demand remains disabled for warehouses, where it has no effect.
- Bus/waste service controls and external freight supply configuration await their planned implementation; vehicle profiles alone do not provide those services.
- Verification: controller tests, lint, production build/typecheck and all 20 desktop/mobile/offline Playwright scenarios passed. The existing Phaser bundle-size warning remains non-blocking.

## Interface refinement: road connections
- Traffic balance accepted by the user. Improve road connections within the existing grid editor.
- Draw road borders and surfaces in separate passes, use rounded joins, and stop markings before corners, intersections and width transitions.
- Highlight construction connection points; use the same validation for previews and committed roads, including overlap rejection.
- Status: complete. Lint, typecheck, production build, 18 unit tests and 6 desktop/mobile Playwright tests passed. Desktop rendering inspected visually.

## Final verification — 2026-09-15
- `npm run lint`, `npm run typecheck`, `npm test` (15 tests), `npm run build`, `npm run test:e2e` (6 Chromium desktop/mobile tests): passed.
- Development startup and browser traffic generation: passed on port 5174; 5173 was already occupied.
- Dependency installation audit: zero vulnerabilities after updating Vitest to 4.1.11.
- Browser regressions fixed: static cache entries with different Origin headers now reload offline; canvas bounds updates no longer reset pan/zoom unless viewport dimensions change.
- Non-blocking build warning: Phaser vendor chunk is 1.21 MB (332 KB gzip).
- Limits: orthogonal grid, simplified intersection reservations and lane movement, 180 vehicles, transient traffic state, root-path deployment. Real iOS/Safari and installed-device PWA testing remain outside automated Chromium coverage.
- Recommended next task: hands-on traffic balancing and usability checks on real Android/iOS devices within the existing MVP scope.
