import { useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

interface DropZoneProps {
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  className?: string;
  children: ReactNode;
}

export function DropSymbol({ locked }: { locked: boolean }) {
  return (
    <div className="drop-symbol">
      <span className="drop-lock" aria-hidden="true" />
      <Icon name={locked ? 'shield' : 'upload'} />
    </div>
  );
}

export function DropZone({ dragging, setDragging, className = '', children }: DropZoneProps) {
  const rootRef = useRef<HTMLElement>(null);
  const dragDepthRef = useRef(0);
  const [dropPosition, setDropPosition] = useState<{ x: number; y: number } | null>(null);

  const trackDropPosition = (event: DragEvent<HTMLElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = {
      x: Math.round(event.clientX - rect.left),
      y: Math.round(event.clientY - rect.top),
    };
    setDropPosition((prev) => (prev && prev.x === next.x && prev.y === next.y ? prev : next));
  };

  const clearDrag = () => {
    dragDepthRef.current = 0;
    setDragging(false);
    setDropPosition(null);
  };

  return (
    <section
      ref={rootRef}
      className={`drop-zone ${className} ${dragging ? 'dragging' : ''} ${dropPosition ? 'targeted' : ''}`}
      style={
        {
          '--drop-x': dropPosition ? `${dropPosition.x}px` : '50%',
          '--drop-y': dropPosition ? `${dropPosition.y}px` : '42%',
        } as CSSProperties
      }
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragging(true);
        trackDropPosition(event);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
        trackDropPosition(event);
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setDragging(false);
          setDropPosition(null);
        }
      }}
      onDrop={(event) => {
        // Visual only: file ingest is subscribeToFileDrops so HTML5 + native drop do not double-add.
        event.preventDefault();
        clearDrag();
      }}
    >
      <div className="drop-field" aria-hidden="true">
        <span className="drop-well" />
        <span className="drop-rings" />
        <span className="drop-shutter" />
      </div>
      {dropPosition ? (
        <span className="drop-cursor-file" style={{ left: dropPosition.x, top: dropPosition.y }}>
          <Icon name="file" />
        </span>
      ) : null}
      {children}
    </section>
  );
}
