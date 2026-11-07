/** The app bar for secondary screens: back, the wordmark and screen actions, over the dark ground. */
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '@/components/Wordmark';

export function AppBar({ back = '/', children }: { back?: string | null; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line-soft bg-ground/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-8">
        {back !== null && (
          <Link
            to={back}
            aria-label="Back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-control text-fg transition-transform hover:bg-control-2 active:scale-90"
          >
            <ArrowLeft size={18} />
          </Link>
        )}
        <Wordmark />
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}
