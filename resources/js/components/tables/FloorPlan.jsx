import React, { useEffect, useRef, useState } from 'react';
import FloorTable from './FloorTable';
import { FLOOR_MAX_Y, FLOOR_WIDTH, SNAP, floorHeight, footprint, snap } from './floorLayout';

const MIN_SCALE = 0.6; // below this tables get too small to tap; the canvas scrolls instead
const DRAG_THRESHOLD = 4; // px of movement before a press counts as a drag, not a tap

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Scaled floor-plan canvas for one area. In edit mode tables can be dragged (or
 * nudged with the arrow keys once focused); a press without movement still selects.
 */
export default function FloorPlan({ tables, positions, editing, zoom = 1, selectedId, isMatch = () => true, now, onSelect, onMove, minScale = MIN_SCALE }) {
    const wrapRef = useRef(null);
    const dragRef = useRef(null);
    const [width, setWidth] = useState(FLOOR_WIDTH);
    const [drag, setDrag] = useState(null); // { id, x, y } while a table is being dragged

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return undefined;
        const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const scale = Math.max(width / FLOOR_WIDTH, minScale) * zoom;
    const height = floorHeight(tables, positions);

    const constrain = (table, x, y) => {
        const size = footprint(table.capacity);
        return { x: clamp(snap(x), 0, FLOOR_WIDTH - size.w), y: clamp(snap(y), 0, FLOOR_MAX_Y) };
    };

    const handlePointerDown = (e, table) => {
        if (!editing || e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const start = positions[table.id];
        dragRef.current = { table, startX: e.clientX, startY: e.clientY, x0: start.x, y0: start.y, moved: false };
    };

    const handlePointerMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        d.moved = true;
        // Follow the pointer smoothly; snapping happens on drop
        setDrag({ id: d.table.id, x: clamp(d.x0 + dx / scale, 0, FLOOR_WIDTH - footprint(d.table.capacity).w), y: clamp(d.y0 + dy / scale, 0, FLOOR_MAX_Y) });
    };

    const handlePointerUp = (e) => {
        const d = dragRef.current;
        dragRef.current = null;
        if (!d) return;
        if (d.moved) {
            onMove(d.table.id, constrain(d.table, d.x0 + (e.clientX - d.startX) / scale, d.y0 + (e.clientY - d.startY) / scale));
        } else {
            onSelect(d.table);
        }
        setDrag(null);
    };

    const handleKeyDown = (e, table) => {
        if (!editing) return;
        const step = e.shiftKey ? SNAP * 5 : SNAP;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (!delta) return;
        e.preventDefault();
        const p = positions[table.id];
        onMove(table.id, constrain(table, p.x + delta[0], p.y + delta[1]));
    };

    return (
        <div ref={wrapRef} className="overflow-auto rounded-2xl">
            <div style={{ width: FLOOR_WIDTH * scale, height: height * scale }}>
                <div
                    className={`relative origin-top-left rounded-2xl border-[6px] border-[#E7E0D6] bg-[#FDFBF8] [background-size:20px_20px]
                        ${editing ? 'bg-[radial-gradient(#D3C7B6_1.5px,transparent_1.5px)]' : 'bg-[radial-gradient(#E9E2D8_1px,transparent_1px)]'}`}
                    style={{ width: FLOOR_WIDTH, height, transform: `scale(${scale})` }}
                >
                    {tables.map((table) => {
                        const isDragging = drag?.id === table.id;
                        const p = isDragging ? drag : positions[table.id];
                        if (!p) return null;
                        return (
                            <FloorTable
                                key={table.id}
                                table={table}
                                now={now}
                                editing={editing}
                                dragging={isDragging}
                                selected={table.id === selectedId}
                                dimmed={!editing && !isMatch(table)}
                                className="absolute"
                                style={{ left: p.x, top: p.y }}
                                onClick={editing ? undefined : () => onSelect(table)}
                                onPointerDown={(e) => handlePointerDown(e, table)}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
                                onKeyDown={(e) => handleKeyDown(e, table)}
                            />
                        );
                    })}

                    <span className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 px-3 bg-[#FBF8F4] text-[11px] font-medium uppercase tracking-wider text-gray-400">
                        Entrance
                    </span>
                </div>
            </div>
        </div>
    );
}
