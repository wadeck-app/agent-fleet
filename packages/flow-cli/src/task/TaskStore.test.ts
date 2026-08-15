import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TaskStore } from './TaskStore';

describe('TaskStore', () => {
    let tmpDir: string;
    let store: TaskStore;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-store-'));
        store = new TaskStore(tmpDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('create()', () => {
        it('creates a task record with status created and initial history entry', () => {
            const record = store.create('My first task');

            expect(record.title).toBe('My first task');
            expect(record.status).toBe('created');
            expect(record.history).toHaveLength(1);
            expect(record.history[0].status).toBe('created');
            expect(record.id).toMatch(/^[a-z0-9]{8}$/);

            const filePath = path.join(tmpDir, `${record.id}.json`);
            expect(fs.existsSync(filePath)).toBe(true);
        });

        it('adds the task to the index', () => {
            const record = store.create('Indexed task');
            const tasks = store.list();

            expect(tasks).toHaveLength(1);
            expect(tasks[0].id).toBe(record.id);
            expect(tasks[0].title).toBe('Indexed task');
            expect(tasks[0].status).toBe('created');
        });
    });

    describe('get()', () => {
        it('retrieves an existing task by id', () => {
            const created = store.create('Fetchable task');
            const fetched = store.get(created.id);

            expect(fetched.id).toBe(created.id);
            expect(fetched.title).toBe('Fetchable task');
            expect(fetched.status).toBe('created');
        });

        it('throws Task not found: <id> on missing id', () => {
            expect(() => store.get('nonexistent-id')).toThrow('Task not found: nonexistent-id');
        });
    });

    describe('updateStatus()', () => {
        it('updates status and adds a history entry', () => {
            const record = store.create('Status task');
            const updated = store.updateStatus(record.id, 'in-progress');

            expect(updated.status).toBe('in-progress');
            expect(updated.history).toHaveLength(2);
            expect(updated.history[1].status).toBe('in-progress');
            expect(updated.updatedAt).not.toBe(record.updatedAt);
        });

        it('updates the index entry status', () => {
            const record = store.create('Index-status task');
            store.updateStatus(record.id, 'done');

            const tasks = store.list();
            const found = tasks.find(t => t.id === record.id);
            expect(found?.status).toBe('done');
        });
    });

    describe('list()', () => {
        it('returns empty array when no tasks exist', () => {
            const tasks = store.list();
            expect(tasks).toEqual([]);
        });

        it('returns all created tasks', () => {
            store.create('Task one');
            store.create('Task two');
            store.create('Task three');

            const tasks = store.list();
            expect(tasks).toHaveLength(3);

            const titles = tasks.map(t => t.title);
            expect(titles).toContain('Task one');
            expect(titles).toContain('Task two');
            expect(titles).toContain('Task three');
        });
    });
});
