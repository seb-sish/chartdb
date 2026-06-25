import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const host = process.env.STORAGE_HOST ?? '0.0.0.0';
const port = Number(process.env.STORAGE_PORT ?? 3001);
const dataDir = path.resolve(process.env.STORAGE_DATA_DIR ?? './data');
const diagramsDir = path.join(dataDir, 'diagrams');
const filtersDir = path.join(dataDir, 'diagram-filters');
const configPath = path.join(dataDir, 'config.json');

const collections = {
    tables: 'tables',
    relationships: 'relationships',
    dependencies: 'dependencies',
    areas: 'areas',
    customTypes: 'customTypes',
    notes: 'notes',
};

let actionQueue = Promise.resolve();

const enqueue = (work) => {
    const result = actionQueue.then(work, work);
    actionQueue = result.catch(() => undefined);
    return result;
};

const ensureStorage = async () => {
    await Promise.all([
        fs.mkdir(diagramsDir, { recursive: true }),
        fs.mkdir(filtersDir, { recursive: true }),
    ]);
};

const safeId = (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9_-]+$/i.test(id)) {
        throw new Error(`Invalid storage id: ${String(id)}`);
    }

    return id;
};

const jsonPath = (dir, id) => path.join(dir, `${safeId(id)}.json`);
const diagramPath = (id) => jsonPath(diagramsDir, id);
const filterPath = (id) => jsonPath(filtersDir, id);

const readJson = async (filePath, fallback) => {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return fallback;
        }
        throw error;
    }
};

const writeJson = async (filePath, value) => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, filePath);
};

const deleteFile = async (filePath) => {
    try {
        await fs.unlink(filePath);
    } catch (error) {
        if (error?.code !== 'ENOENT') {
            throw error;
        }
    }
};

const listDiagramIds = async () => {
    await ensureStorage();
    const entries = await fs.readdir(diagramsDir, { withFileTypes: true });

    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => path.basename(entry.name, '.json'))
        .sort((a, b) => a.localeCompare(b));
};

const readDiagram = async (id) => {
    return readJson(diagramPath(id), undefined);
};

const writeDiagram = async (diagram) => {
    if (!diagram?.id) {
        throw new Error('Diagram id is required');
    }

    await writeJson(diagramPath(diagram.id), normalizeDiagram(diagram));
};

const normalizeDiagram = (diagram) => ({
    ...diagram,
    tables: diagram.tables ?? [],
    relationships: diagram.relationships ?? [],
    dependencies: diagram.dependencies ?? [],
    areas: diagram.areas ?? [],
    customTypes: diagram.customTypes ?? [],
    notes: diagram.notes ?? [],
});

const projectDiagram = (diagram, options = {}) => {
    if (!diagram) {
        return undefined;
    }

    const projected = {
        id: diagram.id,
        name: diagram.name,
        databaseType: diagram.databaseType,
        databaseEdition: diagram.databaseEdition,
        createdAt: diagram.createdAt,
        updatedAt: diagram.updatedAt,
    };

    if (options.includeTables) {
        projected.tables = diagram.tables ?? [];
    }
    if (options.includeRelationships) {
        projected.relationships = [...(diagram.relationships ?? [])].sort(
            (a, b) => (a.name ?? '').localeCompare(b.name ?? '')
        );
    }
    if (options.includeDependencies) {
        projected.dependencies = diagram.dependencies ?? [];
    }
    if (options.includeAreas) {
        projected.areas = diagram.areas ?? [];
    }
    if (options.includeCustomTypes) {
        projected.customTypes = [...(diagram.customTypes ?? [])].sort((a, b) =>
            (a.name ?? '').localeCompare(b.name ?? '')
        );
    }
    if (options.includeNotes) {
        projected.notes = diagram.notes ?? [];
    }

    return projected;
};

const getConfig = async () => {
    const storedConfig = await readJson(configPath, undefined);
    if (storedConfig) {
        return storedConfig;
    }

    const [defaultDiagramId = ''] = await listDiagramIds();
    const config = { id: 1, defaultDiagramId };
    await writeJson(configPath, config);

    return config;
};

const updateConfig = async (config) => {
    const current = await getConfig();
    await writeJson(configPath, { ...current, ...config, id: 1 });
};

const getDiagramOrThrow = async (diagramId) => {
    const diagram = await readDiagram(diagramId);
    if (!diagram) {
        throw new Error(`Diagram not found: ${diagramId}`);
    }

    return normalizeDiagram(diagram);
};

const upsertById = (items, item) => [
    ...items.filter((current) => current.id !== item.id),
    item,
];

