/** The chrome-yellow carton bar for app screens, with the band strip printed under it. */
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Wordmark } from '@/screens/GalleryScreen';

export function CartonBar({ back = '/', children }: { back?: string | null; children?: ReactNode }) {
  return (
    <>
      <header className="theme-carton shrink-0">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-8">
          {back !== null && (
            <Link
              to={back}
              aria-label="Back"
              className="carton-label flex h-10 items-center gap-0.5 rounded-sm bg-fg pr-3 pl-1.5 text-[13px] text-ground transition-transform active:scale-95"
            >
              <ChevronLeft size={20} strokeWidth={2.4} />
              Back
            </Link>
          )}
          <Wordmark nameFrom="sm" />
          <div className="ml-auto flex items-center gap-2">{children}</div>
        </div>
      </header>
      <div aria-hidden className="bands-rule shrink-0" />
    </>
  );
}
