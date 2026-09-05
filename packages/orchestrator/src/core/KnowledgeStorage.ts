import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from 'shared-common/logger';
import { fileURLToPath } from 'node:url';

const log = createLogger('KnowledgeStorage');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.AGENT_FLEET_DATA_DIR || path.join(PROJECT_ROOT, 'data');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');

export interface KnowledgeEntry {
	timestamp: string;
	category: string;
	[key: string]: any;
}

export class KnowledgeStorage {
	private static async ensureDirectoryExists(dirPath: string): Promise<void> {
		try {
			await fs.promises.access(dirPath);
		} catch {
			await fs.promises.mkdir(dirPath, { recursive: true });
		}
	}

	static async initialize(): Promise<void> {
		try {
			await this.ensureDirectoryExists(DATA_DIR);
			await this.ensureDirectoryExists(KNOWLEDGE_DIR);
		} catch (error) {
			log.error('Failed to initialize directories:', error);
			throw new Error(`Failed to initialize storage: ${error instanceof Error ? String(error) : String(error)}`);
		}
	}

	static async addKnowledge(category: string, entry: Omit<KnowledgeEntry, 'timestamp' | 'category'>): Promise<void> {
		try {
			await this.ensureDirectoryExists(KNOWLEDGE_DIR);
			const filePath = path.join(KNOWLEDGE_DIR, `${category}.jsonl`);
			const line =
				JSON.stringify({
					timestamp: new Date().toISOString(),
					category,
					...entry,
				}) + '\n';
			await fs.promises.appendFile(filePath, line, 'utf8');
		} catch (error) {
			log.error(`Failed to add knowledge to ${category}:`, error);
			throw new Error(
				`Failed to add knowledge to ${category}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	static async readKnowledge(category: string): Promise<KnowledgeEntry[]> {
		try {
			const filePath = path.join(KNOWLEDGE_DIR, `${category}.jsonl`);
			const content = await fs.promises.readFile(filePath, 'utf8');
			return content
				.split('\n')
				.filter(line => line.trim())
				.map(line => JSON.parse(line) as KnowledgeEntry);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return [];
			}
			log.error(`Failed to read knowledge from ${category}:`, error);
			throw new Error(
				`Failed to read knowledge from ${category}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	static async getTaskContextDir(taskId: string): Promise<string> {
		try {
			const dir = path.join(DATA_DIR, 'contexts', taskId);
			await this.ensureDirectoryExists(dir);
			return dir;
		} catch (error) {
			log.error(`Failed to get context directory for task ${taskId}:`, error);
			throw new Error(
				`Failed to get context directory for task ${taskId}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	static getDataDir(): string {
		return DATA_DIR;
	}
}
