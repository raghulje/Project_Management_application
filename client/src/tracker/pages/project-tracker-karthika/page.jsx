import { useContext, useEffect, useRef, useState } from 'react';
import AppLayout from '@/components/feature/AppLayout.jsx';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ListFilter,
} from '@/components/project-tracker-karthika/Icons.jsx';
import {
  fetchMyProjects,
  fetchMyIndividualTasks,
  fetchIndividualTaskProgress,
  fetchProjectTasks,
  fetchAllSubtasks,
  filterSubtasksForTask,
  attachSubtaskCounts,
  createSubtaskInstance,
  createTaskInstance,
  openSubtaskDraft,
  openTaskDraft,
} from '@/lib/kfProjectTrackerKarthika.js';
import { KissflowSDKContext } from '@/sdk/index.js';
import { ProjectTrackerEmbedContext } from '@/contexts/ProjectTrackerEmbedContext.jsx';
import PtSelect from '@/components/PtSelect.jsx';
import styles from './styles.module.css';

const PAGE_SIZE = 10;

const STATUS_STYLES = {
  'In progress': { bg: '#E8F0FE', color: '#1E88E5' },
  Overdue: { bg: '#FEF2F2', color: '#E53935' },
  Done: { bg: '#F0FDF4', color: '#43A047' },
};

const PRIORITY_STYLES = {
  High: { bg: '#FEF2F2', color: '#E53935' },
  Medium: { bg: '#FFF7ED', color: '#FB8C00' },
  Low: { bg: '#F0FDF4', color: '#43A047' },
};

const ROW_BADGE = {
  project: { label: 'Project', bg: '#E8F0FE', color: '#1E88E5' },
  task: { label: 'Task', bg: '#F0FDF4', color: '#43A047' },
  subtask: { label: 'Subtask', bg: '#FFF7ED', color: '#FB8C00' },
};

const PROJECT_DETAIL_POPUP_ID = 'Popup_RWeNJp0JqJ';
const NEW_PROJECT_POPUP_ID = 'Popup_RWeNJp0JqJ';
const NEW_TASK_POPUP_ID = 'Popup_REuPaKLc6u';
const INDIVIDUAL_TASK_POPUP_ID = NEW_TASK_POPUP_ID;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Pill({ map, value }) {
  if (!value || value === '—') {
    return <span className={styles.pillMuted}>—</span>;
  }
  const s = map[value] || { bg: '#EEF1F5', color: '#475569' };
  return (
    <span className={styles.pill} style={{ background: s.bg, color: s.color }}>
      {value}
    </span>
  );
}

