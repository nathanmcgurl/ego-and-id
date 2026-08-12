import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, FileUp, LockKeyhole, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

type DraftPrompt = {
  text: string;
  isRisky: boolean;
};

const emptyDraft: DraftPrompt = { text: "", isRisky: false };

function parsePromptCsv(source: string): DraftPrompt[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    const nextCharacter = source[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(value.trim());
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += character;
  }

  row.push(value.trim());
  if (row.some(cell => cell.length > 0)) rows.push(row);
  if (rows.length < 2) throw new Error("Your CSV needs a header row and at least one prompt.");

  const headers = rows[0]!.map(header => header.trim().toLocaleLowerCase());
  const textIndex = headers.findIndex(header => header === "prompt" || header === "text");
  const riskyIndex = headers.findIndex(header => header === "isrisky" || header === "is_risky" || header === "risky");
  if (textIndex < 0) throw new Error("Use a prompt or text column in the CSV header.");

  return rows.slice(1).flatMap(rowValues => {
    const text = rowValues[textIndex]?.trim() ?? "";
    if (!text) return [];
    const risky = riskyIndex >= 0 ? (rowValues[riskyIndex] ?? "").trim().toLocaleLowerCase() : "false";
    return [{ text, isRisky: ["true", "1", "yes"].includes(risky) }];
  });
}