const updateCollectionItem = async (collection, id, attributes) => {
    const diagramIds = await listDiagramIds();

    for (const diagramId of diagramIds) {
        const diagram = normalizeDiagram(await readDiagram(diagramId));
        const items = diagram[collection] ?? [];
        const itemIndex = items.findIndex((item) => item.id === id);

        if (itemIndex === -1) {
            continue;
        }

        diagram[collection] = items.map((item, index) =>
            index === itemIndex ? { ...item, ...attributes } : item
        );
        await writeDiagram(diagram);
        return;
    }
};

const getCollectionItem = async (diagramId, collection, id) => {
    const diagram = await getDiagramOrThrow(diagramId);
    return (diagram[collection] ?? []).find((item) => item.id === id);
};

const addCollectionItem = async (diagramId, collection, item) => {
    const diagram = await getDiagramOrThrow(diagramId);
    diagram[collection] = upsertById(diagram[collection] ?? [], item);
    await writeDiagram(diagram);
};

const putCollectionItem = addCollectionItem;

const deleteCollectionItem = async (diagramId, collection, id) => {
    const diagram = await getDiagramOrThrow(diagramId);
    diagram[collection] = (diagram[collection] ?? []).filter(
        (item) => item.id !== id
    );
    await writeDiagram(diagram);
};

const listCollection = async (diagramId, collection) => {
    const diagram = await getDiagramOrThrow(diagramId);
    const items = diagram[collection] ?? [];

    if (collection === collections.relationships) {
        return [...items].sort((a, b) =>
            (a.name ?? '').localeCompare(b.name ?? '')
        );
    }

    if (collection === collections.customTypes) {
        return [...items].sort((a, b) =>
            (a.name ?? '').localeCompare(b.name ?? '')
        );
    }

    return items;
};

const clearCollection = async (diagramId, collection) => {
    const diagram = await getDiagramOrThrow(diagramId);
    diagram[collection] = [];
    await writeDiagram(diagram);
};

