import { useRef, type DragEvent, type ReactNode } from 'react';
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
      <Icon name={locked ? 'shield' : 'upload'} size={24} />
    </div>
  );
}

export function DropZone({ dragging, setDragging, className = '', children }: DropZoneProps) {
  const dragDepthRef = useRef(0);

  return (
    <section
      className={`drop-zone ${className} ${dragging ? 'dragging' : ''}`}
      onDragEnter={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
      }}
      onDrop={(event: DragEvent<HTMLElement>) => {
        // Visual only: file ingest is subscribeToFileDrops so HTML5 + native drop do not double-add.
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
      }}
    >
      {children}
    </section>
  );
}