function PromptStudio() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<DraftPrompt>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === "admin";
  const promptQuery = trpc.prompts.list.useQuery(undefined, { enabled: Boolean(isAuthenticated && isAdmin) });

  const createMutation = trpc.prompts.create.useMutation({
    onSuccess: async () => {
      setDraft(emptyDraft);
      await utils.prompts.list.invalidate();
      toast.success("Prompt added to the catalog.");
    },
    onError: error => toast.error(error.message),
  });
  const updateMutation = trpc.prompts.update.useMutation({
    onSuccess: async () => {
      setDraft(emptyDraft);
      setEditingId(null);
      await utils.prompts.list.invalidate();
      toast.success("Prompt updated.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteMutation = trpc.prompts.delete.useMutation({
    onSuccess: async () => {
      await utils.prompts.list.invalidate();
      toast.success("Prompt removed.");
    },
    onError: error => toast.error(error.message),
  });
  const importMutation = trpc.prompts.import.useMutation({
    onSuccess: async result => {
      await utils.prompts.list.invalidate();
      toast.success(`Imported ${result.imported} prompt${result.imported === 1 ? "" : "s"}; skipped ${result.skipped} duplicate${result.skipped === 1 ? "" : "s"}.`);
    },
    onError: error => toast.error(error.message),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, prompt: draft });
    } else {
      createMutation.mutate(draft);
    }
  };

  const beginEdit = (prompt: { id: string; text: string; isRisky: boolean }) => {
    setEditingId(prompt.id);
    setDraft({ text: prompt.text, isRisky: prompt.isRisky });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const confirmDelete = (prompt: { id: string; text: string }) => {
    if (window.confirm(`Remove this prompt from the catalog?\n\n${prompt.text}`)) {
      deleteMutation.mutate({ id: prompt.id });
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".csv")) {
      toast.error("Please choose a .csv file.");
      return;
    }

    try {
      const entries = parsePromptCsv(await file.text());
      if (entries.length === 0) {
        toast.error("No usable prompt rows were found in that file.");
        return;
      }
      importMutation.mutate(entries);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "We could not read that CSV file.");
    }
  };

  if (loading) {
    return <div className="game-shell grid min-h-screen place-items-center"><div className="game-card p-6 text-sm font-bold">Loading prompt studio…</div></div>;
  }

  if (!isAuthenticated) {
    return (
      <main className="game-shell grid min-h-screen place-items-center px-4">
        <section className="game-card max-w-md p-7 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border-2 border-[#171113] bg-[#c8b6ff] shadow-[3px_3px_0_#171113]"><LockKeyhole size={27} /></span>
          <h1 className="display-type mt-6 text-4xl leading-none">Prompt studio</h1>
          <p className="mt-4 text-sm font-medium leading-6 text-[#5e464d]">Sign in as the project owner to curate the private prompt catalog.</p>
          <button type="button" onClick={() => startLogin()} className="game-button mt-6">Sign in to continue</button>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="game-shell grid min-h-screen place-items-center px-4">
        <section className="game-card max-w-md p-7 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border-2 border-[#171113] bg-[#ffb0b0] shadow-[3px_3px_0_#171113]"><ShieldAlert size={27} /></span>
          <h1 className="display-type mt-6 text-4xl leading-none">Owner access only</h1>
          <p className="mt-4 text-sm font-medium leading-6 text-[#5e464d]">This space is reserved for the project owner who manages the game’s curated prompt list.</p>
          <button type="button" onClick={() => setLocation("/")} className="game-button mt-6"><ArrowLeft size={17} className="mr-2 inline" /> Back to the game</button>
        </section>
      </main>
    );
  }

  const prompts = promptQuery.data ?? [];
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl pb-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow"><LockKeyhole size={12} /> Owner workspace</p>
            <h1 className="display-type mt-4 text-4xl leading-[0.9] sm:text-5xl">Prompt studio</h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-[#5e464d]">Manage the catalog the Judge sees. Every round requires at least ten eligible prompts, and duplicate text is ignored during import.</p>
          </div>
          <button type="button" className="game-button game-button--mint" onClick={() => setLocation("/")}><ArrowLeft size={17} className="mr-2 inline" /> Game home</button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <form onSubmit={handleSubmit} className="game-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="eyebrow"><Plus size={12} /> {editingId ? "Editing prompt" : "New prompt"}</p><h2 className="display-type mt-3 text-2xl leading-none">{editingId ? "Fine-tune it." : "Add a prompt."}</h2></div>
              {editingId && <button type="button" className="rounded-xl border-2 border-[#171113] bg-[#fffdf5] px-3 py-2 text-xs font-black" onClick={cancelEdit}>Cancel edit</button>}
            </div>
            <label htmlFor="prompt-text" className="mt-5 block text-sm font-black">Prompt text</label>
            <textarea id="prompt-text" className="game-input mt-2 min-h-28 resize-y" value={draft.text} onChange={event => setDraft(current => ({ ...current, text: event.target.value }))} maxLength={500} placeholder="…most likely to turn a tiny errand into an adventure" required />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-black"><input type="checkbox" className="size-5 accent-[#171113]" checked={draft.isRisky} onChange={event => setDraft(current => ({ ...current, isRisky: event.target.checked }))} /> Mark as risky</label>
              <span className="text-xs font-bold text-[#70575e]">{draft.text.length}/500</span>
            </div>
            <button type="submit" className="game-button mt-5" disabled={saving || draft.text.trim().length < 5}>{saving ? "Saving…" : editingId ? "Save changes" : "Add prompt"}</button>
          </form>

          <aside className="game-card bg-[#fff2a7]/80 p-5">
            <p className="eyebrow"><FileUp size={12} /> CSV import</p>
            <h2 className="display-type mt-3 text-2xl leading-none">Load a batch.</h2>
            <p className="mt-4 text-sm font-medium leading-6 text-[#5e464d]">Use headers <code className="rounded bg-[#fffdf5] px-1 font-bold">prompt,isRisky</code>. Quoted commas are supported; duplicate text is skipped.</p>
            <input ref={fileInputRef} className="sr-only" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
            <button type="button" className="game-button game-button--lilac mt-5 w-full" onClick={() => fileInputRef.current?.click()} disabled={importMutation.isPending}><FileUp size={17} className="mr-2 inline" /> {importMutation.isPending ? "Importing…" : "Choose CSV"}</button>
            <p className="mt-4 text-xs font-bold leading-5 text-[#70575e]">The catalog must retain at least 10 prompts so the Judge can see exactly 10 each round.</p>
          </aside>
        </div>

        <section className="game-card mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#171113] px-5 py-5 sm:px-6">
            <div><p className="eyebrow"><LockKeyhole size={12} /> Current catalog</p><h2 className="display-type mt-3 text-2xl leading-none">{prompts.length} prompts</h2></div>
            {promptQuery.isFetching && <span className="text-xs font-black uppercase tracking-[0.1em] text-[#70575e]">Refreshing…</span>}
          </div>
          {promptQuery.isLoading ? <div className="p-6 text-sm font-bold">Loading catalog…</div> : promptQuery.isError ? <div className="p-6 text-sm font-bold text-red-700">We could not load the prompt catalog. {promptQuery.error.message}</div> : (
            <ul className="divide-y-2 divide-[#171113]">
              {prompts.map(prompt => (
                <li key={prompt.id} className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6">
                  <p className="min-w-0 flex-1 text-sm font-bold leading-6">{prompt.text}</p>
                  <div className="flex items-center gap-2">
                    {prompt.isRisky && <span className="rounded-full border-2 border-[#171113] bg-[#ffb0b0] px-2 py-1 text-[0.62rem] font-black uppercase tracking-[0.08em]">Risky</span>}
                    <button type="button" aria-label={`Edit ${prompt.text}`} className="grid size-9 place-items-center rounded-lg border-2 border-[#171113] bg-[#c8b6ff]" onClick={() => beginEdit(prompt)}><Pencil size={16} /></button>
                    <button type="button" aria-label={`Delete ${prompt.text}`} className="grid size-9 place-items-center rounded-lg border-2 border-[#171113] bg-[#ffb0b0]" onClick={() => confirmDelete(prompt)} disabled={deleteMutation.isPending || prompts.length <= 10}><Trash2 size={16} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}

export default function Admin() {
  return <PromptStudio />;
}
