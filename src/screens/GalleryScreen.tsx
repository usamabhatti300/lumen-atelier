/** Home: the film frame (drop zone / continue), the shelf of looks, and your edits as prints. */
import { AnimatePresence, motion } from 'motion/react';
import { Aperture, ImagePlus, Pencil, Play, Settings, SwatchBook, Trash2, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { InstallBanner, InstallButton } from '@/pwa/PwaUi';
import { takeSharedFiles } from '@/pwa/pwa';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Progress } from '@/components/ui/misc';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { BUILTIN_PRESETS, CATEGORY_LABELS, PRESET_CATEGORIES } from '@/lib/presets/library';
import { cartonFor } from '@/lib/presets/carton';
import { useSettings } from '@/state/settingsStore';
import { useEditor } from '@/state/editorStore';
import {
  createProject,
  deleteProject,
  getOriginal,
  getPhoto,
  listProjects,
  saveProject,
  type ProjectRecord,
} from '@/lib/storage/db';
import { importFiles } from '@/engine/importer';
import { useMediaQuery } from '@/lib/useMediaQuery';

interface ProjectCard extends ProjectRecord {
  cover: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

function defaultProjectName() {
  return `Edit ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

async function loadProjectCards(): Promise<ProjectCard[]> {
  const list = await listProjects();
  return Promise.all(
    list.map(async (p) => {
      const first = p.photoIds[0] ? await getPhoto(p.photoIds[0]) : undefined;
      return { ...p, cover: first ? URL.createObjectURL(first.thumbnail) : null };
    }),
  );
}

export function GalleryScreen() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectCard[] | null>(null);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState<ProjectCard | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectCard | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const intent = useRef<'edit' | 'reference'>('edit');
  const lastProjectId = useSettings((s) => s.lastProjectId);
  const showToast = useEditor((s) => s.showToast);

  const refresh = useCallback(async () => {
    const cards = await loadProjectCards();
    setProjects((prev) => {
      prev?.forEach((c) => c.cover && URL.revokeObjectURL(c.cover));
      return cards;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    void loadProjectCards().then((cards) => alive && setProjects(cards));
    return () => {
      alive = false;
    };
  }, []);

  const startProject = useCallback(
    async (files: File[], mode: 'edit' | 'reference') => {
      const project = await createProject(defaultProjectName());
      if (files.length) {
        setImporting({ done: 0, total: files.length });
        const result = await importFiles(files, project.id, (done, total) => setImporting({ done, total }));
        setImporting(null);
        if (result.errors.length) showToast(result.errors.join(' '), 'error');
        if (!result.added.length) {
          await deleteProject(project.id);
          return;
        }
        await saveProject({ ...project, photoIds: result.added.map((p) => p.id), activePhotoId: result.added[0].id });
      }
      navigate(`/project/${project.id}${mode === 'reference' ? '?reference=1' : ''}`);
    },
    [navigate, showToast],
  );

  const onFiles = (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (files.length) void startProject(files, intent.current);
  };

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setDragOver(true);
      }
    };
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      intent.current = 'edit';
      onFiles(e.dataTransfer?.files ?? null);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  });

  // Arrivals from outside the app: the phone's share sheet, a home-screen shortcut, or
  // image files opened with the installed app on a computer.
  const [search, setSearch] = useSearchParams();
  const handledArrival = useRef(false);
  useEffect(() => {
    if (handledArrival.current) return;
    handledArrival.current = true;
    const share = search.get('share');
    const action = search.get('action');
    if (share || action) setSearch({}, { replace: true });
    if (share === '1') {
      void takeSharedFiles().then((files) => {
        if (files.length) void startProject(files, 'edit');
        else showToast('Nothing was shared, or the photos could not be read.', 'error');
      });
    } else if (share === 'failed') {
      showToast('The shared photos could not be received. Try opening them from the app instead.', 'error');
    } else if (action === 'reference') {
      // Home-screen shortcut "Match a reference look" (async: creates the project, then navigates).
      void Promise.resolve().then(() => startProject([], 'reference'));
    }
    const queue = (window as Window & { launchQueue?: { setConsumer(cb: (p: { files: FileSystemFileHandle[] }) => void): void } }).launchQueue;
    queue?.setConsumer(async ({ files }) => {
      if (!files?.length) return;
      void startProject(await Promise.all(files.map((h) => h.getFile())), 'edit');
    });
  }, [search, setSearch, startProject, showToast]);

  const resume = projects?.find((p) => p.id === lastProjectId);
  // The frame on the home screen holds the edit you were last in, else the newest one.
  const hero = resume ?? projects?.[0];
  const heroSrc = useHeroImage(hero?.photoIds[0]) ?? hero?.cover;
  const pickPhotos = () => {
    intent.current = 'edit';
    fileInput.current?.click();
  };
  const matchLook = () => {
    intent.current = 'reference';
    void startProject([], 'reference');
  };
  const importProgress = importing && (
    <div className="mt-6 max-w-sm" role="status">
      <p className="mb-2 text-sm text-fg-3 tabular">
        Importing {importing.done} of {importing.total}…
      </p>
      <Progress value={importing.done / importing.total} label="Import progress" />
    </div>
  );

  // Stock the shelf: cartons slide in once, in order (skipped with reduced motion).
  const shelf = useRef<HTMLUListElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (document.documentElement.dataset.motion === 'reduced') return;
        gsap.from('[data-carton]', { y: 28, opacity: 0, duration: 0.6, ease: 'expo.out', stagger: 0.035, delay: 0.1 });
      });
      return () => mm.revert();
    },
    { scope: shelf },
  );

  return (
    <div className="scroll-quiet h-full overflow-x-hidden overflow-y-auto bg-ground">
      <header className="theme-carton">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-8">
          <Wordmark />
          <nav className="flex items-center gap-1" aria-label="App">
            <InstallButton className="hidden sm:flex" />
            <Link to="/presets" className="carton-label flex h-10 items-center gap-2 rounded-sm px-3 text-[13px] hover:bg-control" aria-label="Looks">
              <SwatchBook size={17} /> <span className="hidden sm:inline">Looks</span>
            </Link>
            <Link to="/settings" className="carton-label flex h-10 items-center gap-2 rounded-sm px-3 text-[13px] hover:bg-control" aria-label="Settings">
              <Settings size={17} /> <span className="hidden sm:inline">Settings</span>
            </Link>
          </nav>
        </div>
      </header>
      <div aria-hidden className="bands-rule" />
      <InstallBanner />

      <main className="mx-auto max-w-7xl px-4 pb-20 sm:px-8">
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          data-testid="gallery-file-input"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = '';
          }}
        />

        <section className="grid gap-8 pt-7 pb-12 sm:pt-10 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-14 lg:pt-14 lg:pb-16">
          <div>
            <h1 className="carton-title text-[clamp(3.25rem,13vw,6rem)] text-fg">
              Any look.
              <br />
              Your photo.
            </h1>
            <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-fg-2">
              Load one of {BUILTIN_PRESETS.length} original looks, or show Lumen Atelier a photo you love and it builds an
              editable look from it. Free, no account, and your photos never leave this device.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="primary" className="h-12 flex-1 px-6 text-base sm:flex-none" icon={<ImagePlus size={18} />} onClick={pickPhotos}>
                Open a photo
              </Button>
              <Button variant="accent" className="h-12 flex-1 px-6 text-base sm:flex-none" icon={<Wand2 size={18} />} onClick={matchLook}>
                Match a look
              </Button>
            </div>
            {importProgress}
          </div>

          <FilmFrame
            dragOver={dragOver}
            hero={hero ? { id: hero.id, name: hero.name, src: heroSrc ?? null } : null}
            onPick={pickPhotos}
          />
        </section>

        <section aria-labelledby="shelf-title" className="border-t-2 border-fg pt-6">
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 id="shelf-title" className="carton-title text-[2rem] text-fg sm:text-[2.5rem]">
              The shelf
            </h2>
            <Link to="/presets" className="carton-label mb-1 text-[13px] text-fg underline decoration-2 underline-offset-4 hover:text-accent-fg">
              All {BUILTIN_PRESETS.length} looks
            </Link>
          </div>
          <ul ref={shelf} className="scroll-quiet -mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-4 sm:-mx-8 sm:px-8 lg:grid lg:grid-cols-7 lg:overflow-visible">
            {SHELF.map((c) => (
              <li key={c.id} data-carton className="w-[132px] shrink-0 lg:w-auto">
                <Link
                  to={`/presets?category=${c.id}`}
                  style={{ backgroundColor: c.carton.bg, color: c.carton.fg }}
                  className="group flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-sm transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-lift"
                >
                  <span className="flex items-start justify-between px-2.5 pt-2">
                    <span className="carton-title text-[2.4rem]">{c.carton.code}</span>
                    <span className="font-display text-sm font-bold tabular-nums">{c.count}</span>
                  </span>
                  <span>
                    <span className="block px-2.5 pb-2 font-display text-[15px] leading-[1.05] font-bold uppercase">{c.label}</span>
                    <span aria-hidden className="bands block h-1" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="pt-8" aria-labelledby="edits-title">
          <div className="mb-5 flex items-end justify-between gap-4 border-t-2 border-fg pt-6">
            <h2 id="edits-title" className="carton-title text-[2rem] text-fg sm:text-[2.5rem]">
              Your edits
            </h2>
            {resume && (
              <span className="hidden sm:block">
                <Button variant="secondary" size="sm" onClick={() => navigate(`/project/${resume.id}`)}>
                  Resume “{resume.name}”
                </Button>
              </span>
            )}
          </div>
          {projects === null ? (
            <div className="h-40" />
          ) : projects.length === 0 ? (
            <p className="max-w-[52ch] text-[15px] leading-relaxed text-fg-3">
              Nothing developed yet. Open a photo and it appears here as a print. Edits save on this device as you go.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-4">
              <AnimatePresence initial={false}>
                {projects.map((p, i) => (
                  <motion.li
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03 }}
                    className="group"
                  >
                    <Link to={`/project/${p.id}`} className="theme-frame block rounded-sm p-1.5 pb-0 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                      <div className="aspect-[4/5] overflow-hidden bg-well sm:aspect-[4/3]">
                        {p.cover ? (
                          <img src={p.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm text-fg-4">Empty</div>
                        )}
                      </div>
                      <p className="edge-code flex h-6 items-center gap-2 overflow-hidden whitespace-nowrap">
                        <span className="text-fg-4">{String(projects.length - i).padStart(2, '0')}A</span>
                        <span className="truncate">{p.photoIds.length} {p.photoIds.length === 1 ? 'frame' : 'frames'}</span>
                      </p>
                    </Link>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-fg">{p.name}</p>
                        <p className="text-[13px] text-fg-4">
                          {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="flex opacity-100 transition-opacity fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100">
                        <button type="button" aria-label={`Rename ${p.name}`} onClick={() => setRenaming(p)} className="rounded-sm p-1.5 text-fg-3 hover:bg-control hover:text-fg coarse:p-2.5">
                          <Pencil size={15} />
                        </button>
                        <button type="button" aria-label={`Delete ${p.name}`} onClick={() => setConfirmDelete(p)} className="rounded-sm p-1.5 text-fg-3 hover:bg-control hover:text-danger coarse:p-2.5">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </main>

      <RenameDialog
        key={renaming?.id ?? 'none'}
        project={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (renaming) await saveProject({ ...renaming, name });
          setRenaming(null);
          void refresh();
        }}
      />
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete project?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirmDelete) await deleteProject(confirmDelete.id);
                setConfirmDelete(null);
                void refresh();
              }}
            >
              Delete project
            </Button>
          </>
        }
      >
        <p className="px-4 py-4 text-sm leading-relaxed text-fg-3">
          “{confirmDelete?.name}” and its {confirmDelete?.photoIds.length} photos will be removed from this browser.
          Exported files on your computer are not affected. This cannot be undone.
        </p>
      </Dialog>
    </div>
  );
}

function RenameDialog({ project, onClose, onSave }: { project: ProjectCard | null; onClose: () => void; onSave: (n: string) => void }) {
  const [name, setName] = useState(project?.name ?? '');
  return (
    <Dialog
      open={!!project}
      onClose={onClose}
      title="Rename project"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onSave(name.trim().slice(0, 80))}>
            Save name
          </Button>
        </>
      }
    >
      <div className="p-4">
        <label className="mb-1.5 block text-xs text-fg-3" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
          className="h-9 w-full rounded-sm border border-line bg-well px-3 text-sm text-fg outline-none focus:border-accent-fg/70"
        />
      </div>
    </Dialog>
  );
}

/**
 * Phones: the home hero is large, so the 360 px thumbnail looks soft. Load the stored original
 * for it (the browser decodes it at display size); the thumbnail shows until then.
 */
function useHeroImage(photoId: string | undefined) {
  const phone = useMediaQuery('(max-width: 639px)');
  const [img, setImg] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!phone || !photoId) return;
    let alive = true;
    let url: string | null = null;
    void getOriginal(photoId).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setImg({ id: photoId, url });
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [phone, photoId]);
  return img && img.id === photoId ? img.url : undefined;
}

/** The categories on the home shelf: one carton per category with its real look count. */
const SHELF = PRESET_CATEGORIES.map((id) => ({
  id,
  label: CATEGORY_LABELS[id].replace(' Collection', ''),
  carton: cartonFor(id),
  count: BUILTIN_PRESETS.filter((p) => p.category === id).length,
})).filter((c) => c.count > 0);

/** A row of film sprocket holes along the frame edge. */
function Sprockets() {
  return (
    <span aria-hidden className="flex h-4 items-center justify-between px-1">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="h-2 w-3 rounded-[2px] bg-fg/15" />
      ))}
    </span>
  );
}

/**
 * The home frame: a black strip of film. Empty, it is the drop zone (click or drop photos);
 * once there are edits it holds the latest one, ready to continue.
 */
function FilmFrame({ dragOver, hero, onPick }: { dragOver: boolean; hero: { id: string; name: string; src: string | null } | null; onPick: () => void }) {
  const inner = hero ? (
    <Link to={`/project/${hero.id}`} className="group relative block aspect-[4/3] overflow-hidden bg-well" aria-label={`Continue editing ${hero.name}`}>
      {hero.src ? (
        <img src={hero.src} alt="" decoding="async" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]" />
      ) : (
        <span className="light-leak block h-full w-full" />
      )}
      <span className="absolute right-3 bottom-3 flex items-center gap-2 rounded-sm bg-accent py-2 pr-2 pl-3.5 font-display text-[15px] font-bold tracking-[0.04em] text-on-accent uppercase shadow-lift transition-transform group-hover:-translate-y-0.5">
        Continue <Play size={15} fill="currentColor" />
      </span>
    </Link>
  ) : (
    <button
      type="button"
      onClick={onPick}
      className={`group flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 border-2 border-dashed text-center transition-colors ${
        dragOver ? 'border-accent bg-accent/10' : 'border-fg/20 hover:border-fg/45'
      }`}
    >
      <Aperture size={34} strokeWidth={1.5} className="text-accent transition-transform duration-500 group-hover:rotate-45" />
      <span className="carton-title text-[2rem] text-fg">
        <span className="coarse:hidden">Drop photos here</span>
        <span className="hidden coarse:inline">Load a photo</span>
      </span>
      <span className="text-sm text-fg-3">
        <span className="coarse:hidden">or click to choose. Several at once is fine.</span>
        <span className="hidden coarse:inline">Pick from your library or camera.</span>
      </span>
    </button>
  );
  return (
    <div className={`theme-frame rounded-sm px-3 transition-shadow ${dragOver ? 'shadow-[0_0_0_4px_var(--color-accent)]' : ''}`}>
      <Sprockets />
      {inner}
      <p className="edge-code flex h-7 items-center gap-3 overflow-hidden whitespace-nowrap">
        <span className="text-fg-4">{hero ? 'Frame 01A' : 'Frame 00'}</span>
        <span className="truncate">{hero ? hero.name : 'Empty · JPEG · PNG · WebP'}</span>
      </p>
      <Sprockets />
    </div>
  );
}

/** `nameFrom`: only show the name from the `sm` breakpoint up (crowded headers on phones). */
export function Wordmark({ compact = false, nameFrom }: { compact?: boolean; nameFrom?: 'sm' }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-fg" aria-label="Lumen Atelier home">
      <span aria-hidden className="flex h-6 w-6 shrink-0 overflow-hidden rounded-xs ring-2 ring-fg">
        <span className="flex-1 bg-band-red" />
        <span className="flex-1 bg-band-yellow" />
        <span className="flex-1 bg-band-blue" />
      </span>
      {!compact && (
        <span className={`carton-title text-[22px] tracking-[0.02em] whitespace-nowrap ${nameFrom === 'sm' ? 'hidden sm:inline' : ''}`}>Lumen Atelier</span>
      )}
    </Link>
  );
}
