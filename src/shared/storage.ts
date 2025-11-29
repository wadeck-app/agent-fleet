import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Task } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Racine du projet
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const TASKS_DIR = path.join(DATA_DIR, 'tasks');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');

// Assurer que les dossiers existent
[DATA_DIR, TASKS_DIR, KNOWLEDGE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export interface KnowledgeEntry {
  timestamp: string;
  category: string;
  [key: string]: any;
}

/**
 * Couche d'abstraction pour le stockage
 * Pour commencer: fichiers JSON plats
 * Peut évoluer vers SQLite/PostgreSQL plus tard
 */
export class Storage {
  /**
   * Sauvegarder une tâche
   */
  static saveTask(task: Task): void {
    const filePath = path.join(TASKS_DIR, `${task.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(task, null, 2), 'utf8');
  }

  /**
   * Charger une tâche par ID
   */
  static loadTask(taskId: string): Task | null {
    const filePath = path.join(TASKS_DIR, `${taskId}.json`);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data) as Task;
  }

  /**
   * Lister toutes les tâches
   */
  static listTasks(): Task[] {
    const files = fs.readdirSync(TASKS_DIR)
      .filter(f => f.endsWith('.json'));

    return files.map(file => {
      const data = fs.readFileSync(path.join(TASKS_DIR, file), 'utf8');
      return JSON.parse(data) as Task;
    });
  }

  /**
   * Supprimer une tâche
   */
  static deleteTask(taskId: string): void {
    const filePath = path.join(TASKS_DIR, `${taskId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Ajouter une entrée à la base de connaissance
   */
  static addKnowledge(category: string, entry: Omit<KnowledgeEntry, 'timestamp' | 'category'>): void {
    const filePath = path.join(KNOWLEDGE_DIR, `${category}.jsonl`);
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      category,
      ...entry
    }) + '\n';
    fs.appendFileSync(filePath, line, 'utf8');
  }

  /**
   * Lire la base de connaissance pour une catégorie
   */
  static readKnowledge(category: string): KnowledgeEntry[] {
    const filePath = path.join(KNOWLEDGE_DIR, `${category}.jsonl`);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as KnowledgeEntry);
  }

  /**
   * Obtenir le chemin du dossier de contexte pour une tâche
   */
  static getTaskContextDir(taskId: string): string {
    const dir = path.join(DATA_DIR, 'contexts', taskId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Obtenir le chemin vers le dossier data
   */
  static getDataDir(): string {
    return DATA_DIR;
  }
}