const actions = {
    getConfig: async () => getConfig(),
    updateConfig: async (config) => updateConfig(config),

    getDiagramFilter: async ({ diagramId }) =>
        readJson(filterPath(diagramId), undefined),
    updateDiagramFilter: async ({ diagramId, filter }) =>
        writeJson(filterPath(diagramId), { diagramId, ...filter }),
    deleteDiagramFilter: async ({ diagramId }) =>
        deleteFile(filterPath(diagramId)),

    addDiagram: async ({ diagram }) => writeDiagram(diagram),
    listDiagrams: async ({ options }) => {
        const diagramIds = await listDiagramIds();
        const diagrams = await Promise.all(
            diagramIds.map(async (id) =>
                projectDiagram(await readDiagram(id), options)
            )
        );
        return diagrams.filter(Boolean);
    },
    getDiagram: async ({ id, options }) =>
        projectDiagram(await readDiagram(id), options),
    updateDiagram: async ({ id, attributes }) => {
        const diagram = await readDiagram(id);
        if (!diagram) {
            return;
        }

        const nextDiagram = normalizeDiagram({ ...diagram, ...attributes });

        if (attributes.id && attributes.id !== id) {
            await deleteFile(diagramPath(id));
            const oldFilter = await readJson(filterPath(id), undefined);
            if (oldFilter) {
                await deleteFile(filterPath(id));
                await writeJson(filterPath(attributes.id), {
                    ...oldFilter,
                    diagramId: attributes.id,
                });
            }
        }

        await writeDiagram(nextDiagram);
    },
    deleteDiagram: async (id) => {
        await Promise.all([
            deleteFile(diagramPath(id)),
            deleteFile(filterPath(id)),
        ]);
    },

    addTable: async ({ diagramId, table }) =>
        addCollectionItem(diagramId, collections.tables, table),
    getTable: async ({ diagramId, id }) =>
        getCollectionItem(diagramId, collections.tables, id),
    updateTable: async ({ id, attributes }) =>
        updateCollectionItem(collections.tables, id, attributes),
    putTable: async ({ diagramId, table }) =>
        putCollectionItem(diagramId, collections.tables, table),
    deleteTable: async ({ diagramId, id }) =>
        deleteCollectionItem(diagramId, collections.tables, id),
    listTables: async (diagramId) =>
        listCollection(diagramId, collections.tables),
    deleteDiagramTables: async (diagramId) =>
        clearCollection(diagramId, collections.tables),

    addRelationship: async ({ diagramId, relationship }) =>
        addCollectionItem(diagramId, collections.relationships, relationship),
    getRelationship: async ({ diagramId, id }) =>
        getCollectionItem(diagramId, collections.relationships, id),
    updateRelationship: async ({ id, attributes }) =>
        updateCollectionItem(collections.relationships, id, attributes),
    deleteRelationship: async ({ diagramId, id }) =>
        deleteCollectionItem(diagramId, collections.relationships, id),
    listRelationships: async (diagramId) =>
        listCollection(diagramId, collections.relationships),
    deleteDiagramRelationships: async (diagramId) =>
        clearCollection(diagramId, collections.relationships),

    addDependency: async ({ diagramId, dependency }) =>
        addCollectionItem(diagramId, collections.dependencies, dependency),
    getDependency: async ({ diagramId, id }) =>
        getCollectionItem(diagramId, collections.dependencies, id),
    updateDependency: async ({ id, attributes }) =>
        updateCollectionItem(collections.dependencies, id, attributes),
    deleteDependency: async ({ diagramId, id }) =>
        deleteCollectionItem(diagramId, collections.dependencies, id),
    listDependencies: async (diagramId) =>
        listCollection(diagramId, collections.dependencies),
    deleteDiagramDependencies: async (diagramId) =>
        clearCollection(diagramId, collections.dependencies),

    addArea: async ({ diagramId, area }) =>
        addCollectionItem(diagramId, collections.areas, area),
    getArea: async ({ diagramId, id }) =>
        getCollectionItem(diagramId, collections.areas, id),
    updateArea: async ({ id, attributes }) =>
        updateCollectionItem(collections.areas, id, attributes),
    deleteArea: async ({ diagramId, id }) =>
        deleteCollectionItem(diagramId, collections.areas, id),
    listAreas: async (diagramId) =>
        listCollection(diagramId, collections.areas),
    deleteDiagramAreas: async (diagramId) =>
        clearCollection(diagramId, collections.areas),

    addCustomType: async ({ diagramId, customType }) =>
        addCollectionItem(diagramId, collections.customTypes, customType),
    getCustomType: async ({ diagramId, id }) =>
        getCollectionItem(diagramId, collections.customTypes, id),
    updateCustomType: async ({ id, attributes }) =>
        updateCollectionItem(collections.customTypes, id, attributes),
    deleteCustomType: async ({ diagramId, id }) =>
        deleteCollectionItem(diagramId, collections.customTypes, id),
    listCustomTypes: async (diagramId) =>
        listCollection(diagramId, collections.customTypes),
    deleteDiagramCustomTypes: async (diagramId) =>
        clearCollection(diagramId, collections.customTypes),

    addNote: async ({ diagramId, note }) =>
        addCollectionItem(diagramId, collections.notes, note),
    getNote: async ({ diagramId, id }) =>
        getCollectionItem(diagramId, collections.notes, id),
    updateNote: async ({ id, attributes }) =>
        updateCollectionItem(collections.notes, id, attributes),
    deleteNote: async ({ diagramId, id }) =>
        deleteCollectionItem(diagramId, collections.notes, id),
    listNotes: async (diagramId) =>
        listCollection(diagramId, collections.notes),
    deleteDiagramNotes: async (diagramId) =>
        clearCollection(diagramId, collections.notes),
};

const readRequestBody = async (request) => {
    const chunks = [];

    for await (const chunk of request) {
        chunks.push(chunk);
    }

    if (chunks.length === 0) {
        return {};
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const sendJson = (response, statusCode, data) => {
    response.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
    });
    response.end(JSON.stringify(data));
};

const server = createServer(async (request, response) => {
    try {
        if (request.method === 'OPTIONS') {
            sendJson(response, 204, {});
            return;
        }

        if (request.method === 'GET' && request.url === '/api/health') {
            sendJson(response, 200, { ok: true });
            return;
        }

        if (
            request.method !== 'POST' ||
            request.url !== '/api/storage/action'
        ) {
            sendJson(response, 404, { error: 'Not found' });
            return;
        }

        const { action, payload } = await readRequestBody(request);
        const handler = actions[action];

        if (!handler) {
            sendJson(response, 400, { error: `Unknown action: ${action}` });
            return;
        }

        const data = await enqueue(() => handler(payload));
        sendJson(response, 200, { data });
    } catch (error) {
        console.error(error);
        sendJson(response, 500, {
            error: error instanceof Error ? error.message : String(error),
        });
    }
});

await ensureStorage();

server.listen(port, host, () => {
    console.log(`ChartDB local storage server listening on ${host}:${port}`);
    console.log(`Persisting diagrams in ${dataDir}`);
});
