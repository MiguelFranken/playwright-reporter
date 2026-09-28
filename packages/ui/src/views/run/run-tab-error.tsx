import { CloudOff } from 'lucide-react';
import { Button } from '../../components/button';
import { EmptyState } from '../../patterns/empty-state';

/**
 * A run tab whose data could not be loaded in the browser — a tab opened
 * without a navigation fetches its own. It says so and offers another try,
 * rather than leaving a placeholder on screen for good.
 */
export function RunTabError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  return (
    <EmptyState icon={CloudOff} title="This tab could not be loaded" description="The connection may have dropped. Nothing is lost — try again.">
      <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Try again'}
      </Button>
    </EmptyState>
  );
}
