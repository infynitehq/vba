import { useEffect, useRef, useState } from 'react';
import { useForm } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import type { Game } from '../data/db';
import { data, friendlyError } from '../data/db';
import { cheatsQuery, useDataMutation, useToggleCheat } from '../data/queries';
import {
  cheatFormSchema,
  mismatch,
  type Cheat,
  type CheatFormValues,
} from '../lib/cheat-format';
import { exportCheats, importCheats } from '../data/backup';
import { useToast } from './Toast';
import { Icon } from './Icon';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { button, primaryButton, iconButton, fieldInput } from './ui';

export function CheatSheet({
  game,
  onClose,
  playing = false,
}: {
  game: Game;
  onClose: () => void;
  playing?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const {
    data: cheats = [],
    isPending,
    error,
  } = useQuery(cheatsQuery(game.id));
  const [editing, setEditing] = useState<Cheat | 'new' | null>(null);
  const put = useToggleCheat();
  const remove = useDataMutation(data.removeCheat);
  const imported = useDataMutation((file: File) => importCheats(file, game.id));
  const exported = useDataMutation(() => exportCheats(game.id));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`flex max-h-[min(90dvh,40rem)] flex-col overflow-hidden p-0 sm:p-0 ${editing ? 'max-w-lg' : 'max-w-2xl'}`}
        backdropClassName="backdrop-blur-sm"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle
              id="cheat-title"
              className="text-lg font-semibold tracking-tight"
            >
              Cheats
            </DialogTitle>
            <DialogDescription className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="max-w-full truncate">{game.name}</span>
              <span aria-hidden="true">·</span>
              <span>
                {game.gameCode || 'Unknown region'} v{game.version}
              </span>
              {!editing && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    {cheats.filter((cheat) => cheat.enabled).length}{' '}
                    {playing ? 'selected' : 'active'}
                  </span>
                </>
              )}
            </DialogDescription>
          </div>
          <Button
            className={iconButton}
            onClick={onClose}
            aria-label="Close cheats"
          >
            <Icon name="close" size={18} />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-2 sm:px-6">
          {editing ? (
            <CheatEditor
              key={typeof editing === 'string' ? 'new' : editing.id}
              cheat={editing === 'new' ? undefined : editing}
              game={game}
              onCancel={() => setEditing(null)}
              onSaved={() => setEditing(null)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <div className="-ml-2 flex flex-wrap">
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={exported.isPending}
                    onClick={() =>
                      exported.mutate(undefined, {
                        onError: (error) => toast(friendlyError(error)),
                      })
                    }
                  >
                    Export<span className="sr-only"> JSON</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={imported.isPending}
                    onClick={() => fileInput.current?.click()}
                  >
                    Import<span className="sr-only"> JSON</span>
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setEditing('new')}
                >
                  <Icon name="plus" size={12} /> Add cheat
                </Button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file)
                    imported.mutate(file, {
                      onSuccess: () =>
                        toast('Cheats imported. Matching IDs were updated.'),
                      onError: (error) => toast(friendlyError(error)),
                    });
                  event.target.value = '';
                }}
              />
              {isPending && (
                <p
                  role="status"
                  className="py-8 text-center text-xs text-muted"
                >
                  Loading cheats…
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="rounded-md border border-line p-4 text-sm"
                >
                  {friendlyError(error)}
                </p>
              )}
              {!isPending && !error && !cheats.length && (
                <div className="px-3 py-10 text-center">
                  <h3 className="text-sm font-medium">No cheats yet</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    Add a GameShark, Action Replay, or CodeBreaker code.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2">
                {cheats.map((cheat) => (
                  <article
                    aria-label={cheat.label}
                    className="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface/10 p-3"
                    key={cheat.id}
                  >
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1">
                      <label className="-ml-1 inline-flex size-8 cursor-pointer items-center justify-center">
                        <Checkbox
                          aria-label={`Enable ${cheat.label}`}
                          checked={cheat.enabled}
                          disabled={put.isPending}
                          onCheckedChange={() =>
                            put.mutate(
                              { ...cheat, enabled: !cheat.enabled },
                              {
                                onError: (error) => toast(friendlyError(error)),
                              },
                            )
                          }
                        />
                      </label>
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium break-words">
                          {cheat.label}
                        </h3>
                        {(cheat.gameCode || cheat.version !== undefined) && (
                          <small className="mt-1 block text-[11px] text-muted">
                            {cheat.gameCode ?? 'Any region'} ·{' '}
                            {cheat.version === undefined
                              ? 'Any version'
                              : `v${cheat.version}`}
                          </small>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button size="icon-xs" />}
                          aria-label={`More options for ${cheat.label}`}
                          title="Cheat actions"
                        >
                          <Icon name="more" size={16} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-36">
                          <DropdownMenuItem onClick={() => setEditing(cheat)}>
                            Edit<span className="sr-only"> {cheat.label}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="data-highlighted:bg-destructive/10 data-highlighted:text-ink"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (confirm(`Delete “${cheat.label}”?`))
                                remove.mutate(cheat.id, {
                                  onError: (error) =>
                                    toast(friendlyError(error)),
                                });
                            }}
                          >
                            Delete
                            <span className="sr-only"> {cheat.label}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {mismatch(cheat, game) && (
                      <p className="text-xs leading-relaxed text-accent-foreground">
                        This code is tagged for a different game code or
                        version.
                      </p>
                    )}
                    <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <pre
                        tabIndex={0}
                        aria-label={`Code for ${cheat.label}`}
                        className="min-h-10 max-h-32 overflow-auto py-1 font-mono text-xs leading-5 text-muted"
                      >
                        {cheat.code}
                      </pre>
                      <CopyCheatButton code={cheat.code} label={cheat.label} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-line px-5 py-3 text-[11px] leading-relaxed text-muted sm:px-6">
          <p>
            {playing
              ? 'Changes apply next launch. Save in-game before reopening.'
              : 'Match your game’s region and version. Some codes need a restart.'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CopyCheatButton({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <Button
        size="icon-xs"
        aria-label={`${copied ? 'Copied' : 'Copy'} code for ${label}`}
        title={copied ? 'Copied' : 'Copy code'}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
          } catch {
            toast(
              'Could not copy the code. Select the code and copy it manually.',
            );
          }
        }}
      >
        <Icon name={copied ? 'check' : 'copy'} size={13} />
      </Button>
      <span role="status" className="sr-only">
        {copied ? `${label} code copied.` : ''}
      </span>
    </>
  );
}

function CheatEditor({
  cheat,
  game,
  onCancel,
  onSaved,
}: {
  cheat?: Cheat;
  game: Game;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const save = useDataMutation(data.putCheat);
  const defaults: CheatFormValues = {
    label: cheat?.label ?? '',
    code: cheat?.code ?? '',
    gameCode: cheat?.gameCode ?? '',
    version: cheat?.version?.toString() ?? '',
  };
  const form = useForm({
    defaultValues: defaults,
    validators: { onChange: cheatFormSchema, onSubmit: cheatFormSchema },
    onSubmit: async ({ value }) => {
      const parsed = cheatFormSchema.parse(value);
      try {
        await save.mutateAsync({
          id: cheat?.id ?? crypto.randomUUID(),
          gameId: game.id,
          label: parsed.label,
          code: parsed.code,
          enabled: cheat?.enabled ?? false,
          createdAt: cheat?.createdAt ?? Date.now(),
          gameCode: parsed.gameCode || undefined,
          version: parsed.version ? Number(parsed.version) : undefined,
        });
        toast(
          cheat
            ? 'Cheat updated.'
            : 'Cheat saved. Turn it on when you’re ready.',
        );
        onSaved();
      } catch (error) {
        toast(friendlyError(error));
      }
    },
  });
  return (
    <form
      className="grid grid-cols-2 gap-x-4 gap-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      noValidate
    >
      <h3 className="col-span-2 text-sm font-semibold">
        {cheat ? 'Edit cheat' : 'Add a cheat'}
      </h3>
      {(['label', 'code', 'gameCode', 'version'] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <div
              className={
                name === 'gameCode' || name === 'version'
                  ? 'min-w-0'
                  : 'col-span-2 min-w-0'
              }
            >
              <label
                className="mb-2 block text-xs font-medium"
                htmlFor={`cheat-${name}`}
              >
                {
                  {
                    label: 'Name',
                    code: 'Cheat code',
                    gameCode: 'Game code (optional)',
                    version: 'Version (optional)',
                  }[name]
                }
              </label>
              {name === 'code' ? (
                <Textarea
                  className={`${fieldInput} resize-y font-mono leading-relaxed`}
                  id={`cheat-${name}`}
                  rows={6}
                  spellCheck={false}
                  placeholder={'XXXXXXXX YYYYYYYY\nXXXXXXXX YYYY'}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={`${name}-error`}
                />
              ) : (
                <Input
                  className={fieldInput}
                  id={`cheat-${name}`}
                  autoFocus={name === 'label'}
                  maxLength={
                    name === 'label' ? 100 : name === 'gameCode' ? 4 : 3
                  }
                  inputMode={name === 'version' ? 'numeric' : 'text'}
                  placeholder={
                    name === 'gameCode'
                      ? game.gameCode
                      : name === 'version'
                        ? String(game.version)
                        : 'e.g. Extra lives'
                  }
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={`${name}-error`}
                />
              )}
              <div
                id={`${name}-error`}
                className="mt-2 text-xs leading-relaxed text-ink"
                role={field.state.meta.errors.length ? 'alert' : undefined}
              >
                {field.state.meta.errors.map((error, index) => (
                  <span className="block" key={index}>
                    {typeof error === 'string' ? error : error?.message}
                  </span>
                ))}
              </div>
            </div>
          )}
        </form.Field>
      ))}
      <p className="col-span-2 text-[11px] leading-relaxed text-muted">
        One code per line. Optional tags flag mismatches without blocking a
        code.
      </p>
      <div className="col-span-2 flex justify-end gap-2 border-t border-line pt-4">
        <Button type="button" className={button} onClick={onCancel}>
          Cancel
        </Button>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              className={primaryButton}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? 'Saving…' : 'Save cheat'}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
