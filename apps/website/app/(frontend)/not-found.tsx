import { FileQuestion } from 'lucide-react';
import { Button } from '@miguelfranken/ui/components/button';
import { EmptyState } from '@miguelfranken/ui/patterns/empty-state';
import { Section } from '@miguelfranken/ui/marketing/section';
import Link from 'next/link';

export default function NotFound() {
  return (
    <Section>
      <EmptyState
        icon={FileQuestion}
        title="This page does not exist"
        description="The link may be out of date, or the page may have been unpublished."
      >
        <Button nativeButton={false} render={<Link href="/" />}>
          Back to the home page
        </Button>
      </EmptyState>
    </Section>
  );
}
