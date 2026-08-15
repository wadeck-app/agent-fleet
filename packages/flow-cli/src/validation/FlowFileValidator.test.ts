import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { validateFlowFile } from './FlowFileValidator';

const SIMPLE_FLOW = path.resolve(__dirname, '../test-utils/fixtures/simple-flow.yml');
const INVALID_FLOW = path.resolve(__dirname, '../test-utils/fixtures/invalid-flow.yml');

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-validator-test-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('validateFlowFile', () => {
    it('returns exit 0 for a valid flow YAML', () => {
        const result = validateFlowFile(SIMPLE_FLOW);
        expect(result.exit).toBe(0);
    });

    it('returns exit 1 with errors for a flow with invalid dependencies', () => {
        const result = validateFlowFile(INVALID_FLOW);
        expect(result.exit).toBe(1);
        if (result.exit !== 1) throw new Error('Expected exit 1');
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns exit 2 with "File not found" for a non-existent file', () => {
        const result = validateFlowFile('/no/such/file/does-not-exist.yml');
        expect(result.exit).toBe(2);
        if (result.exit !== 2) throw new Error('Expected exit 2');
        expect(result.message).toContain('File not found');
    });

    it('returns exit 3 with parse_error type for malformed YAML', () => {
        const tmpFile = path.join(tmpDir, 'bad.yml');
        fs.writeFileSync(tmpFile, 'key: [bad yaml: {{');
        const result = validateFlowFile(tmpFile);
        expect(result.exit).toBe(3);
        if (result.exit !== 3) throw new Error('Expected exit 3');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].type).toBe('parse_error');
    });

    it('returns exit 3 with parse_error type when YAML root is an array', () => {
        const tmpFile = path.join(tmpDir, 'array.yml');
        fs.writeFileSync(tmpFile, '- item1\n- item2\n');
        const result = validateFlowFile(tmpFile);
        expect(result.exit).toBe(3);
        if (result.exit !== 3) throw new Error('Expected exit 3');
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].type).toBe('parse_error');
    });
});