function Progress({ value }) {
  if (value == null) {
    return <span className={styles.pillMuted}>—</span>;
  }
  return (
    <div className={styles.progressWrap}>
      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${value}%` }} />
      </div>
      <span className={styles.progressLabel}>{value}%</span>
    </div>
  );
}

function People({ people = [], extra = 0, count }) {
  if (!people.length) {
    return <span className={styles.pillMuted}>—</span>;
  }
  return (
    <div className={styles.peopleWrap}>
      <div className={styles.avatars}>
        {people.map((p, i) => (
          <div
            key={i}
            className={styles.avatar}
            style={{ background: p.c, marginLeft: i === 0 ? 0 : -10 }}
            title={p.name}
          >
            {p.l}
          </div>
        ))}
      </div>
      <span className={styles.peopleCount}>{extra > 0 ? `+${extra}` : count}</span>
    </div>
  );
}

function RowBadge({ type }) {
  const b = ROW_BADGE[type];
  return (
    <span
      className={styles.typeChip}
      style={{ background: b.bg, color: b.color }}
    >
      {b.label}
    </span>
  );
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function openKfPopup(kfInstance, popupId, params = {}, onPopupStateChange) {
  onPopupStateChange?.(true);
  try {
    await kfInstance.app.page.openPopup(popupId, params);
  } catch (error) {
    console.error('Failed to open popup:', error);
    onPopupStateChange?.(false);
  }
}

/**
 * Project business id (e.g. PRJ-RRIL_Solar-FY026-0006) — not Kissflow board _id.
 */
function resolveRowProjectId(row) {
  return String(row?.projectId ?? row?.project_id ?? '').trim();
}

function resolveRowTaskId(row) {
  const direct = String(row?.taskId ?? row?.taskBusinessId ?? row?.task_id ?? '').trim();
  if (direct) return direct;

  const meta = String(row?.meta ?? '');
  const match = meta.match(/Task-PRJ-[^\s·]+/);
  return match?.[0] ?? '';
}

const rowCreateLock = new Set();

async function createTaskForProject(kfInstance, row, onPopupStateChange) {
  const projectId = resolveRowProjectId(row);
  if (!projectId) {
    kfInstance?.client?.showInfo?.('Missing project id on this row (expected e.g. PRJ-...).');
    return;
  }
  if (rowCreateLock.has(row.id)) return;

  rowCreateLock.add(row.id);
  try {
    const created = await createTaskInstance(kfInstance, projectId);
    onPopupStateChange?.(true);
    await openTaskDraft(kfInstance, created.instanceId, created.activityInstanceId);
  } catch (error) {
    console.error('[New Task] Failed:', error);
    onPopupStateChange?.(false);
    kfInstance?.client?.showInfo?.(error?.message || 'Failed to create task.');
  } finally {
    rowCreateLock.delete(row.id);
  }
}

async function createSubtaskForTask(kfInstance, row, onPopupStateChange) {
  const taskId = resolveRowTaskId(row);
  if (!taskId) {
    kfInstance?.client?.showInfo?.('Missing task id on this row (expected e.g. Task-PRJ-...).');
    return;
  }
  if (rowCreateLock.has(row.id)) return;

  rowCreateLock.add(row.id);
  try {
    const created = await createSubtaskInstance(kfInstance, taskId);
    onPopupStateChange?.(true);
    await openSubtaskDraft(kfInstance, created.instanceId, created.activityInstanceId);
  } catch (error) {
    console.error('[New Subtask] Failed:', error);
    onPopupStateChange?.(false);
    kfInstance?.client?.showInfo?.(error?.message || 'Failed to create subtask.');
  } finally {
    rowCreateLock.delete(row.id);
  }
}

async function handleAdd(kfInstance, row, rowType, onPopupStateChange) {
  if (!kfInstance || rowType === 'subtask') return;

  if (rowType === 'project') {
    await createTaskForProject(kfInstance, row, onPopupStateChange);
    return;
  }

  if (rowType === 'task') {
    await createSubtaskForTask(kfInstance, row, onPopupStateChange);
    return;
  }
}

async function openProjectDetailPopup(kfInstance, boardId, onPopupStateChange) {
  await openKfPopup(
    kfInstance,
    PROJECT_DETAIL_POPUP_ID,
    { Board_ID: boardId },
    onPopupStateChange,
  );
}

function getOpenActivityInstanceId(raw) {
  const steps = Array.isArray(raw?.Steps) ? raw.Steps : [];
  const openStep = steps.find((s) => s && s.Name === 'Open') || null;
  return {
    openStep,
    instanceId: raw?._id || null,
    activityInstanceId: openStep?._activity_instance_id || null,
  };
}

async function openIndividualTaskPopup(kfInstance, taskId, onPopupStateChange) {
  onPopupStateChange?.(true);
  try {
    const progress = await fetchIndividualTaskProgress(taskId, kfInstance);

    let instanceId = progress.instanceId;
    let activityInstanceId = progress.activityInstanceId;
    if (!activityInstanceId && progress.raw) {
      const found = getOpenActivityInstanceId(progress.raw);
      instanceId = instanceId || found.instanceId;
      activityInstanceId = found.activityInstanceId;
    }

    if (!activityInstanceId) {
      onPopupStateChange?.(false);
      kfInstance?.client?.showInfo?.('No active "Open" step found for this task — cannot open.');
      return;
    }

    await kfInstance.app.page.openPopup(INDIVIDUAL_TASK_POPUP_ID, {
      instanceId,
      activityInstanceId,
    });
  } catch (error) {
    console.error('[Individual Task Popup] Failed:', error);
    onPopupStateChange?.(false);
    kfInstance?.client?.showInfo?.(error?.message || 'Failed to open task. Please try again.');
  }
}

function FloatingAddButton({ label = 'New task', onClick, disabled = false }) {
  return (
    <button
      type="button"
      className={styles.addBtn}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        if (disabled) return;
        onClick?.();
      }}
    >
      <span className={styles.addBtnIcon}>
        <Plus size={15} />
      </span>
      <span className={styles.addBtnLabel}>{label}</span>
    </button>
  );
}

function Row({
  node,
  depth,
  expandState,
  onToggle,
  onLoadMoreChildren,
  onPopupStateChange,
  kfInstance,
}) {
  const isProject = node.type === 'project';
  const isSubtask = node.type === 'subtask';
  const isTask = node.type === 'task';
  const isClickable = isProject || isTask;
  const canExpand = isProject || isTask;
  const childState = expandState[node.id];
  const isOpen = !!childState?.open;
  const [isCreating, setIsCreating] = useState(false);

  const indentStep = 36;
  const rowIndent = depth * indentStep;
  const nameClass = isProject
    ? styles.rowNameProject
    : isSubtask
      ? styles.rowNameSubtask
      : styles.rowNameTask;

  function handleRowClick() {
    if (!kfInstance) return;
    if (isProject) {
      openProjectDetailPopup(kfInstance, node.id, onPopupStateChange);
      return;
    }
    if (isTask) {
      openIndividualTaskPopup(kfInstance, node.id, onPopupStateChange);
    }
  }

  async function handleAddClick() {
    if (isProject || isTask) {
      if (isCreating || rowCreateLock.has(node.id)) return;
      setIsCreating(true);
      try {
        await handleAdd(kfInstance, node, node.type, onPopupStateChange);
      } finally {
        setIsCreating(false);
      }
      return;
    }
    handleAdd(kfInstance, node, node.type, onPopupStateChange);
  }

  const items = childState?.items || [];
  const page = childState?.page || 1;
  const visibleChildren = items.slice(0, page * PAGE_SIZE);
  const hasMore = items.length > visibleChildren.length;

  return (
    <>
      <div
        className={`${styles.row} ${isSubtask ? styles.rowSubtask : ''} ${isClickable ? styles.rowProject : ''}`}
        onClick={isClickable ? handleRowClick : undefined}
      >
        <div className={styles.rowTitleCell} style={{ paddingLeft: 8 + rowIndent }}>
          {depth > 0 && <span className={styles.branch} />}
          {canExpand ? (
            <button
              type="button"
              className={styles.expandBtn}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(node);
              }}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
            >
              {isOpen ? (
                <span className={styles.expandOpen}>
                  <ChevronDown size={15} />
                </span>
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          ) : (
            <span style={{ width: 18, display: 'inline-block' }} />
          )}
          {isProject && (
            <div className={styles.projectIcon} style={{ background: node.iconBg }}>
              {node.initials}
            </div>
          )}
          <div className={styles.rowNameBlock}>
            <div className={`${styles.rowName} ${nameClass}`}>
              <RowBadge type={node.type} />
              <span>{node.name}</span>
            </div>
            {node.meta && <div className={styles.rowMeta}>{node.meta}</div>}
            {node.category && !node.meta && (
              <div className={styles.rowMeta}>{node.category}</div>
            )}
          </div>
        </div>
        <div>
          <Pill map={STATUS_STYLES} value={node.status} />
        </div>
        <div>
          <Pill map={PRIORITY_STYLES} value={node.priority} />
        </div>
        <div>
          <Progress value={node.progress} />
        </div>
        <div>
          <People people={node.people} extra={node.extra || 0} count={node.peopleCount} />
        </div>
        <div className={styles.dueText}>{node.due}</div>
        <div className={styles.addCell}>
          {!isSubtask && (
            <FloatingAddButton
              label={isProject ? 'New task' : 'Sub-task'}
              disabled={(isProject || isTask) && isCreating}
              onClick={handleAddClick}
            />
          )}
        </div>
      </div>

      {canExpand && isOpen && (
        <>
          {childState?.loading && (
            <div className={styles.nestedEmpty} style={{ paddingLeft: 24 + (depth + 1) * indentStep }}>
              {isProject ? 'Loading tasks…' : 'Loading subtasks…'}
            </div>
          )}
          {childState?.error && (
            <div
              className={styles.errorBox}
              style={{ marginLeft: 24 + (depth + 1) * indentStep }}
            >
              {childState.error}
            </div>
          )}
          {!childState?.loading && !childState?.error && items.length === 0 && (
            <div className={styles.nestedEmpty} style={{ paddingLeft: 24 + (depth + 1) * indentStep }}>
              {isProject ? 'No tasks for this project.' : 'No subtasks for this task.'}
            </div>
          )}
          {visibleChildren.map((c) => (
            <Row
              key={c.id}
              node={c}
              depth={depth + 1}
              expandState={expandState}
              onToggle={onToggle}
              onLoadMoreChildren={onLoadMoreChildren}
              onPopupStateChange={onPopupStateChange}
              kfInstance={kfInstance}
            />
          ))}
          {hasMore && (
            <div style={{ paddingLeft: 24 + (depth + 1) * indentStep, margin: '8px 0' }}>
              <button
                type="button"
                className={styles.loadMoreBtn}
                onClick={() => onLoadMoreChildren(node.id)}
              >
                Load more {isProject ? 'tasks' : 'subtasks'} ({items.length - visibleChildren.length}{' '}
                left)
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Dropdown({ value, onChange, options }) {
  return (
    <PtSelect
      value={value}
      onValueChange={onChange}
      className="min-w-[9rem]"
      options={(options || []).map((o) => ({
        value: String(o.value),
        label: String(o.label ?? o.value),
      }))}
    />
  );
}

function filterList(nodes, filters) {
  const { status, priority } = filters;
  return nodes.filter(
    (n) =>
      (status === 'all' || n.status === status) &&
      (priority === 'all' || n.priority === priority),
  );
}

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2, '—': 3 };
const STATUS_RANK = { Overdue: 0, 'In progress': 1, Done: 2 };

function sortList(nodes, sortBy) {
  return [...nodes].sort((a, b) => {
    if (sortBy === 'priority') {
      return (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    }
    if (sortBy === 'status') {
      return (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
    }
    if (sortBy === 'progress') {
      return (b.progress ?? 0) - (a.progress ?? 0);
    }
    if (sortBy === 'due') {
      return new Date(a.due) - new Date(b.due);
    }
    return 0;
  });
}

export default function ProjectTrackerKarthikaPage({ useLayout: useLayoutProp = false }) {
  const { embed } = useContext(ProjectTrackerEmbedContext);
  const useChromeLayout = useLayoutProp && !embed;

  const { kf: kfFromContext, sdkReady } = useContext(KissflowSDKContext);
  const kfInstance =
    kfFromContext ?? (typeof window !== 'undefined' ? window.kf : null);

  const [tab, setTab] = useState('project');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandState, setExpandState] = useState({});
  const subtasksCacheRef = useRef(null);

  const userName = kfInstance?.user?.Name || 'there';

  async function ensureSubtasksLoaded() {
    if (subtasksCacheRef.current) return subtasksCacheRef.current;
    const result = await fetchAllSubtasks(kfInstance);
    subtasksCacheRef.current = result.items;
    return subtasksCacheRef.current;
  }

  function invalidateSubtasksCache() {
    subtasksCacheRef.current = null;
  }

  useEffect(() => {
    if (!popupOpen || !kfInstance) return undefined;
    const intervalId = window.setInterval(() => {
      if (!kfInstance?.app?.page?.popup?._id) {
        setPopupOpen(false);
        invalidateSubtasksCache();
      }
    }, 400);
    return () => window.clearInterval(intervalId);
  }, [popupOpen, kfInstance]);

  useEffect(() => {
    if (!kfInstance?.context?.watchParams) return undefined;
    kfInstance.context.watchParams(() => {}, []);
    return undefined;
  }, [kfInstance]);

  useEffect(() => {
    if (!sdkReady || !kfInstance) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError('');
      setExpandState({});
      setVisibleCount(PAGE_SIZE);
      invalidateSubtasksCache();
      try {
        if (tab === 'project') {
          const result = await fetchMyProjects(kfInstance);
          if (!cancelled) setProjects(dedupeById(result.items));
        } else {
          const result = await fetchMyIndividualTasks(kfInstance);
          const subtaskResult = await fetchAllSubtasks(kfInstance);
          if (!cancelled) {
            subtasksCacheRef.current = subtaskResult.items;
            setTasks(
              dedupeById(attachSubtaskCounts(result.items, subtaskResult.items)),
            );
          }
        }
      } catch (err) {
        console.error('Failed to load data:', err);
        if (!cancelled) {
          setError(err?.message || 'Failed to load data from Kissflow');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [tab, sdkReady, kfInstance]);

  async function handleToggle(node) {
    const id = node.id;
    const current = expandState[id];

    if (current?.open) {
      setExpandState((prev) => ({
        ...prev,
        [id]: { ...prev[id], open: false },
      }));
      return;
    }

    setExpandState((prev) => ({
      ...prev,
      [id]: { open: true, loading: true, error: '', items: [], page: 1 },
    }));

    try {
      if (node.type === 'task') {
        const allSubtasks = await ensureSubtasksLoaded();
        const items = filterSubtasksForTask(allSubtasks, node.taskId || node.taskBusinessId);
        setExpandState((prev) => ({
          ...prev,
          [id]: {
            open: true,
            loading: false,
            error: '',
            items,
            page: 1,
          },
        }));
        return;
      }

      const projectId = node.projectId || node.id;
      const parentProjectId = resolveRowProjectId(node) || projectId;
      const result = await fetchProjectTasks(projectId, kfInstance);
      const allSubtasks = await ensureSubtasksLoaded();
      const items = attachSubtaskCounts(
        result.items.map((task) => ({
          ...task,
          projectId: task.projectId || parentProjectId,
        })),
        allSubtasks,
      );

      setExpandState((prev) => ({
        ...prev,
        [id]: {
          open: true,
          loading: false,
          error: '',
          items,
          page: 1,
        },
      }));
    } catch (err) {
      console.error('Failed to load nested rows:', err);
      setExpandState((prev) => ({
        ...prev,
        [id]: {
          open: true,
          loading: false,
          error: err?.message || 'Failed to load nested items',
          items: [],
          page: 1,
        },
      }));
    }
  }

  function handleLoadMoreChildren(id) {
    setExpandState((prev) => ({
      ...prev,
      [id]: { ...prev[id], page: (prev[id]?.page || 1) + 1 },
    }));
  }

  function handleNewItemClick(isProjectTab) {
    if (!kfInstance) return;
    if (isProjectTab) {
      openKfPopup(kfInstance, NEW_PROJECT_POPUP_ID, {}, setPopupOpen);
      return;
    }
    openKfPopup(kfInstance, NEW_TASK_POPUP_ID, {}, setPopupOpen);
  }

  const isProjectTab = tab === 'project';
  const rawData = isProjectTab ? projects : tasks;
  const processed = sortList(
    filterList(rawData, { status: statusFilter, priority: priorityFilter }),
    sortBy,
  );
  const visibleData = processed.slice(0, visibleCount);
  const hasMoreTop = processed.length > visibleData.length;

  const kpiTotal = processed.length;
  const kpiInProgress = processed.filter((n) => n.status === 'In progress').length;
  const kpiDone = processed.filter((n) => n.status === 'Done').length;
  const kpiOverdue = processed.filter((n) => n.status === 'Overdue').length;

  const content = (
    <div className={`${styles.page} ${popupOpen ? styles.pagePopupOpen : ''}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <div className={styles.welcome}>
              {getGreeting()}, {userName}
            </div>
            <h1 className={styles.title}>
              {isProjectTab ? 'My Projects' : 'My Tasks'}
            </h1>
            <p className={styles.subtitle}>
              {isProjectTab
                ? 'Track project-wise work with expandable tasks and subtasks.'
                : 'Manage individual tasks directly, with optional subtasks underneath.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.newBtn}
            onClick={() => handleNewItemClick(isProjectTab)}
            disabled={!sdkReady}
          >
            <Plus size={18} />
            {isProjectTab ? 'New project' : 'New task'}
          </button>
        </div>

        <div className={styles.kpiStrip}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Total</div>
            <div className={`${styles.kpiValue} ${styles.kpiBlue}`}>{kpiTotal}</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>In progress</div>
            <div className={`${styles.kpiValue} ${styles.kpiPurple}`}>{kpiInProgress}</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Completed</div>
            <div className={`${styles.kpiValue} ${styles.kpiGreen}`}>{kpiDone}</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Overdue</div>
            <div className={`${styles.kpiValue} ${styles.kpiRed}`}>{kpiOverdue}</div>
          </div>
        </div>

        <div className={styles.tabs}>
          {[
            { id: 'project', label: 'Project wise' },
            { id: 'individual', label: 'Individual tasks' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <span className={styles.filterIcon}>
              <ListFilter size={18} />
            </span>
            <span className={styles.filterLabel}>Filter</span>
            <Dropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All status' },
                { value: 'In progress', label: 'In progress' },
                { value: 'Overdue', label: 'Overdue' },
                { value: 'Done', label: 'Done' },
              ]}
            />
            <Dropdown
              value={priorityFilter}
              onChange={setPriorityFilter}
              options={[
                { value: 'all', label: 'All priority' },
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' },
              ]}
            />
          </div>
          <div className={styles.filterGroup}>
            <ArrowUpDown size={18} color="#1E88E5" />
            <span className={styles.filterLabel}>Sort</span>
            <Dropdown
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'priority', label: 'Priority' },
                { value: 'status', label: 'Status' },
                { value: 'progress', label: 'Progress' },
                { value: 'due', label: 'Due date' },
              ]}
            />
          </div>
        </div>

        {!sdkReady && (
          <div className={styles.previewBanner}>
            Preview mode — connect in a Kissflow app for live project and task data.
          </div>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.tableCard}>
          <div className={styles.tableHead}>
            <div className={styles.tableHeadFirst}>
              {isProjectTab ? 'Project / Task / Subtask' : 'Task / Subtask'}
            </div>
            <div>Status</div>
            <div>Priority</div>
            <div>Progress</div>
            <div>People</div>
            <div>Due</div>
            <div />
          </div>
          <div className={styles.tableBody}>
            {loading ? (
              <div className={styles.loadingWrap}>
                <div className={styles.skeletonRow} />
                <div className={styles.skeletonRow} />
                <div className={styles.skeletonRow} />
              </div>
            ) : visibleData.length === 0 ? (
              <div className={styles.empty}>
                No {isProjectTab ? 'projects' : 'tasks'} match these filters.
              </div>
            ) : (
              <>
                {visibleData.map((node) => (
                  <Row
                    key={node.id}
                    node={node}
                    depth={0}
                    expandState={expandState}
                    onToggle={handleToggle}
                    onLoadMoreChildren={handleLoadMoreChildren}
                    onPopupStateChange={setPopupOpen}
                    kfInstance={kfInstance}
                  />
                ))}
                {hasMoreTop && (
                  <div style={{ marginTop: 12, textAlign: 'center' }}>
                    <button
                      type="button"
                      className={styles.loadMoreBtn}
                      onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    >
                      Load more ({processed.length - visibleData.length} left)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (!useChromeLayout) return content;
  return <AppLayout>{content}</AppLayout>;
}
