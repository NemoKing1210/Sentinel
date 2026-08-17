import { Card } from './Card';
import { Icon } from './Icon';

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <Card className="empty">
      <span className="empty-mark">
        <Icon name="shield" />
      </span>
      <h3>{title}</h3>
      <p>{copy}</p>
    </Card>
  );
}
