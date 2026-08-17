import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  IconCheckOutline16,
  IconEditOutline16,
  IconPlusOutline16,
  IconSearchOutline16,
  IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SkillsManageLocaleKey } from './locales.ts'
import css from './SkillsManageSection.module.css'

/** Local mirror of the Host settings section. */
export interface SkillLibraryEntry {
  name: string
  description: string
}

export interface SkillGroup {
  id: string
  name: string
  description: string
  skills: string[]
}

export interface ImportFileEntry {
  name: string
  content: string
}

export interface SkillsImportRequest {
  id: number
  path: string
  files: ImportFileEntry[]
}

export interface SkillsImportResult {
  id: number
  ok: boolean
  message: string
  imported: string[]
}

export interface SkillsRefreshResult {
  id: number
  ok: boolean
  message: string
}

export interface SkillsManageSettings {
  activeGroup: string
  groups: SkillGroup[]
  presets: SkillGroup[]
  library: SkillLibraryEntry[]
  importRequest: SkillsImportRequest
  importResult: SkillsImportResult
  refreshRequestId: number
  refreshResult: SkillsRefreshResult
}

/** Registration-side face bound by the client plugin. */
export interface SkillsManageTabInjected {
  scope: SettingsScope<SkillsManageSettings>
}

/** Full component props assembled by the Settings slot renderer. */
export type SkillsManageSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'settings.skillsManage'>
  & InjectFace<SkillsManageTabInjected>

interface GroupDraft {
  id: string
  name: string
  description: string
  skills: string[]
}

interface Notice {
  key: SkillsManageLocaleKey
  detail?: string
}

const emptyDraft = (): GroupDraft => ({ id: '', name: '', description: '', skills: [] })

function groupDraft(group: SkillGroup): GroupDraft {
  return { id: group.id, name: group.name, description: group.description, skills: [...group.skills] }
}

function nextGroups(groups: SkillGroup[], draft: GroupDraft): SkillGroup[] {
  let found = false
  const next = groups.map((group) => {
    if (group.id !== draft.id) return group
    found = true
    return { id: draft.id, name: draft.name, description: draft.description, skills: [...draft.skills] }
  })
  return found ? next : [{ ...draft, skills: [...draft.skills] }, ...next]
}

function newGroupId(): string {
  return `group-${Math.random().toString(36).slice(2, 8)}`
}

type ImportRunner = (payload: { path?: string; files?: ImportFileEntry[] }) => Promise<SkillsImportResult | null>

const MAX_IMPORT_FILE_BYTES = 512 * 1024

