# Traffic Flow Manager

A browser-only road traffic sandbox built with TypeScript and Phaser 3. No account, backend or external assets.

## Run
Requires Node.js 22.12+ (or a newer supported Node release).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. On Windows with restricted PowerShell script execution, use `npm.cmd` and `npx.cmd`.

## Play
- Press **Run simulation** to try the demo. Pause or select **1× / 2× / 4×** at any time.
- **Build road**: tap two aligned grid points. Roads are horizontal or vertical and automatically connect at crossings. Choose one/two lanes and one-way/two-way before building. One-way follows the order of taps. Escape or switching tools cancels the starting point.
- **Select**: tap a road or an intermediate node to highlight the entire section between junctions/endpoints, including bends. Closed loops form one section. Change lane/direction settings and choose **Apply to entire section**. One-way follows the endpoints shown in the inspector; mixed settings are identified before applying. Tap a junction to add/remove a traffic signal or change its green duration (2–30 seconds). Signal dots show horizontal then vertical phases.
- The contextual inspector appears over the map on desktop and directly below the map on phones. Close it with **×** or Escape. Road construction defaults remain in the toolbox when no road is selected.
- **Undo / Redo** restores the last 50 map edits, including construction, road settings, deletion, signals, priority signs, gateways, New city, Demo city and Load. Shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl+Y, except while editing form fields. A new edit clears redo; failed edits do not. History is session-only and does not rewind traffic or restore cars discarded by a city replacement.
- **Remove** deletes one grid segment. Traffic recalculates routes on the next simulation tick.
- **Move map**: drag with mouse or one finger. Use the wheel, two-finger pinch or zoom buttons. **Fit map** restores the overview.
- **Save city / Load** store and restore the map and settings on this device. Loading starts paused with fresh traffic. **New city** clears the current map after confirmation; the manual save remains. **Demo city** replaces the current map with the example.
- **City gateways**: select a road endpoint, choose Entry, Exit or Entry & exit, then Apply gateway. Repeat for multiple gateways. Green IN markers generate trips; blue OUT markers receive them; purple IN/OUT supports both roles. New roads have no gateways until assigned. Demo city starts with four entries and four exits. Only reachable entry-to-exit trips spawn, respecting one-way roads. Removing an exit reroutes its existing trips to another reachable exit, or makes them wait. Extending a gateway into an internal node removes its gateway designation; Undo restores it.
- **Junctions**: use the Junctions tool to select any node, including a two-road node. Add/update a signal or remove it to manage priority. Exactly two approaches must be Main road; the main road may turn. Set every other approach to STOP or Yield and apply. Yellow diamonds and the yellow connection indicate the main road; red octagons indicate STOP; inverted triangles indicate Yield. Two-road junctions have both approaches designated Main road. Active signals override stored signs; removing the signal restores priority control.
- STOP requires a full one-second stop before yielding to main-road traffic. Yield does not require a stop when the junction is clear. Equal-priority approaches use stable vehicle ordering and an exclusive crossing reservation. These are simplified game rules; turning conflicts and jurisdiction-specific traffic rules are not modeled. Heavy main-road demand can delay minor roads; use signals to alternate traffic.
- Saves now include gateways and junction controls (format v2). Existing v1 saves load automatically with their endpoints converted to Entry & exit gateways. The local storage key remains unchanged for compatibility.

## Checks
```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts the production preview on port 4173 and checks desktop, mobile touch and offline reload. Build before running it. `npm run preview` serves the production build manually.

## Architecture and limits
- `src/domain`: typed grid graph, Dijkstra routing and demo.
- `src/editor`: atomic road construction.
- `src/simulation`: deterministic 50 ms ticks, lane spacing, intersection reservations, signals and metrics; independent of Phaser.
- `src/rendering`: Phaser drawing and pointer gestures.
- `src/ui`: HTML controls and editing state.
- `src/persistence`: versioned, validated localStorage saves.
- `public/sw.js`: production offline caching. Installation/offline use requires HTTPS or localhost and an initial online load. Serve at the origin root.

The MVP uses a 20 × 14 orthogonal grid, up to 180 active/pending vehicles, fixed cruising speed and simplified intersections. Cars have no lane-change animation or collision physics. Road deletion can return a car to its previous node; deleting that node cancels the trip. Unreachable trips wait for a connection. Metrics use one world unit as one meter; load is an approximate lane-capacity ratio and average trip time covers completed trips only. Saves contain map/settings, not vehicles. Browser storage availability and PWA installation vary by browser. Capacitor is not installed; browser integrations are isolated for later packaging.

Milestone status: [docs/PLAN.md](docs/PLAN.md).
