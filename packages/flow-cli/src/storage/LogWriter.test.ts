import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LogWriter } from './LogWriter';

interface LiveLogEntry {
    id: string;
    timestamp: number;
    level: 'debug' | 'info' | 'warning' | 'error';
    message: string;
    eventType: string;
    metadata?: Record<string, unknown>;
}

function makeEntry(overrides: Partial<LiveLogEntry> = {}): LiveLogEntry {
    return {
        id: 'entry-1',
        timestamp: Date.now(),
        level: 'info',
        message: 'hello world',
        eventType: 'log',
        ...overrides,
    };
}

function todayDate(): string {
    return new Date().toISOString().slice(0, 10);
}

describe('LogWriter', () => {
    let tmpDir: string;
    let writer: LogWriter;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-writer-'));
        writer = new LogWriter(tmpDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('write()', () => {
        it('appends an NDJSON line to today\'s date file', () => {
            const entry = makeEntry({ message: 'test message' });
            writer.write('exec01', 'step-a', entry);

            const filePath = path.join(tmpDir, `${todayDate()}.ndjson`);
            expect(fs.existsSync(filePath)).toBe(true);

            const content = fs.readFileSync(filePath, 'utf8').trim();
            expect(content.length).toBeGreaterThan(0);

            const parsed = JSON.parse(content);
            expect(parsed).toBeDefined();
        });

        it('the NDJSON line has correct prefix, level, message', () => {
            const entry = makeEntry({ level: 'error', message: 'something failed' });
            writer.write('exec01', 'step-b', entry);

            const filePath = path.join(tmpDir, `${todayDate()}.ndjson`);
            const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
            const parsed = JSON.parse(lines[lines.length - 1]);

            expect(parsed.prefix).toBe('[exec01|step-b]');
            expect(parsed.level).toBe('error');
            expect(parsed.message).toBe('something failed');
        });
    });

    describe('writeExecution()', () => {
        it('appends a line with __execution in prefix', () => {
            writer.writeExecution('exec02', 'execution started', 'info');

            const filePath = path.join(tmpDir, `${todayDate()}.ndjson`);
            const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
            const parsed = JSON.parse(lines[lines.length - 1]);

            expect(parsed.prefix).toBe('[exec02|__execution]');
            expect(parsed.message).toBe('execution started');
            expect(parsed.level).toBe('info');
        });
    });

    describe('rotate()', () => {
        it('deletes oldest files when over retainDays limit', () => {
            // Create a LogWriter with retainDays: 2
            const rotatingWriter = new LogWriter(tmpDir, 2);

            // Manually create 3 old .ndjson files with past dates
            const oldDates = ['2020-01-01', '2020-01-02', '2020-01-03'];
            for (const date of oldDates) {
                fs.writeFileSync(path.join(tmpDir, `${date}.ndjson`), '{"old":true}\n', 'utf8');
            }

            // Call write() once — this triggers rotate() internally
            const entry = makeEntry({ message: 'trigger rotation' });
            rotatingWriter.write('exec03', 'step-c', entry);

            // After rotation, there should be at most 2 ndjson files total
            const files = fs.readdirSync(tmpDir).filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f));
            expect(files.length).toBeLessThanOrEqual(2);
        });
    });
});