/** Render one editable group form. Used for both create and edit. */
function GroupForm({ t, draft, setDraft, onSave, onCancel, library, query, setQuery, isNew, runImport, importing }: {
  t: SkillsManageSectionProps['t']
  draft: GroupDraft
  setDraft: (next: GroupDraft | ((previous: GroupDraft) => GroupDraft)) => void
  onSave: () => void
  onCancel: () => void
  library: SkillLibraryEntry[]
  query: string
  setQuery: (next: string) => void
  isNew: boolean
  runImport: ImportRunner
  importing: boolean
}): ReactNode {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredLibrary = useMemo(
    () => library.filter(skill => skill.name.includes(normalizedQuery) || skill.description.toLocaleLowerCase().includes(normalizedQuery)),
    [library, normalizedQuery],
  )
  const [importFiles, setImportFiles] = useState<ImportFileEntry[]>([])
  const [importPath, setImportPath] = useState('')
  const [dragging, setDragging] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  const toggleSkill = (name: string): void => {
    const skills = draft.skills.includes(name)
      ? draft.skills.filter(candidate => candidate !== name)
      : [...draft.skills, name]
    setDraft({ ...draft, skills })
  }

  const addDroppedFiles = async (files: readonly File[]): Promise<void> => {
    const markdown = files.filter(file => file.name.toLowerCase().endsWith('.md') || file.type === 'text/markdown')
    const next: ImportFileEntry[] = []
    for (const file of markdown) {
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setImportStatus(`${t('fileTooLarge')}: ${file.name}`)
        continue
      }
      const content = await file.text()
      if (content.length > 0) next.push({ name: file.name, content })
    }
    setImportFiles(previous => [...previous, ...next])
  }

  const runAndAdopt = async (payload: { path?: string; files?: ImportFileEntry[] }): Promise<void> => {
    const result = await runImport(payload)
    if (result === null) return
    setImportStatus(result.message)
    if (result.ok && result.imported.length > 0) {
      setDraft((previous) => {
        const merged = new Set([...previous.skills, ...result.imported])
        return { ...previous, skills: [...merged] }
      })
      setImportFiles([])
      setImportPath('')
    }
  }

  return (
    <div className={css.editor}>
      {isNew ? null : (
        <p className={css.groupIdLine}>ID: {draft.id}</p>
      )}
      <label className={css.field}>
        <span>{t('groupName')}</span>
        <input
          autoFocus
          value={draft.name}
          placeholder={t('groupName')}
          onChange={event => setDraft({ ...draft, name: event.currentTarget.value })}
        />
      </label>
      <label className={css.field}>
        <span>{t('groupDescription')}</span>
        <input
          value={draft.description}
          placeholder={t('groupDescription')}
          onChange={event => setDraft({ ...draft, description: event.currentTarget.value })}
        />
      </label>

      {draft.id !== 'all' ? (
        <div className={css.inlineImport}>
          <p className={css.importIntro}>{t('importPanelIntro')}</p>
          <div
            className={css.dropZone}
            data-dragging={dragging ? 'true' : undefined}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => { setDragging(false) }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void addDroppedFiles(Array.from(event.dataTransfer.files))
            }}
          >
            <p>{t('dropHint')}</p>
            <label className={css.secondary}>
              {t('chooseFiles')}
              <input
                className={css.fileInput}
                type="file"
                multiple
                accept=".md,.markdown,text/markdown"
                onChange={(event) => {
                  void addDroppedFiles(Array.from(event.currentTarget.files ?? []))
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </div>
          {importFiles.length > 0 ? (
            <div className={css.importFileList}>
              {importFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className={css.importFileRow}>
                  <span>{file.name}</span>
                  <button type="button" className={css.danger} onClick={() => {
                    setImportFiles(previous => previous.filter((_, i) => i !== index))
                  }}>
                    {t('delete')}
                  </button>
                </div>
              ))}
              <div className={css.actions}>
                <button type="button" className={css.primary} disabled={importing} onClick={() => { void runAndAdopt({ files: importFiles }) }}>
                  {importing ? t('importing') : t('importFiles')}
                </button>
                <button type="button" className={css.secondary} onClick={() => { setImportFiles([]) }}>
                  {t('clearFiles')}
                </button>
              </div>
            </div>
          ) : null}
          <div className={css.pathRow}>
            <input
              type="text"
              value={importPath}
              placeholder={t('pathPlaceholder')}
              aria-label={t('importFromPath')}
              onChange={event => setImportPath(event.currentTarget.value)}
            />
            <button
              type="button"
              className={css.primary}
              disabled={importing || importPath.trim().length === 0}
              onClick={() => { void runAndAdopt({ path: importPath.trim() }) }}
            >
              {importing ? t('importing') : t('importFromPath')}
            </button>
          </div>
          {importStatus ? <p className={css.importStatus}>{importStatus}</p> : null}
        </div>
      ) : null}

      {draft.id === 'all' ? (
        <p className={css.importStatus}>{t('allSkillsAuto')}</p>
      ) : (
        <>
          <label className={css.search}>
            <IconSearchOutline16 aria-hidden="true" />
            <span className={css.visuallyHidden}>{t('skillSearch')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('skillSearch')}
              aria-label={t('skillSearch')}
              onChange={event => setQuery(event.currentTarget.value)}
            />
          </label>
          <div className={css.skillList}>
            {filteredLibrary.length === 0 ? <p className={css.empty}>{t('emptyLibrary')}</p> : null}
            {filteredLibrary.map((skill) => {
              const checked = draft.skills.includes(skill.name)
              return (
                <label key={skill.name} className={css.skillRow} data-checked={checked ? 'true' : undefined}>
                  <input type="checkbox" checked={checked} onChange={() => { toggleSkill(skill.name) }} />
                  <span className={css.skillName}>{skill.name}</span>
                  <span className={css.skillDescription}>{skill.description}</span>
                </label>
              )
            })}
          </div>
        </>
      )}
      <div className={css.actions}>
        <button type="button" className={css.primary} disabled={draft.name.trim().length === 0} onClick={onSave}>
          <IconCheckOutline16 aria-hidden="true" />{t('save')}
        </button>
        <button type="button" className={css.secondary} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  )
}

