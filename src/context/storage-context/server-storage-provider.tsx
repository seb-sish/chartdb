import React, { useCallback, useMemo } from 'react';
import type { StorageContext } from './storage-context';
import { storageContext } from './storage-context';

interface StorageActionResponse<T> {
    data?: T;
    error?: string;
}

const dateFieldNames = new Set(['createdAt', 'updatedAt']);

const reviveDates = (value: unknown): unknown => {
    if (Array.isArray(value)) {
        return value.map((item) => reviveDates(item));
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const revived: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
        if (dateFieldNames.has(key) && typeof item === 'string') {
            revived[key] = new Date(item);
            continue;
        }

        if (key === 'exportActions' && Array.isArray(item)) {
            revived[key] = item.map((date) =>
                typeof date === 'string' ? new Date(date) : reviveDates(date)
            );
            continue;
        }

        revived[key] = reviveDates(item);
    }

    return revived;
};

const parseStorageResponse = async <T,>(
    response: Response
): Promise<StorageActionResponse<T>> => {
    const responseText = await response.text();

    if (!responseText) {
        return {};
    }

    return JSON.parse(responseText) as StorageActionResponse<T>;
};

export const ServerStorageProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const callStorageAction = useCallback(
        async <T,>(action: string, payload?: unknown): Promise<T> => {
            const response = await fetch('/api/storage/action', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ action, payload }),
            });
            const responsePayload = await parseStorageResponse<T>(response);

            if (!response.ok) {
                throw new Error(
                    responsePayload.error ??
                        `Storage action failed: ${response.status} ${response.statusText}`
                );
            }

            return reviveDates(responsePayload.data) as T;
        },
        []
    );

    const value = useMemo<StorageContext>(
        () => ({
            getConfig: () => callStorageAction('getConfig'),
            updateConfig: (config) => callStorageAction('updateConfig', config),

            getDiagramFilter: (diagramId) =>
                callStorageAction('getDiagramFilter', { diagramId }),
            updateDiagramFilter: (diagramId, filter) =>
                callStorageAction('updateDiagramFilter', {
                    diagramId,
                    filter,
                }),
            deleteDiagramFilter: (diagramId) =>
                callStorageAction('deleteDiagramFilter', { diagramId }),

            addDiagram: (params) => callStorageAction('addDiagram', params),
            listDiagrams: (options) =>
                callStorageAction('listDiagrams', { options }),
            getDiagram: (id, options) =>
                callStorageAction('getDiagram', { id, options }),
            updateDiagram: (params) =>
                callStorageAction('updateDiagram', params),
            deleteDiagram: (id) => callStorageAction('deleteDiagram', id),

            addTable: (params) => callStorageAction('addTable', params),
            getTable: (params) => callStorageAction('getTable', params),
            updateTable: (params) => callStorageAction('updateTable', params),
            putTable: (params) => callStorageAction('putTable', params),
            deleteTable: (params) => callStorageAction('deleteTable', params),
            listTables: (diagramId) =>
                callStorageAction('listTables', diagramId),
            deleteDiagramTables: (diagramId) =>
                callStorageAction('deleteDiagramTables', diagramId),

            addRelationship: (params) =>
                callStorageAction('addRelationship', params),
            getRelationship: (params) =>
                callStorageAction('getRelationship', params),
            updateRelationship: (params) =>
                callStorageAction('updateRelationship', params),
            deleteRelationship: (params) =>
                callStorageAction('deleteRelationship', params),
            listRelationships: (diagramId) =>
                callStorageAction('listRelationships', diagramId),
            deleteDiagramRelationships: (diagramId) =>
                callStorageAction('deleteDiagramRelationships', diagramId),

            addDependency: (params) =>
                callStorageAction('addDependency', params),
            getDependency: (params) =>
                callStorageAction('getDependency', params),
            updateDependency: (params) =>
                callStorageAction('updateDependency', params),
            deleteDependency: (params) =>
                callStorageAction('deleteDependency', params),
            listDependencies: (diagramId) =>
                callStorageAction('listDependencies', diagramId),
            deleteDiagramDependencies: (diagramId) =>
                callStorageAction('deleteDiagramDependencies', diagramId),

            addArea: (params) => callStorageAction('addArea', params),
            getArea: (params) => callStorageAction('getArea', params),
            updateArea: (params) => callStorageAction('updateArea', params),
            deleteArea: (params) => callStorageAction('deleteArea', params),
            listAreas: (diagramId) => callStorageAction('listAreas', diagramId),
            deleteDiagramAreas: (diagramId) =>
                callStorageAction('deleteDiagramAreas', diagramId),

            addCustomType: (params) =>
                callStorageAction('addCustomType', params),
            getCustomType: (params) =>
                callStorageAction('getCustomType', params),
            updateCustomType: (params) =>
                callStorageAction('updateCustomType', params),
            deleteCustomType: (params) =>
                callStorageAction('deleteCustomType', params),
            listCustomTypes: (diagramId) =>
                callStorageAction('listCustomTypes', diagramId),
            deleteDiagramCustomTypes: (diagramId) =>
                callStorageAction('deleteDiagramCustomTypes', diagramId),

            addNote: (params) => callStorageAction('addNote', params),
            getNote: (params) => callStorageAction('getNote', params),
            updateNote: (params) => callStorageAction('updateNote', params),
            deleteNote: (params) => callStorageAction('deleteNote', params),
            listNotes: (diagramId) => callStorageAction('listNotes', diagramId),
            deleteDiagramNotes: (diagramId) =>
                callStorageAction('deleteDiagramNotes', diagramId),
        }),
        [callStorageAction]
    );

    return (
        <storageContext.Provider value={value}>
            {children}
        </storageContext.Provider>
    );
};
