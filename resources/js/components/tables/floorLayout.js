// Geometry for the floor-plan canvas. Positions are stored in canvas units
// (pos_x / pos_y on the table) and the canvas is scaled to fit the screen.

export const FLOOR_WIDTH = 960;
export const FLOOR_MIN_HEIGHT = 560;
export const FLOOR_MAX_Y = 9800; // inside the API's pos_y bound (RestaurantTable::CANVAS_HEIGHT)
export const SNAP = 10;
export const DEFAULT_AREA = 'Main';

const SEAT = 26; // space each chair takes along a long edge
const CELL_W = 150;
const CELL_H = 140;
const MARGIN = 30;

// Chairs per side for a top-down table. Small tables are square with a chair on
// each side; bigger ones stretch sideways and add chairs along the long edges.
export function seatLayout(capacity) {
    const cap = Math.max(1, Math.min(Number(capacity) || 1, 16));
    if (cap <= 2) return { top: 1, bottom: cap - 1, left: 0, right: 0 };
    if (cap <= 4) return { top: 1, bottom: 1, left: cap >= 3 ? 1 : 0, right: cap >= 4 ? 1 : 0 };
    const long = cap - 2;
    return { top: Math.ceil(long / 2), bottom: Math.floor(long / 2), left: 1, right: 1 };
}

export function tableWidth(capacity) {
    const seats = seatLayout(capacity);
    return Math.max(56, Math.max(seats.top, seats.bottom) * SEAT + 10);
}

// Outer size of a table tile (table + chairs + label + padding) in canvas units
export function footprint(capacity) {
    return { w: tableWidth(capacity) + 44, h: 118 };
}

export const snap = (value) => Math.round(value / SNAP) * SNAP;

const overlaps = (a, b) =>
    a.x < b.x + b.w + SNAP && b.x < a.x + a.w + SNAP && a.y < b.y + b.h + SNAP && b.y < a.y + a.h + SNAP;

/**
 * Where each table in one area sits: an unsaved drag, then its saved spot, then the
 * first free grid cell. With ignoreSaved, every table is laid out on a fresh grid.
 */
export function resolvePositions(tables, drafts = {}, { ignoreSaved = false } = {}) {
    const positions = {};
    const placed = [];
    const pending = [];

    for (const table of tables) {
        const saved = drafts[table.id] ?? (!ignoreSaved && table.pos_x != null && table.pos_y != null
            ? { x: table.pos_x, y: table.pos_y }
            : null);
        if (saved) {
            const size = footprint(table.capacity);
            // A table given more seats since it was placed is wider now; keep it on the floor
            const spot = {
                x: Math.min(Math.max(0, saved.x), FLOOR_WIDTH - size.w),
                y: Math.min(Math.max(0, saved.y), FLOOR_MAX_Y),
            };
            positions[table.id] = spot;
            placed.push({ ...spot, ...size });
        } else {
            pending.push(table);
        }
    }

    let cell = 0;
    const cols = Math.floor((FLOOR_WIDTH - MARGIN) / CELL_W);
    for (const table of pending) {
        const size = footprint(table.capacity);
        // Plenty of cells to try; a crowded floor just stacks further down
        for (let guard = 0; guard < 2000; guard++, cell++) {
            const rect = {
                x: MARGIN + (cell % cols) * CELL_W,
                y: MARGIN + Math.floor(cell / cols) * CELL_H,
                ...size,
            };
            if (rect.x + rect.w > FLOOR_WIDTH - MARGIN / 2) continue;
            if (placed.some((p) => overlaps(rect, p))) continue;
            rect.y = Math.min(rect.y, FLOOR_MAX_Y);
            positions[table.id] = { x: rect.x, y: rect.y };
            placed.push(rect);
            cell++;
            break;
        }
    }

    return positions;
}

export function floorHeight(tables, positions) {
    const bottom = tables.reduce((max, t) => {
        const p = positions[t.id];
        return p ? Math.max(max, p.y + footprint(t.capacity).h) : max;
    }, 0);
    return Math.max(FLOOR_MIN_HEIGHT, bottom + 70);
}

export const areaOf = (table) => table.area || DEFAULT_AREA;
