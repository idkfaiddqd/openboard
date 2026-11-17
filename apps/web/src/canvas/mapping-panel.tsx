import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import type { TLShapeId, TLStore } from 'tldraw';
import type { DddMapping, DddMappingSource } from '@openboard/shared';
import { IconClose } from '../components/icons/Icons.js';
import { MappingSelectionContext, mappingPanelId } from './mapping-button.js';

function MappingSource({ source }: { source: DddMappingSource }) {
  return <div className="ddd-mapping-source">
    {source.repository !== undefined && <p className="ddd-mapping-repository">{source.repository}</p>}
    <code>{source.locator}</code>
    {source.revision !== undefined && <p><span className="ddd-mapping-label">Ревизия: </span>{source.revision}</p>}
    {source.description !== undefined && <p>{source.description}</p>}
  </div>;
}

function MappingContent({ mapping }: { mapping?: DddMapping }) {
  if (mapping === undefined) return <p className="ddd-mapping-empty">Маппинг не передан</p>;
  return <>
    {mapping.scope !== undefined && <p className="ddd-mapping-scope">{mapping.scope}</p>}
    {mapping.sources.length === 0 && mapping.sections.length === 0 && <p className="ddd-mapping-empty">Маппинг пуст</p>}
    {mapping.sources.length > 0 && <section><h3>Источники</h3>{mapping.sources.map((source, index) => <MappingSource key={index} source={source} />)}</section>}
    {mapping.sections.map((section) => <section key={section.id} className="ddd-mapping-section">
      <h3>{section.title}</h3>
      {section.entries.map((entry) => <article key={entry.id} className="ddd-mapping-entry">
        <h4>{entry.responsibility}</h4>
        {entry.explanation !== undefined && <p>{entry.explanation}</p>}
        {entry.artifacts.length > 0 && <div className="ddd-mapping-field"><h5>Артефакты</h5>{entry.artifacts.map((artifact, index) => <div key={index} className="ddd-mapping-artifact">
          <p className="ddd-mapping-role">{artifact.participation}</p>
          <MappingSource source={artifact} />
        </div>)}</div>}
        {entry.evidence.length > 0 && <div className="ddd-mapping-field"><h5>Основания</h5>{entry.evidence.map((evidence, index) => <div key={index} className="ddd-mapping-evidence">
          <p>{evidence.claim}</p>
          {evidence.repository !== undefined && <p className="ddd-mapping-repository">{evidence.repository}</p>}
          {evidence.locator !== undefined && <code>{evidence.locator}</code>}
          {evidence.revision !== undefined && <p><span className="ddd-mapping-label">Ревизия: </span>{evidence.revision}</p>}
          {evidence.method !== undefined && <p><span className="ddd-mapping-label">Метод: </span>{evidence.method}</p>}
          {evidence.limits !== undefined && <p><span className="ddd-mapping-label">Пределы: </span>{evidence.limits}</p>}
        </div>)}</div>}
        {entry.gaps.length > 0 && <div className="ddd-mapping-field"><h5>Пробелы знания</h5><ul>{entry.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></div>}
      </article>)}
    </section>)}
  </>;
}

/** Selection belongs to this mounted board view; mapping belongs to its live document store. */
export function MappingPanelLayout({ store, children }: { store: TLStore; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const subscribe = useCallback((changed: () => void) => store.listen(changed, { scope: 'document' }), [store]);
  const getSnapshot = useCallback(() => selectedId ? store.get(selectedId as TLShapeId) : undefined, [store, selectedId]);
  const record = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const shape = record?.typeName === 'shape' ? record as typeof record & { props: { name?: string; label?: string; mapping?: DddMapping } } : undefined;
  const close = useCallback((restoreFocus: boolean) => {
    setSelectedId(null);
    if (restoreFocus && origin.current?.isConnected && selectedId && store.get(selectedId as TLShapeId)) origin.current.focus();
    origin.current = null;
  }, [selectedId, store]);
  useEffect(() => { if (selectedId && !shape) close(false); }, [selectedId, shape, close]);
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [selectedId, close]);
  const selection = useMemo(() => ({ selectedId, toggle: (id: string, button: HTMLButtonElement) => {
    origin.current = button;
    setSelectedId((previous) => previous === id ? null : id);
  } }), [selectedId]);
  return <MappingSelectionContext.Provider value={selection}>
    <div className="ddd-mapping-layout" data-mapping-open={Boolean(shape)}>
      <div className="ddd-mapping-canvas">{children}</div>
      <aside id={mappingPanelId} className="ddd-mapping-panel" hidden={!shape} aria-label="Полный маппинг фигуры">
        {shape && <>
          <header className="ddd-mapping-panel-top"><h2>Маппинг</h2><button type="button" className="ddd-mapping-close" aria-label="Закрыть панель маппинга" onClick={() => close(true)}><IconClose size={18} aria-hidden="true" /></button></header>
          <div key={shape.id} className="ddd-mapping-panel-content">
            <p className="ddd-mapping-subject">{shape.props.name || shape.props.label || shape.id}</p>
            <p className="ddd-mapping-label">{shape.type}</p>
            <MappingContent mapping={shape.props.mapping} />
          </div>
        </>}
      </aside>
    </div>
  </MappingSelectionContext.Provider>;
}
