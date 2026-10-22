'use client';

import {
  Component,
  lazy,
  Suspense,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import { t } from '@/i18n/t';
// A type only: it is erased, so nothing of the area is loaded with the game screen.
import type { DigitacaoAreaProps } from './DigitacaoArea';

/** Gets the code of the typing area. */
export type AreaLoader = () => Promise<{ default: ComponentType<DigitacaoAreaProps> }>;

/**
 * The typing area is loaded when a typing round needs it, not with the game screen: it brings the typo check and the
 * English word list (levels 40 and 50 weigh about 258 KB) that only this mode uses.
 */
const loadDigitacaoArea: AreaLoader = () =>
  import('./DigitacaoArea').then((module) => ({ default: module.DigitacaoArea }));

type LazyArea = LazyExoticComponent<ComponentType<DigitacaoAreaProps>>;

/**
 * The lazy component of each loader, kept for the whole visit as `React.lazy` expects: once the code is there, an area
 * mounted again (the next round, a blank after a line with none) draws at once instead of showing the loading room
 * while a new lazy component waits for the same code. The tests give loaders of their own, hence one per loader.
 */
const lazyAreas = new WeakMap<AreaLoader, LazyArea>();

function lazyAreaFor(load: AreaLoader): LazyArea {
  let area = lazyAreas.get(load);
  if (!area) {
    area = lazy(load);
    lazyAreas.set(load, area);
  }
  return area;
}

/** A new lazy component in place of one whose load failed: a `React.lazy` that failed stays failed for good. */
function reloadAreaFor(load: AreaLoader): LazyArea {
  const area = lazy(load);
  lazyAreas.set(load, area);
  return area;
}

/**
 * Starts getting the typing area's code now, so it is already there at the first blank. Nothing comes of a failure
 * here: the area asks again when it is needed, and shows a retry if that fails too.
 */
export function preloadDigitacaoArea(load: AreaLoader = loadDigitacaoArea): void {
  load().catch(() => {});
}

interface LoadBoundaryProps {
  children: ReactNode;
  /** What to show once something below failed; `retry` puts the children back. */
  failed: (retry: () => void) => ReactNode;
}

/**
 * Catches a failure below it (the code of the area did not load; a render error in the area is caught the same way)
 * so it never reaches the game screen above: the clip, the lyrics and the tools stay where they are.
 */
class LoadBoundary extends Component<LoadBoundaryProps, { hasFailed: boolean }> {
  state = { hasFailed: false };

  static getDerivedStateFromError() {
    return { hasFailed: true };
  }

  private retry = () => this.setState({ hasFailed: false });

  render() {
    return this.state.hasFailed ? this.props.failed(this.retry) : this.props.children;
  }
}

/** The room of the field while its code loads, so the tools below it do not jump (the area is 74 px tall). */
function Loading() {
  return <div data-testid="digitacao-loading" aria-hidden="true" className="h-18.5" />;
}

interface LazyDigitacaoAreaProps extends DigitacaoAreaProps {
  /** Where the code comes from. The tests give one that fails. */
  load?: AreaLoader;
}

/**
 * The typing area, loaded on demand (`React.lazy` in a `Suspense`, ruling R49) and safe to lose: when the code does not
 * load, a short line and "Tentar de novo" take its place, and only that. The button asks for the code again with a new
 * lazy component, which then stands in for the failed one for every area after it.
 */
export function LazyDigitacaoArea({ load = loadDigitacaoArea, ...area }: LazyDigitacaoAreaProps) {
  const [Area, setArea] = useState(() => lazyAreaFor(load));

  return (
    <LoadBoundary
      failed={(retry) => (
        <div role="alert" className="flex min-h-18.5 items-center gap-3 rounded-answer bg-card px-3.5">
          <p className="min-w-0 flex-1 text-body text-muted">{t('digitacao.loadFailed')}</p>
          <button
            type="button"
            onClick={() => {
              setArea(() => reloadAreaFor(load));
              retry();
            }}
            className="min-h-11 shrink-0 rounded-button bg-lime px-3.5 text-body font-bold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
          >
            {t('digitacao.retry')}
          </button>
        </div>
      )}
    >
      <Suspense fallback={<Loading />}>
        <Area key={area.blank.id} {...area} />
      </Suspense>
    </LoadBoundary>
  );
}
