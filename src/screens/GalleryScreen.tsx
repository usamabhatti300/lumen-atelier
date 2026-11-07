/** Welcome screen and project gallery (contact sheet). */
import { AnimatePresence, motion } from 'motion/react';
import { Aperture, ChevronRight, ImagePlus, Pencil, Settings, SwatchBook, Trash2, Wand2, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { InstallBanner, InstallButton } from '@/pwa/PwaUi';
import { takeSharedFiles } from '@/pwa/pwa';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Progress } from '@/components/ui/misc';
import { ZoneScale } from '@/components/ZoneScale';
import { useSettings } from '@/state/settingsStore';
import { useEditor } from '@/state/editorStore';
import {
  createProject,
  deleteProject,
  getPhoto,
  listProjects,
  saveProject,
  type ProjectRecord,
} from '@/lib/storage/db';
import { importFiles } from '@/engine/importer';

interface ProjectCard extends ProjectRecord {
  cover: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

function defaultProjectName() {
  return `Photos · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
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
  const pickPhotos = () => {
    intent.current = 'edit';
    fileInput.current?.click();
  };
  const matchLook = () => {
    intent.current = 'reference';
    void startProject([], 'reference');
  };
  const importProgress = importing && (
    <div className="mt-6 max-w-sm">
      <p className="mb-2 text-xs text-mute tabular">
        Importing {importing.done} of {importing.total}…
      </p>
      <Progress value={importing.done / importing.total} label="Import progress" />
    </div>
  );

  return (
    <div className="scroll-quiet h-full overflow-y-auto bg-ink-900">
      <header className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1">
          <InstallButton className="hidden sm:flex" />
          <Link to="/presets" aria-label="Presets" className="flex h-8 items-center gap-2 rounded-sm px-3 coarse:h-10 text-[13px] text-ivory-dim hover:bg-ink-700 hover:text-ivory">
            <SwatchBook size={15} /> <span className="hidden sm:inline">Presets</span>
          </Link>
          <Link to="/settings" aria-label="Settings" className="flex h-8 items-center gap-2 rounded-sm px-3 coarse:h-10 text-[13px] text-ivory-dim hover:bg-ink-700 hover:text-ivory">
            <Settings size={15} /> <span className="hidden sm:inline">Settings</span>
          </Link>
        </nav>
      </header>
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

        {/* Phones: an app home, not a landing page. Two big actions, then "continue" and recent edits. */}
        <section className="border-b border-line-soft pt-3 pb-8 sm:hidden">
          <p className="edge-code mb-3">Photos stay on this device</p>
          <h1 className="font-display text-[34px] leading-[1.04] tracking-[-0.01em] text-ivory">
            Develop your photos.
            <br />
            <em className="text-champagne">Borrow any look.</em>
          </h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <HomeAction primary icon={ImagePlus} title="Edit photos" text="From your gallery or camera" onClick={pickPhotos} />
            <HomeAction icon={Wand2} title="Match a look" text="Copy the style of any photo you love" onClick={matchLook} />
          </div>
          {resume && (
            <Link to={`/project/${resume.id}`} className="mt-3 flex items-center gap-3 rounded-md border border-line-soft bg-ink-850 p-2.5 active:bg-ink-800">
              {resume.cover ? <img src={resume.cover} alt="" className="h-12 w-12 shrink-0 rounded-sm object-cover" /> : <span className="h-12 w-12 shrink-0 rounded-sm bg-ink-800" />}
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-mute">Continue editing</span>
                <span className="block truncate text-sm text-ivory">{resume.name}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-mute" />
            </Link>
          )}
          {importProgress}
        </section>

        <section className="hidden gap-10 border-b border-line-soft pt-10 pb-14 sm:grid lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
            <p className="edge-code mb-5">Local darkroom · photos stay on this device</p>
            <h1 className="font-display text-[38px] leading-[1.02] tracking-[-0.01em] text-ivory min-[400px]:text-[44px] sm:text-[64px]">
              Develop your photographs.
              <br />
              <em className="text-champagne">Borrow the look</em> of any reference.
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-mute">
              Precise colour grading, retouching and masks, with 186 original presets. Show the studio a photo
              whose look you love and it builds an editable preset from it. You can refine that preset and use it on
              any photo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="primary" icon={<ImagePlus size={16} />} onClick={pickPhotos}>
                Open photos
              </Button>
              <Button variant="accent-outline" icon={<Wand2 size={16} />} onClick={matchLook}>
                Match a reference look
              </Button>
            </div>
            {importProgress}
          </motion.div>

          <motion.button
            type="button"
            onClick={pickPhotos}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className={`group relative flex min-h-[260px] flex-col justify-between rounded-md border border-dashed p-6 text-left transition-colors ${
              dragOver ? 'border-amber bg-amber/5' : 'border-line hover:border-line-strong'
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="edge-code">Drop JPEG · PNG · WebP</span>
              <Aperture size={20} className="text-faint transition-colors group-hover:text-amber" />
            </div>
            <div>
              <p className="font-display text-3xl text-ivory-dim">
                <span className="coarse:hidden">Drag photos anywhere</span>
                <span className="hidden coarse:inline">Choose photos</span>
              </p>
              <p className="mt-1 text-sm text-mute">
                <span className="coarse:hidden">or click to choose files. Several at once is fine.</span>
                <span className="hidden coarse:inline">Tap to pick from your library or camera. Several at once is fine.</span>
              </p>
            </div>
            <ZoneScale />
          </motion.button>
        </section>

        <section className="pt-8 sm:pt-10">
          <div className="mb-5 flex items-end justify-between sm:mb-6">
            <h2 className="font-display text-[26px] text-ivory sm:text-3xl">Your edits</h2>
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
            <p className="rounded-md border border-line-soft px-5 py-10 text-center text-sm text-mute">
              Nothing here yet. Open a photo to start editing. Your edits are saved on this device.
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
                    <Link to={`/project/${p.id}`} className="block overflow-hidden rounded-sm bg-ink-950 ring-1 ring-line-soft transition-shadow hover:ring-line-strong">
                      <div className="aspect-[4/3] overflow-hidden bg-ink-800">
                        {p.cover ? (
                          <img src={p.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-faint">Empty</div>
                        )}
                      </div>
                    </Link>
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-ivory">{p.name}</p>
                        <p className="text-xs text-faint">
                          {new Date(p.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {p.photoIds.length}{' '}
                          {p.photoIds.length === 1 ? 'photo' : 'photos'}
                        </p>
                      </div>
                      <div className="flex opacity-100 transition-opacity fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100">
                        <button type="button" aria-label={`Rename ${p.name}`} onClick={() => setRenaming(p)} className="rounded-xs p-1.5 text-faint hover:bg-ink-700 hover:text-ivory coarse:p-2.5">
                          <Pencil size={13} />
                        </button>
                        <button type="button" aria-label={`Delete ${p.name}`} onClick={() => setConfirmDelete(p)} className="rounded-xs p-1.5 text-faint hover:bg-ink-700 hover:text-safelight coarse:p-2.5">
                          <Trash2 size={13} />
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
        <p className="px-4 py-4 text-sm leading-relaxed text-mute">
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
        <label className="mb-1.5 block text-xs text-mute" htmlFor="project-name">
          Project name
        </label>
        <input
          id="project-name"
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onSave(name.trim())}
          className="h-9 w-full rounded-sm border border-line bg-ink-950 px-3 text-sm text-ivory outline-none focus:border-amber/70"
        />
      </div>
    </Dialog>
  );
}

function HomeAction({ primary = false, icon: Icon, title, text, onClick }: { primary?: boolean; icon: LucideIcon; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[136px] flex-col justify-between rounded-md p-4 text-left transition-transform active:scale-[0.98] ${
        primary ? 'bg-amber text-ink-950' : 'border border-amber/40 bg-gradient-to-br from-amber/15 to-transparent text-ivory'
      }`}
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${primary ? 'bg-ink-950/10' : 'bg-amber/15 text-amber'}`}>
        <Icon size={20} />
      </span>
      <span>
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className={`mt-0.5 block text-xs leading-snug ${primary ? 'text-ink-950/75' : 'text-mute'}`}>{text}</span>
      </span>
    </button>
  );
}

/** `nameFrom`: only show the name from the `sm` breakpoint up (crowded headers on phones). */
export function Wordmark({ compact = false, nameFrom }: { compact?: boolean; nameFrom?: 'sm' }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 text-ivory" aria-label="Lumen Atelier home">
      <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="11" fill="none" stroke="var(--color-amber)" strokeWidth="2" />
        <path d="M16 5a11 11 0 0 1 0 22z" fill="var(--color-amber)" />
      </svg>
      {!compact && (
        <span className={`font-display text-[22px] leading-none tracking-[0.005em] whitespace-nowrap ${nameFrom === 'sm' ? 'hidden sm:inline' : ''}`}>Lumen Atelier</span>
      )}
    </Link>
  );
}
