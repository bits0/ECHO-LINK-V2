# ECHO//LINK — Chapter 1: The Inventory (Playable Prototype Slice)

A story-first browser adventure where you play a freelance technician on a routine
inventory job that turns into something stranger. You learn real networking —
physical links, NIC states, IP addresses, name resolution — because the story
makes you need it, not because a lesson forces it on you.

## Modes

- **Mechanics Lab** — story-free sandbox for testing device power, ports, the cabling system, Network Space, and terminal verification. PC-D ships with the swapped-run fault: its wall outlet's printed panel label lies.
- **Story Mode** — the original Chapter 1 flow with BFree, UNKNOWN, objectives, and the ending. **Temporarily paused** (button disabled on the title screen) while the lab is polished; the code remains in place.

## The cabling system

A link is a physical path of real segments, each of which can break:

```
PC NIC → Ethernet cable → wall outlet → hidden building run → patch-panel jack → patch lead → switch port
```

- **Ports** know where they are and what they seat. **Cable ends** are picked up and seated by hand: click a connector to take it, click a free port to seat it, `Esc` to drop.
- **Wall outlets** (OF-01…OF-07) carry honest labels; their building runs are hidden in the walls.
- **The patch panel** (Rack B, server room) is passive: 8 jacks, each with a **continuity light**. The light is wired to the hidden run: it turns on the moment a PC's cable is seated at both ends. Printed labels *claim* — and can lie. A lit jack whose label disagrees glows amber: trust the light, not the ink.
- The repair is two separated steps: seat the PC's cable so a jack **lights**, then patch that lit jack to a switch port.
- **Network Space → TRAFFIC mode** is a 2D blueprint topology map: the switch at the hub, devices as themed SVG cards with name + IP, and circuit-trace links — orthogonal runs with rounded bends, staggered so parallel traces never merge — whose color follows *both* end interfaces — a link is only up when both sides are. Hover a link to reveal the interface at each end (NIC / P03 / LAN1 …) with its live status dot. Servers sit inside a dashed VLAN 20 zone, and the router's WAN lead vanishes off the sheet. Ambient pulses ease in and out along live links; there is deliberately no ping packet animation — verification is the terminal's job. Drag to pan, scroll or use the corner buttons to zoom, click a device to open its inspector. Whether the view is remembered between visits is a setting (title screen → SETTINGS).
- **Network Space → CABLING mode** is a 2D floor plan of the whole office on one sheet: staff room, corridor with its cable tray, administration, and the server room with both racks — walls, door swings, desks, devices, desk cords, wall outlets with live occupied dots, the patch panel's real-time continuity lights, patch leads into the switch, the router, and a fading dashed WAN line out through the server-room wall. The director's laptop sits in administration with no drop at all. The corridor tray carries **one shared trunk**: at rest you see only that single subtle conduit, since the individual runs are still hidden. Hovering any link in a chain (PC, cord, outlet, panel jack, or patch lead) draws only that chain's run — its stub from the wall plate, a tap onto the trunk, its ride down the shared trunk, then a staggered fan-out into the server room and a drop to its jack — dashed, green if continuity is good and amber if not. Fan-out heights are ordered from the runs' real jacks, so no drop crosses another run's horizontal. Because two runs share trunk segments, a revealed run is hit-tested as one path: the trunk portion keeps the hovered chain, never switching to a neighbour. The chain's members brighten while everything else dims, and an amber ✕ marks the exact segment where the chain breaks. Where the run truly ends is drawn from the cable state, so the mislabeled-run fault is visible as a trace that disagrees with the printed label. Pan/zoom works just like TRAFFIC mode; clicking a device, outlet, or panel jack opens its inspector.
- **Spare patch leads** rest in the panel's lead tray, along with any dangling ends.
- The switch only ever reports what it can observe: carrier, remote power, remote NIC. It repeats printed labels; it cannot know a run is mislabeled. Green appears only after verification.
- **Consoles open only from TRAFFIC-mode inspectors.** Click a device in the topology map and its inspector gains a console button: any PC offers **USE THIS COMPUTER**, which opens that workstation's own workspace — badged with its name and address, its terminal bound to that host, and Network Space reserved for PC-C. CSW-01 and RTR-01 offer **OPEN CONSOLE**, a read-only CLI (`CSW-01>` / `RTR-01>`; `help`, `exit`, plus `show interfaces status` on the switch and `show ip interface brief` on the router). The CLI reads the same live state as the inspector and reports only what the device can observe — per-port carrier and its own VLAN plan, its own addressing and line state. It cannot see the hidden runs and will never tell you a printed panel label is wrong. CABLING-mode and room-scene inspectors show no console buttons, because that view is the physical plant. A desktop launched from Network Space steps away back to Network Space.

## How to play

Open `index.html` in any modern browser (or serve the folder statically).
Everything runs locally; progress saves in your browser.

1. **Accept job BF-1042** on your phone (Tab key or the phone icon).
2. **Server Room** — record and power on SRV-01, SRV-02, CSW-01, RTR-01.
3. **Staff Offices** — record PC-A to PC-D. Check PC-A's screen…
4. **Investigate** — open PC-C's full-view **Network Space** from the workspace dock,
   compare the devices, inspect CSW-01/RTR-01 physical ports, then repair:
   PC-B has a disabled NIC; PC-D has an unplugged cable.
5. **Verify** — repairs count only when `ping` proves them in PC-C's terminal.
   Try `ping PC-A` — then find another way to reach it.
6. **Go home**, file the report, read your mail.

## Controls

- Click glowing outlines to walk / approach / interact — wall outlets and the patch panel are inspectable too
- Every device close-up includes a power toggle; PCs also expose NIC and cable controls
- Cable tool: click a connector to pick the end up — the end you carry follows your cursor and free ports glow amber; click a glowing port to plug in, `Esc` drops the end in hand
- Connected plugs show where they go: a caption under each connector names its far end (`→ SW-04`, `→ PC-D`)
- `Tab` — phone in Story Mode (disabled in Mechanics Lab)
- `Esc` — drop cable end · pause · Amber dot (bottom-left) — progressive hints
- Terminal (the source host is whichever PC's desktop you opened): `help` · `ipconfig` · `ping <name-or-ip>` · `clear` · `exit`
- Device console (TRAFFIC → network device): `help` · `show interfaces status` (switch) · `show ip interface brief` (router) · `exit`

## Design rules the code enforces

- Cable connected ≠ link up ≠ reachable ≠ name resolvable
- Network Space is a *view*, never proof — only ping verifies
- Failures answer honestly (real ping errors); failure teaches, never punishes
- Monochrome world; amber = attention/UNKNOWN; green = verified truth

## Tech

Vanilla HTML/CSS/ES modules. No build step, no backend, no dependencies.
Canvas-rendered Network Space: a pan/zoom 2D blueprint topology for TRAFFIC and a 2D architectural floor plan for CABLING; SVG line-art scenes; segment-based physical cabling
model (ports, cable ends, hidden runs, patch panel, continuity lights) driving every link state; physical
switch/router port inspectors with endpoint, VLAN, path, speed, and link status; synthesized location ambience and SFX.

*Prototype slice — Chapter 1 design spec lives in the project Notion.*
