import { useRef, useState } from 'react';
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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import {
  button,
  primaryButton,
  textButton,
  iconButton,
  fieldInput,
} from './ui';

export function CheatSheet({
  game,
  onClose,
}: {
  game: Game;
  onClose: () => void;
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
        className="flex max-h-[min(90dvh,48rem)] max-w-xl flex-col overflow-hidden p-0 sm:p-0"
        backdropClassName="backdrop-blur-sm"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle
              id="cheat-title"
              className="text-xl font-semibold tracking-tight"
            >
              Cheats
            </DialogTitle>
            <DialogDescription className="mt-2 flex min-w-0 items-center gap-2 text-[10px] whitespace-nowrap">
              <span className="min-w-0 truncate text-xs">{game.name}</span>
              <span className="shrink-0 rounded border border-line px-1.5 py-0.5">
                {game.gameCode || 'Unknown region'}
              </span>
              <span className="shrink-0">Version {game.version}</span>
              {!editing && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    {cheats.filter((cheat) => cheat.enabled).length} active
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
            <Icon name="close" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
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
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="-ml-2 flex flex-wrap">
                  <Button
                    variant="primary"
                    size="xs"
                    disabled={exported.isPending}
                    onClick={() =>
                      exported.mutate(undefined, {
                        onError: (error) => toast(friendlyError(error)),
                      })
                    }
                  >
                    <Icon name="download" size={13} />
                    Export<span className="sr-only"> JSON</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="xs"
                    disabled={imported.isPending}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Icon name="upload" size={13} />
                    Import<span className="sr-only"> JSON</span>
                  </Button>
                </div>
                <Button
                  variant="primary"
                  size="xs"
                  className="border border-primary/25 hover:border-primary/40"
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
                <div className="rounded-lg border border-dashed border-line px-5 py-10 text-center">
                  <span className="mb-4 inline-flex text-primary">
                    <Icon name="cheats" size={28} />
                  </span>
                  <h3 className="text-sm font-medium">No cheats yet</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    A little advantage, on your terms.
                    <br />
                    Add a GameShark, Action Replay, or CodeBreaker code.
                  </p>
                </div>
              )}
              <div className="space-y-3">
                {cheats.map((cheat) => (
                  <article
                    className={`rounded-lg border bg-surface/15 p-4 ${cheat.enabled ? 'border-primary/35' : 'border-line'}`}
                    key={cheat.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium break-words">
                          {cheat.label}
                        </h3>
                        {(cheat.gameCode || cheat.version !== undefined) && (
                          <small className="mt-1 block font-mono text-xs text-muted">
                            {cheat.gameCode ?? 'Any region'} ·{' '}
                            {cheat.version === undefined
                              ? 'Any version'
                              : `v${cheat.version}`}
                          </small>
                        )}
                      </div>
                      <label className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center">
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
                    </div>
                    <pre
                      tabIndex={0}
                      aria-label={`Code for ${cheat.label}`}
                      className="my-3 max-h-32 overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-xs leading-6"
                    >
                      {cheat.code}
                    </pre>
                    {mismatch(cheat, game) && (
                      <p className="mb-3 border-l-2 border-primary pl-2 text-xs leading-relaxed text-muted">
                        This code is tagged for a different game code or
                        version.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-[10px] text-muted">
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${cheat.enabled ? 'bg-primary' : 'bg-line'}`}
                        />
                        {cheat.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <div className="-mr-2 flex">
                        <Button
                          className={textButton}
                          onClick={() => setEditing(cheat)}
                        >
                          Edit<span className="sr-only"> {cheat.label}</span>
                        </Button>
                        <Button
                          className={textButton}
                          disabled={remove.isPending}
                          onClick={() => {
                            if (confirm(`Delete “${cheat.label}”?`))
                              remove.mutate(cheat.id, {
                                onError: (error) => toast(friendlyError(error)),
                              });
                          }}
                        >
                          Delete<span className="sr-only"> {cheat.label}</span>
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-start gap-2 border-t border-line bg-surface/20 px-5 py-3 text-[10px] leading-relaxed text-muted sm:px-6">
          <span className="mt-0.5 shrink-0">
            <Icon name="shield" size={14} />
          </span>
          <p>
            Match your game’s region and version. Some codes need a master code
            or a restart.
          </p>
        </div>
      </DialogContent>
    </Dialog>
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