/** Render the full section. */
export function SkillsManageSection({ t, scope }: SkillsManageSectionProps): ReactNode {
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const createRef = useRef<HTMLLIElement | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<GroupDraft>(emptyDraft)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const importTimeouts = useRef<Set<number>>(new Set())

  useEffect(() => () => {
    for (const timer of importTimeouts.current) window.clearTimeout(timer)
    importTimeouts.current.clear()
  }, [])

  useEffect(() => {
    if (!creating) return
    createRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [creating])

  useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => { setNotice(null) }, 2800)
    return () => { window.clearTimeout(timer) }
  }, [notice])

  const settings = snapshot.value
  if (snapshot.status === 'loading' && settings === undefined) {
    return <p className={css.status}>{t('loading')}</p>
  }
  if (snapshot.status === 'unavailable' || settings === undefined) {
    return <p className={css.status}>{t('unavailable')}</p>
  }

  const library = settings.library ?? []
  const groups = settings.groups ?? []
  const activeGroup = settings.activeGroup === '' || settings.groups.some(group => group.id === settings.activeGroup)
    ? settings.activeGroup
    : settings.groups[0]?.id ?? ''

  const waitForImportResult = async (id: number): Promise<SkillsImportResult> => {
    return new Promise((resolveImport, rejectImport) => {
      let settled = false
      const check = (): void => {
        if (settled) return
        const current = scope.getSnapshot().value
        const result = current?.importResult
        if (result?.id === id) {
          settled = true
          off()
          resolveImport(result)
        }
      }
      const off = scope.subscribe(check)
      check()
      const timer = window.setTimeout(() => {
        importTimeouts.current.delete(timer)
        if (settled) return
        settled = true
        off()
        rejectImport(new Error('import timeout'))
      }, 20000)
      importTimeouts.current.add(timer)
    })
  }

  const waitForRefreshResult = async (id: number): Promise<SkillsRefreshResult> => {
    return new Promise((resolveRefresh, rejectRefresh) => {
      let settled = false
      const check = (): void => {
        if (settled) return
        const current = scope.getSnapshot().value
        const result = current?.refreshResult
        if (result?.id === id) {
          settled = true
          off()
          resolveRefresh(result)
        }
      }
      const off = scope.subscribe(check)
      check()
      const timer = window.setTimeout(() => {
        importTimeouts.current.delete(timer)
        if (settled) return
        settled = true
        off()
        rejectRefresh(new Error('refresh timeout'))
      }, 20000)
      importTimeouts.current.add(timer)
    })
  }

  const refreshLibrary = async (): Promise<void> => {
    const id = Date.now()
    try {
      await scope.set('refreshRequestId', id)
      const result = await waitForRefreshResult(id)
      setNotice({ key: result.ok ? 'refreshDone' : 'refreshFailed', detail: result.message })
    } catch (error) {
      setNotice({ key: 'refreshFailed', detail: String(error) })
    }
  }

  const resetPresets = async (): Promise<void> => {
    const presets = settings.presets ?? []
    const first = presets[0]
    await scope.set('groups', presets)
    if (first !== undefined) await scope.set('activeGroup', first.id)
    setConfirmReset(false)
    setNotice({ key: 'resetDone' })
  }

  const runImport: ImportRunner = async (payload) => {
    if (importing) return null
    const id = Date.now()
    setImporting(true)
    try {
      await scope.set('importRequest', {
        id,
        path: payload.path ?? '',
        files: payload.files ?? [],
      })
      const result = await waitForImportResult(id)
      setNotice({ key: result.ok ? 'imported' : 'importFailed', detail: result.message })
      return result
    } catch (error) {
      setNotice({ key: 'importFailed', detail: String(error) })
      return null
    } finally {
      setImporting(false)
    }
  }

  const activate = (id: string): void => {
    const group = groups.find(candidate => candidate.id === id)
    void scope.set('activeGroup', id)
    if (id === '') setNotice({ key: 'noneActivated' })
    else setNotice({ key: 'activated', detail: group?.name ?? id })
  }

  const saveDraft = (): void => {
    if (draft.name.trim().length === 0) return
    const finalDraft = creating
      ? { ...draft, id: draft.id.trim() || newGroupId() }
      : { ...draft, id: draft.id }
    void scope.set('groups', nextGroups(groups, finalDraft))
    setNotice({ key: creating ? 'created' : 'saved', detail: finalDraft.name })
    setCreating(false)
    setEditingId(null)
    setDraft(emptyDraft())
    setQuery('')
  }

  const startEdit = (group: SkillGroup): void => {
    setCreating(false)
    setConfirmDelete(null)
    setDraft(groupDraft(group))
    setEditingId(group.id)
    setQuery('')
  }

  const startCreate = (): void => {
    setEditingId(null)
    setConfirmDelete(null)
    setDraft(emptyDraft())
    setCreating(true)
    setQuery('')
  }

  const removeGroup = (id: string): void => {
    const group = groups.find(candidate => candidate.id === id)
    const remaining = groups.filter(candidate => candidate.id !== id)
    void (async () => {
      await scope.set('groups', remaining)
      if (activeGroup === id) await scope.set('activeGroup', remaining[0]?.id ?? '')
    })()
    setNotice({ key: 'deleted', detail: group?.name ?? id })
    setConfirmDelete(null)
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className={css.section}>
      <p className={css.intro}>{t('intro')}</p>
      {notice ? (
        <div className={css.notice} role="status">
          <IconCheckOutline16 aria-hidden="true" />
          <span>{t(notice.key)}{notice.detail ? `：${notice.detail}` : ''}</span>
        </div>
      ) : null}
      <div className={css.toolbar}>
        <button type="button" className={css.primary} disabled={creating} onClick={startCreate}>
          <IconPlusOutline16 aria-hidden="true" />{t('newGroup')}
        </button>
        <button type="button" className={css.secondary} onClick={() => { void refreshLibrary() }}>
          {t('refreshLibrary')}
        </button>
        <button type="button" className={css.secondary} onClick={() => { setConfirmReset(value => !value) }}>
          {t('resetPresets')}
        </button>
      </div>

      {confirmReset ? (
        <div className={css.resetPanel} role="alertdialog" aria-label={t('resetPresets')}>
          <p className={css.resetText}>{t('resetConfirmText')}</p>
          <div className={css.actions}>
            <button type="button" className={css.primary} onClick={() => { void resetPresets() }}>
              {t('resetPresets')}
            </button>
            <button type="button" className={css.secondary} onClick={() => { setConfirmReset(false) }}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <ul className={css.groups}>
        <li className={css.groupCard} data-active={activeGroup === '' ? 'true' : undefined}>
          <div className={css.groupHead}>
            <div className={css.groupTitle}>
              <span className={css.groupName}>{t('noneGroup')}</span>
              {activeGroup === '' ? <span className={css.activeBadge}>{t('active')}</span> : null}
            </div>
            <div className={css.actions}>
              {activeGroup === '' ? null : (
                <button type="button" className={css.primary} onClick={() => { activate('') }}>
                  {t('activate')}
                </button>
              )}
            </div>
          </div>
          <p className={css.groupDescription}>{t('noneGroupDescription')}</p>
        </li>

        {creating ? (
          <li key="create" ref={createRef} className={`${css.groupCard} ${css.createCard}`}>
            <h3 className={css.createTitle}>{t('newGroup')}</h3>
            <GroupForm
              t={t}
              draft={draft}
              setDraft={setDraft}
              onSave={saveDraft}
              onCancel={() => { setCreating(false); setQuery('') }}
              library={library}
              query={query}
              setQuery={setQuery}
              isNew
              runImport={runImport}
              importing={importing}
            />
          </li>
        ) : null}

        {groups.length === 0 && !creating ? <p className={css.empty}>{t('noSkills')}</p> : null}

        {groups.map((group) => {
          const active = group.id === activeGroup
          const editing = editingId === group.id
          const deleting = confirmDelete === group.id
          return (
            <li key={group.id} className={css.groupCard} data-active={active ? 'true' : undefined}>
              {editing ? (
                <GroupForm
                  t={t}
                  draft={draft}
                  setDraft={setDraft}
                  onSave={saveDraft}
                  onCancel={() => { setEditingId(null); setQuery('') }}
                  library={library}
                  query={query}
                  setQuery={setQuery}
                  isNew={false}
                  runImport={runImport}
                  importing={importing}
                />
              ) : (
                <>
                  <div className={css.groupHead}>
                    <div className={css.groupTitle}>
                      <span className={css.groupName}>{group.name}</span>
                      {active ? <span className={css.activeBadge}>{t('active')}</span> : null}
                    </div>
                    <div className={css.actions}>
                      {active ? null : (
                        <button type="button" className={css.primary} onClick={() => { activate(group.id) }}>
                          {t('activate')}
                        </button>
                      )}
                      <button type="button" className={css.secondary} onClick={() => { startEdit(group) }}>
                        <IconEditOutline16 aria-hidden="true" />{t('edit')}
                      </button>
                      <button type="button" className={css.danger} onClick={() => {
                        setConfirmDelete(deleting ? null : group.id)
                      }}>
                        <IconTrashOutline16 aria-hidden="true" />{t('delete')}
                      </button>
                    </div>
                  </div>
                  {group.description ? <p className={css.groupDescription}>{group.description}</p> : null}
                  <p className={css.groupMeta}>{t('skills')}: {group.id === 'all' ? library.length : group.skills.length}</p>
                  <div className={css.chips}>
                    {group.id === 'all' ? (
                      <span className={css.chip}>{t('allSkillsCount')} · {library.length}</span>
                    ) : group.skills.length === 0 ? <span className={css.empty}>{t('noSkills')}</span> : group.skills.map(name => (
                      <span key={name} className={css.chip}>{name}</span>
                    ))}
                  </div>
                  {deleting ? (
                    <div className={css.confirmPanel} role="alertdialog" aria-label={t('confirmDelete')}>
                      <p className={css.confirmText}>{t('deleteConfirmText')}</p>
                      <div className={css.actions}>
                        <button type="button" className={css.dangerSolid} onClick={() => { removeGroup(group.id) }}>
                          <IconTrashOutline16 aria-hidden="true" />{t('confirmDelete')}
                        </button>
                        <button type="button" className={css.secondary} onClick={() => { setConfirmDelete(null) }}>
                          {t('cancel')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
